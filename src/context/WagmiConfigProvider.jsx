// src/context/WagmiConfigProvider.jsx
import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { WagmiProvider } from 'wagmi';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { getChainConfig, getStoredNetworkKey } from '@/lib/wagmi';

// Get initial network configuration
const initialNetworkKey = (() => {
  try {
    return getStoredNetworkKey();
  } catch {
    return 'LOCAL';
  }
})();

// Build chain config for TESTNET only
const testnetChainConfig = getChainConfig('TESTNET');

// Export initial chain for RainbowKitProvider
export const getInitialChain = () => testnetChainConfig.chain;

// Create config ONCE at module load - this prevents re-initialization
// Note: WalletConnect disabled (no valid projectId) - using injected providers only
const config = getDefaultConfig({
  appName: 'SecondOrder.fun',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '', // Empty to disable WalletConnect
  chains: [testnetChainConfig.chain],
  transports: {
    [testnetChainConfig.chain.id]: testnetChainConfig.transport,
  },
  ssr: false, // Client-only app, prevents SSR-related re-initialization
  multiInjectedProviderDiscovery: false, // Prevent provider re-discovery on mount
});

export const WagmiConfigProvider = ({ children }) => {
  useEffect(() => {
    const handleNetworkChange = (event) => {
      try {
        // Store the new network key
        const newNetworkKey = event.detail.key;
        // Note: Network changes require page reload to apply new chain config
        // This is intentional to prevent MetaMask provider re-initialization
        if (newNetworkKey !== initialNetworkKey) {
          window.location.reload();
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error handling network change:', error);
      }
    };

    window.addEventListener('sof:network-changed', handleNetworkChange);
    return () => {
      window.removeEventListener('sof:network-changed', handleNetworkChange);
    };
  }, []);

  return (
    <WagmiProvider config={config}>
      {children}
    </WagmiProvider>
  );
};

WagmiConfigProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
