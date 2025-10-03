import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FaucetPage from '../FaucetPage';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useAccount: vi.fn(),
  usePublicClient: vi.fn(),
  useWalletClient: vi.fn(),
}));

// Mock contract addresses
vi.mock('@/config/contracts', () => ({
  getContractAddresses: () => ({
    SOF: '0xSOFAddress',
    SOF_FAUCET: '0xFaucetAddress',
  }),
}));

// Mock network key
vi.mock('@/lib/wagmi', () => ({
  getStoredNetworkKey: () => 'local',
}));

describe('FaucetPage', () => {
  let queryClient;
  
  const renderWithProviders = (component) => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };
  
  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Mock connected account
    useAccount.mockReturnValue({
      address: '0xUserAddress',
      isConnected: true,
    });
    
    // Mock public client
    const mockPublicClient = {
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };
    usePublicClient.mockReturnValue(mockPublicClient);
    
    // Mock wallet client
    const mockWalletClient = {
      writeContract: vi.fn(),
    };
    useWalletClient.mockReturnValue({ data: mockWalletClient });
  });
  
  test('renders SOF faucet tab by default', () => {
    renderWithProviders(<FaucetPage />);
    expect(screen.getByText('$SOF Token Faucet')).toBeInTheDocument();
  });
  
  test('shows Sepolia ETH faucet tab when clicked', async () => {
    renderWithProviders(<FaucetPage />);
    fireEvent.click(screen.getByText('Sepolia ETH Faucet'));
    
    await waitFor(() => {
      expect(screen.getByText('Get Sepolia ETH for testing from external faucets')).toBeInTheDocument();
    });
  });
  
  test('shows connect wallet message when not connected', () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    
    renderWithProviders(<FaucetPage />);
    expect(screen.getByText('Connect your wallet')).toBeInTheDocument();
  });
  
  test('shows cooldown period when user cannot claim yet', async () => {
    const mockPublicClient = {
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'balanceOf') return 100n * 10n**18n;
        if (functionName === 'lastClaimTime') return 1000n;
        if (functionName === 'cooldownPeriod') return 86400n;
        if (functionName === 'amountPerRequest') return 100n * 10n**18n;
        return 0n;
      }),
      waitForTransactionReceipt: vi.fn(),
    };
    usePublicClient.mockReturnValue(mockPublicClient);
    
    // Mock current time
    vi.spyOn(Date, 'now').mockImplementation(() => 10000);
    
    renderWithProviders(<FaucetPage />);
    
    await waitFor(() => {
      expect(screen.getByText(/Cooldown Period/)).toBeInTheDocument();
    });
  });
  
  test('allows claiming when cooldown period has passed', async () => {
    const mockPublicClient = {
      readContract: vi.fn().mockImplementation(({ functionName }) => {
        if (functionName === 'balanceOf') return 100n * 10n**18n;
        if (functionName === 'lastClaimTime') return 0n;
        if (functionName === 'cooldownPeriod') return 86400n;
        if (functionName === 'amountPerRequest') return 100n * 10n**18n;
        return 0n;
      }),
      waitForTransactionReceipt: vi.fn(),
    };
    usePublicClient.mockReturnValue(mockPublicClient);
    
    const mockWalletClient = {
      writeContract: vi.fn().mockResolvedValue('0xtxhash'),
    };
    useWalletClient.mockReturnValue({ data: mockWalletClient });
    
    renderWithProviders(<FaucetPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Claim $SOF Tokens')).not.toBeDisabled();
    });
    
    fireEvent.click(screen.getByText('Claim $SOF Tokens'));
    
    await waitFor(() => {
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
        functionName: 'claim',
      }));
    });
  });
});
