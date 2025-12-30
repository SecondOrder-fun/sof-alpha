import { useEffect, useState, useContext } from "react";
import { useProfile } from "@farcaster/auth-kit";
import PropTypes from "prop-types";
import FarcasterContext from "./farcasterContext";

const FarcasterProvider = ({ children }) => {
  const { isAuthenticated, profile } = useProfile();
  const [farcasterState, setFarcasterState] = useState({
    isAuthenticated: false,
    profile: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    setFarcasterState({
      isAuthenticated,
      profile: profile || null,
      isLoading: false,
      error: null,
    });
  }, [isAuthenticated, profile]);

  const value = {
    ...farcasterState,
  };

  return (
    <FarcasterContext.Provider value={value}>
      {children}
    </FarcasterContext.Provider>
  );
};

FarcasterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// Hook to use Farcaster context
export const useFarcasterSDK = () => {
  const context = useContext(FarcasterContext);
  if (!context) {
    return { context: null };
  }
  return { context };
};

export { FarcasterProvider };
