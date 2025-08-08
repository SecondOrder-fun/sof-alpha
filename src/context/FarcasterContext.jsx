import { createContext, useContext, useEffect, useState } from 'react';
import { useProfile } from '@farcaster/auth-kit';
import PropTypes from 'prop-types';

const FarcasterContext = createContext();

export const useFarcaster = () => {
  const context = useContext(FarcasterContext);
  if (!context) {
    throw new Error('useFarcaster must be used within a FarcasterProvider');
  }
  return context;
};

const FarcasterProvider = ({ children }) => {
  const { isAuthenticated, profile } = useProfile();
  const [farcasterState, setFarcasterState] = useState({
    isAuthenticated: false,
    profile: null,
    isLoading: false,
    error: null
  });

  useEffect(() => {
    setFarcasterState({
      isAuthenticated,
      profile: profile || null,
      isLoading: false,
      error: null
    });
  }, [isAuthenticated, profile]);

  const value = {
    ...farcasterState
  };

  return (
    <FarcasterContext.Provider value={value}>
      {children}
    </FarcasterContext.Provider>
  );
};

FarcasterProvider.propTypes = {
  children: PropTypes.node.isRequired
};

export { FarcasterProvider };
