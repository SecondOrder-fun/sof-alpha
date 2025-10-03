import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTreasury } from '@/hooks/useTreasury';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  useReadContract: vi.fn(),
  useWriteContract: vi.fn(),
  useWaitForTransactionReceipt: vi.fn(),
}));

// Mock contracts config
vi.mock('@/config/contracts', () => ({
  contracts: {
    raffle: '0xRaffleAddress',
    sofToken: '0xSOFTokenAddress',
  },
}));

// Mock ABIs
vi.mock('@/abis/SOFToken.json', () => ({ default: [] }));
vi.mock('@/abis/SOFBondingCurve.json', () => ({ default: [] }));

describe('useTreasury', () => {
  let queryClient;
  const mockAddress = '0x1234567890123456789012345678901234567890';
  const mockBondingCurve = '0xBondingCurveAddress';

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Reset all mocks
    vi.clearAllMocks();

    // Default mock implementations
    useAccount.mockReturnValue({ address: mockAddress });
    useWriteContract.mockReturnValue({
      writeContract: vi.fn(),
      data: null,
      isPending: false,
      error: null,
    });
    useWaitForTransactionReceipt.mockReturnValue({
      isLoading: false,
      isSuccess: false,
    });
  });

  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('Fee Balances', () => {
    it('should return accumulated fees from bonding curve', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'accumulatedFees') {
          return { data: 1000000000000000000n }; // 1 SOF
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.accumulatedFees).toBe('1.0');
    });

    it('should return treasury balance from SOF token', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'getContractBalance') {
          return { data: 5000000000000000000n }; // 5 SOF
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.treasuryBalance).toBe('5.0');
    });

    it('should return SOF reserves from bonding curve', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'getSofReserves') {
          return { data: 10000000000000000000n }; // 10 SOF
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.sofReserves).toBe('10.0');
    });

    it('should return total fees collected', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'totalFeesCollected') {
          return { data: 50000000000000000000n }; // 50 SOF
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.totalFeesCollected).toBe('50.0');
    });
  });

  describe('Permissions', () => {
    it('should check if user has RAFFLE_MANAGER_ROLE', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'hasRole') {
          return { data: true };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.hasManagerRole).toBe(true);
    });

    it('should check if user has TREASURY_ROLE', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'hasRole') {
          return { data: true };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.hasTreasuryRole).toBe(true);
    });

    it('should determine if user can extract fees', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'hasRole') {
          return { data: true };
        }
        if (functionName === 'accumulatedFees') {
          return { data: 1000000000000000000n }; // 1 SOF
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.canExtractFees).toBe(true);
    });

    it('should not allow fee extraction if no fees accumulated', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'hasRole') {
          return { data: true };
        }
        if (functionName === 'accumulatedFees') {
          return { data: 0n };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.canExtractFees).toBe(false);
    });
  });

  describe('Fee Extraction', () => {
    it('should call extractFeesToTreasury with correct parameters', async () => {
      const mockWriteContract = vi.fn();
      
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        if (functionName === 'accumulatedFees') {
          return { data: 1000000000000000000n };
        }
        return { data: null };
      });

      useWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: '0xTransactionHash',
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      await result.current.extractFees();

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: mockBondingCurve,
        abi: expect.any(Array),
        functionName: 'extractFeesToTreasury',
        account: mockAddress,
      });
    });

    it('should handle extraction errors gracefully', async () => {
      const mockWriteContract = vi.fn().mockRejectedValue(new Error('Transaction failed'));
      
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        return { data: null };
      });

      useWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: false,
        error: new Error('Transaction failed'),
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      await result.current.extractFees();

      // Should not throw error
      expect(result.current.extractError).toBeTruthy();
    });
  });

  describe('Treasury Transfer', () => {
    it('should call transferToTreasury with correct amount', async () => {
      const mockWriteContract = vi.fn();
      const transferAmount = 5000000000000000000n; // 5 SOF
      
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        return { data: null };
      });

      useWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: '0xTransactionHash',
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      await result.current.transferToTreasury(transferAmount);

      expect(mockWriteContract).toHaveBeenCalledWith({
        address: '0xSOFTokenAddress',
        abi: expect.any(Array),
        functionName: 'transferToTreasury',
        args: [transferAmount],
        account: mockAddress,
      });
    });

    it('should handle transfer errors gracefully', async () => {
      const mockWriteContract = vi.fn().mockRejectedValue(new Error('Transfer failed'));
      
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        return { data: null };
      });

      useWriteContract.mockReturnValue({
        writeContract: mockWriteContract,
        data: null,
        isPending: false,
        error: new Error('Transfer failed'),
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      await result.current.transferToTreasury(1000000000000000000n);

      // Should not throw error
      expect(result.current.transferError).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing bonding curve address', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: null };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.accumulatedFees).toBe('0');
      expect(result.current.canExtractFees).toBe(false);
    });

    it('should handle missing user address', () => {
      useAccount.mockReturnValue({ address: null });
      
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.hasManagerRole).toBe(false);
      expect(result.current.hasTreasuryRole).toBe(false);
    });

    it('should return zero for null balances', () => {
      useReadContract.mockImplementation(({ functionName }) => {
        if (functionName === 'seasons') {
          return { data: [null, null, null, null, null, mockBondingCurve, null, null, null] };
        }
        return { data: null };
      });

      const { result } = renderHook(() => useTreasury('1'), { wrapper });

      expect(result.current.accumulatedFees).toBe('0');
      expect(result.current.treasuryBalance).toBe('0');
      expect(result.current.sofReserves).toBe('0');
      expect(result.current.totalFeesCollected).toBe('0');
    });
  });
});
