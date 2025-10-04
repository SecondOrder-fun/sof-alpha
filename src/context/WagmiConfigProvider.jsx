// src/context/WagmiConfigProvider.jsx
import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { WagmiProvider, createConfig } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { getChainConfig, getStoredNetworkKey } from '@/lib/wagmi';

const buildWagmiConfig = (networkKey) => {
  try {
    const { chain, transport } = getChainConfig(networkKey);
    
    if (!chain || !transport) {
      // eslint-disable-next-line no-console
      console.error('Invalid chain configuration for network key:', networkKey);
      // Fallback to default configuration
      const fallback = getChainConfig('LOCAL');
      return createConfig({
        chains: [fallback.chain],
        connectors: [
          injected({ shimDisconnect: true }),
          walletConnect({
            projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo',
            showQrModal: true,
          }),
        ],
        transports: {
          [fallback.chain.id]: fallback.transport,
        },
      });
    }
    
    return createConfig({
      chains: [chain],
      connectors: [
        injected({ shimDisconnect: true }),
        walletConnect({
          projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo',
          showQrModal: true,
        }),
      ],
      transports: {
        [chain.id]: transport,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error building Wagmi config:', error);
    // Return a minimal working config for Anvil/localhost
    const { chain, transport } = getChainConfig('LOCAL');
    return createConfig({
      chains: [chain],
      connectors: [
        injected({ shimDisconnect: true }),
        walletConnect({
          projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo',
          showQrModal: true,
        }),
      ],
      transports: {
        [chain.id]: transport,
      },
    });
  }
};

export const WagmiConfigProvider = ({ children }) => {
  const [networkKey, setNetworkKey] = useState(() => {
    try {
      return getStoredNetworkKey();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error getting stored network key:', error);
      return 'LOCAL';
    }
  });

  useEffect(() => {
    const handleNetworkChange = (event) => {
      try {
        setNetworkKey(event.detail.key);
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

  const config = useMemo(() => buildWagmiConfig(networkKey), [networkKey]);

  return (
    <WagmiProvider config={config} reconnectOnMount={true}>
      {children}
    </WagmiProvider>
  );
};

WagmiConfigProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
