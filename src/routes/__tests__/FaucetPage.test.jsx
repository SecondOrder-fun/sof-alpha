import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en' },
  }),
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
    // Check for i18n key since mock returns keys
    expect(screen.getByText(/sofTokenFaucet/i)).toBeInTheDocument();
  });
  
  test('shows Sepolia ETH faucet tab when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FaucetPage />);
    
    // Find the tab trigger button by role and name
    const ethTab = screen.getByRole('tab', { name: /sepoliaEthFaucet/i });
    await user.click(ethTab);
    
    await waitFor(() => {
      // Check that the ETH tab panel is now active (not hidden)
      const ethTabPanel = screen.getByRole('tabpanel', { name: /sepoliaEthFaucet/i });
      expect(ethTabPanel).not.toHaveAttribute('hidden');
    });
    
    // Now check for content within the visible tab
    expect(screen.getByText(/sepoliaEthFaucetDescription/i)).toBeInTheDocument();
  });
  
  test('shows connect wallet message when not connected', () => {
    useAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    });
    
    renderWithProviders(<FaucetPage />);
    // The connect wallet message comes from the FaucetWidget component
    expect(screen.getByText(/raffle:connectWallet/i)).toBeInTheDocument();
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
      expect(screen.getByText(/cooldownPeriod/i)).toBeInTheDocument();
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
      const claimButton = screen.getByRole('button', { name: /claimSofTokens/i });
      expect(claimButton).not.toBeDisabled();
    });
    
    const claimButton = screen.getByRole('button', { name: /claimSofTokens/i });
    fireEvent.click(claimButton);
    
    await waitFor(() => {
      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(expect.objectContaining({
        functionName: 'claim',
      }));
    });
  });
});
