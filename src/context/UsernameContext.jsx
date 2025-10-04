// src/context/UsernameContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAccount } from 'wagmi';
import { useUsername } from '@/hooks/useUsername';

const UsernameContext = createContext({
  username: null,
  isLoading: false,
  showDialog: false,
  setShowDialog: () => {},
  hasCheckedUsername: false,
});

export const UsernameProvider = ({ children }) => {
  const { address, isConnected } = useAccount();
  const { data: username, isLoading } = useUsername(address);
  const [showDialog, setShowDialog] = useState(false);
  const [hasCheckedUsername, setHasCheckedUsername] = useState(false);

  // Check if user needs to set username on wallet connection
  useEffect(() => {
    if (isConnected && address && !isLoading && hasCheckedUsername) {
      // User has connected and we've checked for username
      if (!username) {
        // No username set, show dialog
        setShowDialog(true);
      }
    }
  }, [isConnected, address, username, isLoading, hasCheckedUsername]);

  // Mark as checked once we've loaded the username (or confirmed it doesn't exist)
  useEffect(() => {
    if (isConnected && address && !isLoading) {
      setHasCheckedUsername(true);
    } else if (!isConnected) {
      // Reset when disconnected
      setHasCheckedUsername(false);
      setShowDialog(false);
    }
  }, [isConnected, address, isLoading]);

  const value = {
    username,
    isLoading,
    showDialog,
    setShowDialog,
    hasCheckedUsername,
  };

  return (
    <UsernameContext.Provider value={value}>
      {children}
    </UsernameContext.Provider>
  );
};

UsernameProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useUsernameContext = () => {
  const context = useContext(UsernameContext);
  if (!context) {
    throw new Error('useUsernameContext must be used within UsernameProvider');
  }
  return context;
};
