// src/context/walletContext.jsx
import { createContext } from 'react';

const WalletContext = createContext({
  address: null,
  isConnected: false,
  isConnecting: false,
  balance: null,
  ensName: null,
  error: null,
  connectWallet: () => {},
  disconnectWallet: () => {},
  connectors: []
});

export default WalletContext;
