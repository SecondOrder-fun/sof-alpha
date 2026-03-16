// tests/hooks/useAirdrop.executeBatch.test.js
// TDD: Verify useAirdrop uses executeBatch with dual-path confirmation

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExecuteBatch = vi.fn();
const mockWriteContractAsync = vi.fn();
let callsStatusRef = { current: undefined };

vi.mock("@/hooks/useSmartTransactions", () => ({
  useSmartTransactions: () => ({
    executeBatch: mockExecuteBatch,
    callsStatus: callsStatusRef.current,
    batchId: null,
  }),
}));

const mockInvalidateQueries = vi.fn();
const mockRefetchHasClaimed = vi.fn();
const mockRefetchLastDaily = vi.fn();

// Track hasClaimed state for on-chain polling simulation
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

describe("useAirdrop - ERC-5792 executeBatch integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    callsStatusRef.current = undefined;
    hasClaimedValue = true;
    mockExecuteBatch.mockResolvedValue("0xBatchId");
    mockWriteContractAsync.mockResolvedValue("0xTxHash");
    mockRefetchHasClaimed.mockResolvedValue({ data: hasClaimedValue });
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
    expect(calls).toBeInstanceOf(Array);
    expect(calls[0]).toHaveProperty("to", "0xAirdrop");
    expect(calls[0]).toHaveProperty("data");
  });

  test("claimInitialBasic calls executeBatch with encoded airdrop call", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    const [calls] = mockExecuteBatch.mock.calls[0];
    expect(calls[0]).toHaveProperty("to", "0xAirdrop");
  });

  test("claimDaily stays isPending after executeBatch resolves (waiting for confirmation)", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    // executeBatch resolved, but not confirmed yet
    expect(result.current.claimDailyState.isPending).toBe(true);
    expect(result.current.claimDailyState.isSuccess).toBe(false);
  });

  test("Path 1: confirms via callsStatus (ERC-5792 wallets)", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result, rerender } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isPending).toBe(true);

    // Simulate ERC-5792 confirmation
    callsStatusRef.current = { status: "CONFIRMED" };
    await act(async () => {
      rerender();
    });

    expect(result.current.claimDailyState.isSuccess).toBe(true);
    expect(result.current.claimDailyState.isPending).toBe(false);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["sofBalance"] });
  });

  test("Path 2: confirms via on-chain state polling (Farcaster fallback)", async () => {
    vi.useFakeTimers();

    // For initial claim: hasClaimed starts false, becomes true after mining
    hasClaimedValue = false;
    mockRefetchHasClaimed.mockResolvedValue({ data: false });

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    expect(result.current.claimInitialState.isPending).toBe(true);

    // Simulate on-chain confirmation: next refetch returns hasClaimed = true
    mockRefetchHasClaimed.mockResolvedValue({ data: true });

    // Advance timers to trigger the 2s poll interval
    await act(async () => {
      vi.advanceTimersByTime(2100);
      // Flush the promise queue for the async refetch
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.claimInitialState.isSuccess).toBe(true);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["sofBalance"] });

    vi.useRealTimers();
  });

  test("claimDaily re-throws user rejection (code 4001) without fallback", async () => {
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
    // Should NOT have tried writeContractAsync fallback
    expect(mockWriteContractAsync).not.toHaveBeenCalled();
  });

  test("claimDaily falls back to writeContractAsync when executeBatch times out", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("Batch execution timeout"));
    mockWriteContractAsync.mockResolvedValue("0xFallbackHash");

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    // Should have tried executeBatch first, then fallen back
    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xAirdrop",
        functionName: "claimDaily",
      })
    );
    // Should still be pending (waiting for on-chain confirmation)
    expect(result.current.claimDailyState.isPending).toBe(true);
  });

  test("claimInitialBasic falls back to writeContractAsync when executeBatch fails", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("Wallet does not support batch calls"));
    mockWriteContractAsync.mockResolvedValue("0xFallbackHash");

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledTimes(1);
    expect(mockWriteContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xAirdrop",
        functionName: "claimInitialBasic",
      })
    );
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

  test("does not invalidate queries until confirmation", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(mockInvalidateQueries).not.toHaveBeenCalled();
  });
});
