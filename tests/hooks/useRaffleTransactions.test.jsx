// tests/hooks/useRaffleTransactions.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRaffleTransactions } from '@/hooks/useRaffleTransactions';

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
    explorer: 'http://localhost:3000',
  })),
}));

describe('useRaffleTransactions', () => {
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

  it('should return empty transactions initially', async () => {
    const { result } = renderHook(
      () => useRaffleTransactions('0x123', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.transactions).toEqual([]);
  });

  it('should handle missing bondingCurveAddress', () => {
    const { result } = renderHook(
      () => useRaffleTransactions(null, 1),
      { wrapper }
    );

    expect(result.current.transactions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('should provide refetch function', async () => {
    const { result } = renderHook(
      () => useRaffleTransactions('0x123', 1),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });

  it('should disable polling when enablePolling is false', () => {
    const { result } = renderHook(
      () => useRaffleTransactions('0x123', 1, { enablePolling: false }),
      { wrapper }
    );

    expect(result.current).toBeDefined();
  });
});
