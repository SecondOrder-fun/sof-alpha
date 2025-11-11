// src/context/WagmiConfigProvider.jsx
import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { getChainConfig, getStoredNetworkKey } from '@/lib/wagmi';

// Get initial network configuration
const initialNetworkKey = (() => {
  try {
    return getStoredNetworkKey();
  } catch {
    return 'TESTNET';
  }
})();

// Build chain config for TESTNET only
const testnetChainConfig = getChainConfig('TESTNET');

// Export initial chain for compatibility
export const getInitialChain = () => testnetChainConfig.chain;

// Create config with injected provider only (no WalletConnect)
const config = createConfig({
  chains: [testnetChainConfig.chain],
  connectors: [injected()],
  transports: {
    [testnetChainConfig.chain.id]: http(testnetChainConfig.chain.rpcUrls.default.http[0]),
  },
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
