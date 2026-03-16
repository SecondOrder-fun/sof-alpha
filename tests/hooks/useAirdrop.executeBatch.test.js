// tests/hooks/useAirdrop.executeBatch.test.js
// Verify useAirdrop uses the same executeBatch + fallback pattern as buy/sell

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExecuteBatch = vi.fn();
const mockWriteContractAsync = vi.fn();

vi.mock("@/hooks/useSmartTransactions", () => ({
  useSmartTransactions: () => ({
    executeBatch: mockExecuteBatch,
  }),
}));

const mockInvalidateQueries = vi.fn();
const mockRefetchHasClaimed = vi.fn();
const mockRefetchLastDaily = vi.fn();

let hasClaimedValue = true; // default: already claimed (for daily tests)

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xUser", isConnected: true }),
  useWriteContract: () => ({ writeContractAsync: mockWriteContractAsync }),
  useReadContract: vi.fn(({ functionName }) => {
    const defaults = {
      hasClaimed: { data: hasClaimedValue, refetch: mockRefetchHasClaimed },
      lastDailyClaim: { data: 0n, refetch: mockRefetchLastDaily },
      cooldown: { data: 0n },
      initialAmount: { data: 1000000000000000000000n },
      basicAmount: { data: 500000000000000000000n },
      dailyAmount: { data: 100000000000000000000n },
    };
    return defaults[functionName] || { data: undefined };
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

vi.mock("@/config/contracts", () => ({
  getContractAddresses: () => ({ SOF_AIRDROP: "0xAirdrop", SOF: "0xSOF" }),
}));

vi.mock("@/lib/wagmi", () => ({
  getStoredNetworkKey: () => "testnet",
}));

vi.mock("@/utils/abis", () => ({
  SOFAirdropAbi: [
    {
      type: "function",
      name: "claimInitial",
      inputs: [
        { name: "fid", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "v", type: "uint8" },
        { name: "r", type: "bytes32" },
        { name: "s", type: "bytes32" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "claimInitialBasic",
      inputs: [],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "claimDaily",
      inputs: [],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ],
}));

vi.mock("@/context/farcasterContext", () => ({
  default: { _currentValue: null },
}));

// ── Tests ───────────────────────────────────────────────────────────────────

describe("useAirdrop - ERC-5792 executeBatch (buy/sell pattern)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    hasClaimedValue = true;
    mockExecuteBatch.mockResolvedValue("0xBatchId");
    mockWriteContractAsync.mockResolvedValue("0xTxHash");
    mockRefetchHasClaimed.mockResolvedValue({ data: true });
    mockRefetchLastDaily.mockResolvedValue({ data: 0n });
  });

  test("claimDaily calls executeBatch with encoded airdrop call", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    const [calls] = mockExecuteBatch.mock.calls[0];
    expect(calls[0]).toHaveProperty("to", "0xAirdrop");
    expect(calls[0]).toHaveProperty("data");
  });

  test("claimDaily sets isSuccess immediately when executeBatch resolves", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isSuccess).toBe(true);
    expect(result.current.claimDailyState.isPending).toBe(false);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["sofBalance"] });
  });

  test("claimInitialBasic calls executeBatch and sets success on resolve", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    expect(result.current.claimInitialState.isSuccess).toBe(true);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["sofBalance"] });
  });

  test("re-throws user rejection (code 4001) without fallback", async () => {
    const userRejection = new Error("User rejected");
    userRejection.code = 4001;
    mockExecuteBatch.mockRejectedValue(userRejection);

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isError).toBe(true);
    expect(result.current.claimDailyState.error).toContain("User rejected");
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  test("falls back to writeContractAsync when executeBatch fails", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("Batch execution timeout"));

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xAirdrop",
        functionName: "claimDaily",
      })
    );
    // writeContractAsync resolved → success
    expect(result.current.claimDailyState.isSuccess).toBe(true);
  });

  test("claimInitialBasic falls back to writeContractAsync on batch failure", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("Unsupported"));

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xAirdrop",
        functionName: "claimInitialBasic",
      })
    );
    expect(result.current.claimInitialState.isSuccess).toBe(true);
  });

  test("sets error when both executeBatch and writeContractAsync fail", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("Batch timeout"));
    mockWriteContractAsync.mockRejectedValue(new Error("Insufficient funds"));

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isError).toBe(true);
    expect(result.current.claimDailyState.error).toContain("Insufficient funds");
  });
});
