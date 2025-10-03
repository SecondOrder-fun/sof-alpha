// tests/hooks/useRaffleHolders.probability.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRaffleHolders } from '@/hooks/useRaffleHolders';

// Mock viem
vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    getBlockNumber: vi.fn(() => Promise.resolve(1000n)),
    getLogs: vi.fn(() => Promise.resolve([])),
    getBlock: vi.fn(() => Promise.resolve({ timestamp: 1234567890n })),
  })),
  http: vi.fn(),
  parseAbiItem: vi.fn(() => ({})),
}));

// Mock network config
vi.mock('@/lib/wagmi', () => ({
  getStoredNetworkKey: vi.fn(() => 'local'),
}));

vi.mock('@/config/networks', () => ({
  getNetworkByKey: vi.fn(() => ({
    id: 31337,
    name: 'Local',
    rpcUrl: 'http://localhost:8545',
  })),
}));

describe('useRaffleHolders - Probability Recalculation', () => {
  let queryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should recalculate all probabilities when total tickets change', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient();

    // Mock events: 3 users with different ticket counts
    mockClient.getLogs.mockResolvedValue([
      {
        args: {
          seasonId: 1n,
          player: '0x1111111111111111111111111111111111111111',
          oldTickets: 0n,
          newTickets: 100n,
          totalTickets: 100n,
          probabilityBps: 10000, // 100% at this point
        },
        blockNumber: 100n,
        logIndex: 0,
      },
      {
        args: {
          seasonId: 1n,
          player: '0x2222222222222222222222222222222222222222',
          oldTickets: 0n,
          newTickets: 100n,
          totalTickets: 200n,
          probabilityBps: 5000, // 50% at this point
        },
        blockNumber: 101n,
        logIndex: 0,
      },
      {
        args: {
          seasonId: 1n,
          player: '0x3333333333333333333333333333333333333333',
          oldTickets: 0n,
          newTickets: 100n,
          totalTickets: 300n,
          probabilityBps: 3333, // 33.33% at this point
        },
        blockNumber: 102n,
        logIndex: 0,
      },
    ]);

    const { result } = renderHook(
      () => useRaffleHolders('0xCurveAddress', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.holders).toBeDefined();
    });

    const holders = result.current.holders;

    // All holders should have recalculated probabilities based on CURRENT total (300)
    expect(holders).toHaveLength(3);
    
    // Each holder has 100 tickets out of 300 total = 3333 bps (33.33%)
    holders.forEach(holder => {
      expect(holder.winProbabilityBps).toBe(3333);
    });

    // Verify total tickets
    expect(result.current.totalTickets).toBe(300n);

    // Probabilities should sum to ~10000 (allowing for rounding)
    const totalProb = holders.reduce((sum, h) => sum + h.winProbabilityBps, 0);
    expect(totalProb).toBeGreaterThanOrEqual(9999);
    expect(totalProb).toBeLessThanOrEqual(10000);
  });

  it('should handle single holder correctly', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient();

    mockClient.getLogs.mockResolvedValue([
      {
        args: {
          seasonId: 1n,
          player: '0x1111111111111111111111111111111111111111',
          oldTickets: 0n,
          newTickets: 500n,
          totalTickets: 500n,
          probabilityBps: 10000,
        },
        blockNumber: 100n,
        logIndex: 0,
      },
    ]);

    const { result } = renderHook(
      () => useRaffleHolders('0xCurveAddress', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.holders).toHaveLength(1);
    });

    // Single holder should have 100% probability
    expect(result.current.holders[0].winProbabilityBps).toBe(10000);
  });

  it('should handle zero tickets correctly', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient();

    mockClient.getLogs.mockResolvedValue([
      {
        args: {
          seasonId: 1n,
          player: '0x1111111111111111111111111111111111111111',
          oldTickets: 100n,
          newTickets: 0n, // Sold all tickets
          totalTickets: 0n,
          probabilityBps: 0,
        },
        blockNumber: 100n,
        logIndex: 0,
      },
    ]);

    const { result } = renderHook(
      () => useRaffleHolders('0xCurveAddress', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Holder with 0 tickets should be filtered out
    expect(result.current.holders).toHaveLength(0);
    expect(result.current.totalTickets).toBe(0n);
  });

  it('should use latest event for each player', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient();

    // Player 1 has multiple events - should use latest
    mockClient.getLogs.mockResolvedValue([
      {
        args: {
          seasonId: 1n,
          player: '0x1111111111111111111111111111111111111111',
          oldTickets: 0n,
          newTickets: 100n,
          totalTickets: 100n,
          probabilityBps: 10000,
        },
        blockNumber: 100n,
        logIndex: 0,
      },
      {
        args: {
          seasonId: 1n,
          player: '0x1111111111111111111111111111111111111111',
          oldTickets: 100n,
          newTickets: 200n, // Bought more
          totalTickets: 200n,
          probabilityBps: 10000,
        },
        blockNumber: 101n,
        logIndex: 0,
      },
    ]);

    const { result } = renderHook(
      () => useRaffleHolders('0xCurveAddress', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.holders).toHaveLength(1);
    });

    // Should use latest ticket count (200)
    expect(result.current.holders[0].ticketCount).toBe(200n);
    expect(result.current.holders[0].winProbabilityBps).toBe(10000);
  });

  it('should maintain correct probabilities after user sells', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient();

    // Simulate: User A has 150, User B has 100, User C has 50 (total 300)
    // Then User A sells 50 (total becomes 250)
    mockClient.getLogs.mockResolvedValue([
      {
        args: {
          seasonId: 1n,
          player: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          oldTickets: 150n,
          newTickets: 100n, // Sold 50
          totalTickets: 250n,
          probabilityBps: 4000, // 40% at this point
        },
        blockNumber: 103n,
        logIndex: 0,
      },
      {
        args: {
          seasonId: 1n,
          player: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          oldTickets: 0n,
          newTickets: 100n,
          totalTickets: 250n,
          probabilityBps: 4000, // Should be recalculated
        },
        blockNumber: 101n,
        logIndex: 0,
      },
      {
        args: {
          seasonId: 1n,
          player: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
          oldTickets: 0n,
          newTickets: 50n,
          totalTickets: 250n,
          probabilityBps: 2000, // Should be recalculated
        },
        blockNumber: 102n,
        logIndex: 0,
      },
    ]);

    const { result } = renderHook(
      () => useRaffleHolders('0xCurveAddress', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.holders).toHaveLength(3);
    });

    const holders = result.current.holders;

    // User A: 100/250 = 4000 bps (40%)
    const userA = holders.find(h => h.player === '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(userA.winProbabilityBps).toBe(4000);

    // User B: 100/250 = 4000 bps (40%)
    const userB = holders.find(h => h.player === '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    expect(userB.winProbabilityBps).toBe(4000);

    // User C: 50/250 = 2000 bps (20%)
    const userC = holders.find(h => h.player === '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC');
    expect(userC.winProbabilityBps).toBe(2000);

    // Total should be 10000 (100%)
    const totalProb = holders.reduce((sum, h) => sum + h.winProbabilityBps, 0);
    expect(totalProb).toBe(10000);
  });
});
