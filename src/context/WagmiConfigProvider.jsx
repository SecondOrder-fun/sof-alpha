// src/context/WagmiConfigProvider.jsx
import { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { WagmiProvider, createConfig } from 'wagmi';
import { getChainConfig, getStoredNetworkKey } from '@/lib/wagmi';

const buildWagmiConfig = (networkKey) => {
  const { chain, transport } = getChainConfig(networkKey);

  return createConfig({
    chains: [chain],
    transports: {
      [chain.id]: transport,
    },
  });
};

export const WagmiConfigProvider = ({ children }) => {
  const [networkKey, setNetworkKey] = useState(getStoredNetworkKey());

  useEffect(() => {
    const handleNetworkChange = (event) => {
      setNetworkKey(event.detail.key);
    };

    window.addEventListener('sof:network-changed', handleNetworkChange);
    return () => {
      window.removeEventListener('sof:network-changed', handleNetworkChange);
    };
  }, []);

  const config = useMemo(() => buildWagmiConfig(networkKey), [networkKey]);

  return <WagmiProvider config={config}>{children}</WagmiProvider>;
};

WagmiConfigProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
