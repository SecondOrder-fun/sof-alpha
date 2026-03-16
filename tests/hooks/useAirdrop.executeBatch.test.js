// tests/hooks/useAirdrop.executeBatch.test.js
// TDD: Verify useAirdrop uses executeBatch and waits for on-chain confirmation

import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockExecuteBatch = vi.fn();

// Mutable callsStatus — update .current to simulate confirmation
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

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0xUser", isConnected: true }),
  useReadContract: vi.fn(({ functionName }) => {
    const defaults = {
      hasClaimed: { data: true, refetch: mockRefetchHasClaimed },
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

    // executeBatch resolved, but callsStatus is not CONFIRMED yet
    // Should still be pending (waiting for on-chain confirmation)
    expect(result.current.claimDailyState.isPending).toBe(true);
    expect(result.current.claimDailyState.isSuccess).toBe(false);
  });

  test("claimDaily sets isSuccess only after callsStatus is CONFIRMED", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result, rerender } = renderHook(() => useAirdrop());

    // Submit the claim
    await act(async () => {
      await result.current.claimDaily();
    });

    expect(result.current.claimDailyState.isPending).toBe(true);
    expect(result.current.claimDailyState.isSuccess).toBe(false);

    // Simulate on-chain confirmation
    callsStatusRef.current = { status: "CONFIRMED" };
    await act(async () => {
      rerender();
    });

    // NOW it should be success
    expect(result.current.claimDailyState.isSuccess).toBe(true);
    expect(result.current.claimDailyState.isPending).toBe(false);
  });

  test("invalidateQueries is called only after confirmation, not on submit", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result, rerender } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimDaily();
    });

    // Should NOT have invalidated yet
    expect(mockInvalidateQueries).not.toHaveBeenCalled();

    // Simulate confirmation
    callsStatusRef.current = { status: "CONFIRMED" };
    await act(async () => {
      rerender();
    });

    // NOW queries should be invalidated
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["sofBalance"] });
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

  test("claimInitialBasic refetches hasClaimed only after confirmation", async () => {
    const { useAirdrop } = await import("@/hooks/useAirdrop");
    const { result, rerender } = renderHook(() => useAirdrop());

    await act(async () => {
      await result.current.claimInitialBasic();
    });

    // Should NOT have refetched yet
    expect(mockRefetchHasClaimed).not.toHaveBeenCalled();

    // Simulate confirmation
    callsStatusRef.current = { status: "CONFIRMED" };
    await act(async () => {
      rerender();
    });

    // NOW hasClaimed should be refetched
    expect(mockRefetchHasClaimed).toHaveBeenCalled();
    expect(result.current.claimInitialState.isSuccess).toBe(true);
  });
});
