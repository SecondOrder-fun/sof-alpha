// tests/hooks/useAirdrop.executeBatch.test.js
// TDD: Verify useAirdrop uses executeBatch (ERC-5792) instead of raw writeContractAsync

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExecuteBatch = vi.fn();
const mockCallsStatus = { status: undefined };

vi.mock("@/hooks/useSmartTransactions", () => ({
  useSmartTransactions: () => ({
    executeBatch: mockExecuteBatch,
    callsStatus: mockCallsStatus,
    batchId: null,
  }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xUser", isConnected: true }),
  useReadContract: vi.fn(({ functionName }) => {
    const defaults = {
      hasClaimed: { data: true, refetch: vi.fn() },
      lastDailyClaim: { data: 0n, refetch: vi.fn() },
      cooldown: { data: 0n },
      initialAmount: { data: 1000000000000000000000n },
      basicAmount: { data: 500000000000000000000n },
      dailyAmount: { data: 100000000000000000000n },
    };
    return defaults[functionName] || { data: undefined };
  }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
    mockExecuteBatch.mockResolvedValue("0xBatchId");
  });

  test("claimDaily calls executeBatch with encoded airdrop call", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(mockExecuteBatch).toHaveBeenCalledTimes(1);
    const [calls] = mockExecuteBatch.mock.calls[0];
    // Should pass an array of call objects with `to` and `data`
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

  test("claimDaily does NOT use raw writeContractAsync", async () => {
    const wagmi = await import("wagmi");
    const mockWriteContract = vi.fn();
    vi.mocked(wagmi.useWriteContract).mockReturnValue?.({
      writeContractAsync: mockWriteContract,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    // writeContractAsync should NOT be called — executeBatch should be used instead
    expect(mockExecuteBatch).toHaveBeenCalled();
  });

  test("claimDaily sets isPending while waiting, then isSuccess on completion", async () => {
    let resolveExec;
    mockExecuteBatch.mockImplementation(
      () => new Promise((resolve) => { resolveExec = resolve; })
    );

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    // Start the claim
    let claimPromise;
    act(() => {
      claimPromise = result.current.claimDaily();
    });

    // Should be pending
    expect(result.current.claimDailyState.isPending).toBe(true);

    // Resolve the batch
    await act(async () => {
      resolveExec("0xBatchId");
      await claimPromise;
    });

    // Should be success
    expect(result.current.claimDailyState.isSuccess).toBe(true);
    expect(result.current.claimDailyState.isPending).toBe(false);
  });

  test("claimDaily sets isError with message on failure", async () => {
    mockExecuteBatch.mockRejectedValue(new Error("User rejected"));

    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isError).toBe(true);
    expect(result.current.claimDailyState.error).toContain("User rejected");
  });
});
