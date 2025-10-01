// tests/hooks/useRaffleHolders.test.js
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
  getStoredNetworkKey: vi.fn(() => 'localhost'),
}));

vi.mock('@/config/networks', () => ({
  getNetworkByKey: vi.fn(() => ({
    id: 31337,
    name: 'Localhost',
    rpcUrl: 'http://127.0.0.1:8545',
  })),
}));

describe('useRaffleHolders', () => {
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

  it('should return empty holders initially', async () => {
    const { result } = renderHook(
      () => useRaffleHolders('0x123', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.holders).toEqual([]);
    expect(result.current.totalHolders).toBe(0);
    expect(result.current.totalTickets).toBe(0n);
  });

  it('should handle missing bondingCurveAddress', () => {
    const { result } = renderHook(
      () => useRaffleHolders(null, 1),
      { wrapper }
    );

    expect(result.current.holders).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should provide refetch function', async () => {
    const { result } = renderHook(
      () => useRaffleHolders('0x123', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });

  it('should calculate totalHolders correctly', async () => {
    const { result } = renderHook(
      () => useRaffleHolders('0x123', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.totalHolders).toBe(result.current.holders.length);
  });
});
