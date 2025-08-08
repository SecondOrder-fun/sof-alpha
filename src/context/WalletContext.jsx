import { createContext, useContext, useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useBalance, useEnsName } from 'wagmi';
import PropTypes from 'prop-types';

const WalletContext = createContext();

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export const WalletProvider = ({ children }) => {
  const { address, isConnected, status } = useAccount();
  const { connectors, connect, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const { data: ensName } = useEnsName({ address });
  
  const [walletState, setWalletState] = useState({
    address: null,
    isConnected: false,
    isConnecting: false,
    balance: null,
    ensName: null,
    error: null
  });

  useEffect(() => {
    setWalletState({
      address: isConnected ? address : null,
      isConnected,
      isConnecting: status === 'connecting',
      balance: balance?.formatted || null,
      ensName: ensName || null,
      error: connectError?.message || null
    });
  }, [address, isConnected, status, balance, ensName, connectError]);

  const connectWallet = async (connector) => {
    try {
      await connect({ connector });
    } catch (error) {
      // In a production app, you might want to use a proper logging service
      // For now, we'll keep the console.error for development
      // console.error('Failed to connect wallet:', error);
    }
  };

  const disconnectWallet = async () => {
    try {
      await disconnect();
    } catch (error) {
      // In a production app, you might want to use a proper logging service
      // For now, we'll keep the console.error for development
      // console.error('Failed to disconnect wallet:', error);
    }
  };

  const value = {
    ...walletState,
    connectWallet,
    disconnectWallet,
    connectors
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

WalletProvider.propTypes = {
  children: PropTypes.node.isRequired
};
