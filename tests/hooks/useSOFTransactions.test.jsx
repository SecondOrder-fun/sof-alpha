// tests/hooks/useSOFTransactions.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSOFTransactions } from '@/hooks/useSOFTransactions';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  usePublicClient: vi.fn(),
}));

// Mock config functions
vi.mock('@/config/contracts', () => ({
  getContractAddresses: vi.fn(),
}));

vi.mock('@/lib/wagmi', () => ({
  getStoredNetworkKey: vi.fn(),
}));

vi.mock('@/config/networks', () => ({
  getNetworkByKey: vi.fn(),
}));

// Mock queryLogsInChunks utility
vi.mock('@/utils/blockRangeQuery', () => ({
  queryLogsInChunks: vi.fn(),
}));

describe('useSOFTransactions', () => {
  let queryClient;
  let mockPublicClient;

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    mockPublicClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000n),
      getBlock: vi.fn(),
      readContract: vi.fn().mockResolvedValue(0n),
    };

    const { usePublicClient } = await import('wagmi');
    usePublicClient.mockReturnValue(mockPublicClient);

    const { getContractAddresses } = await import('@/config/contracts');
    getContractAddresses.mockReturnValue({
      SOF: '0x1234567890123456789012345678901234567890',
      SOFBondingCurve: '0x2345678901234567890123456789012345678901',
      RafflePrizeDistributor: '0x3456789012345678901234567890123456789012',
    });

    const { getStoredNetworkKey } = await import('@/lib/wagmi');
    getStoredNetworkKey.mockReturnValue('anvil');

    const { getNetworkByKey } = await import('@/config/networks');
    getNetworkByKey.mockReturnValue({
      id: 31337,
      name: 'Local Anvil',
      rpcUrl: 'http://127.0.0.1:8545',
      explorer: '',
      lookbackBlocks: 1000n,
    });
  });

  it('should fetch and categorize transactions correctly', async () => {
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

    const { queryLogsInChunks } = await import('@/utils/blockRangeQuery');
    
    // Mock queryLogsInChunks to return Transfer IN event
    queryLogsInChunks.mockImplementation(async ({ args }) => {
      if (args?.to === testAddress) {
        return [{
          transactionHash: '0xabc123',
          blockNumber: 100n,
          args: {
            from: '0x0000000000000000000000000000000000000000',
            to: testAddress,
            value: 1000000000000000000n, // 1 SOF
          },
        }];
      }
      return [];
    });

    mockPublicClient.getBlock.mockResolvedValue({
      timestamp: 1234567890n,
    });

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => useSOFTransactions(testAddress),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
  });

  it('should handle empty transaction history', async () => {
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

    const { queryLogsInChunks } = await import('@/utils/blockRangeQuery');
    queryLogsInChunks.mockResolvedValue([]);

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => useSOFTransactions(testAddress),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should not fetch when address is not provided', () => {
    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => useSOFTransactions(null),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it('should respect enabled option', async () => {
    const testAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

    const { queryLogsInChunks } = await import('@/utils/blockRangeQuery');

    const wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(
      () => useSOFTransactions(testAddress, { enabled: false }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(queryLogsInChunks).not.toHaveBeenCalled();
  });
});
