import React from 'react';
import PropTypes from 'prop-types';

import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiConfigProvider } from './context/WagmiConfigProvider';
import { AuthKitProvider } from '@farcaster/auth-kit';
import '@rainbow-me/rainbowkit/styles.css';
import './styles/tailwind.css';

// Initialize i18n
import './i18n';
import { useTranslation } from 'react-i18next';

import App from './App';
import ErrorPage from './components/common/ErrorPage';
import { WalletProvider } from './context/WalletProvider';
import { FarcasterProvider } from './context/FarcasterProvider';
import { SSEProvider } from './context/SSEProvider';

// Initialize query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Initialize Farcaster AuthKit
const farcasterConfig = typeof window !== 'undefined' ? {
  domain: window.location.host,
  siweUri: `${window.location.origin}/login`,
  relay: 'https://relay.farcaster.xyz',
  rpcUrl: 'https://mainnet.optimism.io',
} : {};

// Import route components directly instead of lazy loading for now
// This will help us diagnose the issues more easily
import Home from './routes/Home';
import Test from './routes/Test';
import NotFound from './routes/NotFound';
import RaffleList from './routes/RaffleList';
import RaffleDetails from './routes/RaffleDetails';
import AdminPanel from './routes/AdminPanel';
import AccountPage from './routes/AccountPage';
import MarketsIndex from './routes/MarketsIndex';
import UsersIndex from './routes/UsersIndex';
import UserProfile from './routes/UserProfile';
import FaucetPage from './routes/FaucetPage';

// Create router
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: 'test',
        element: <Test />,
      },
      {
        path: 'raffles',
        element: <RaffleList />,
      },
      {
        path: 'markets',
        element: <MarketsIndex />,
      },
      {
        path: 'raffles/:seasonId',
        element: <RaffleDetails />,
      },
      {
        path: 'users',
        element: <UsersIndex />,
      },
      {
        path: 'users/:address',
        element: <UserProfile />,
      },
      {
        path: 'admin',
        element: <AdminPanel />,
      },
      {
        path: 'account',
        element: <AccountPage />,
      },
      {
        path: 'faucet',
        element: <FaucetPage />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
]);

// Error boundary component to catch provider errors
class ProviderErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Using console.error intentionally for error boundary logging
    // eslint-disable-next-line no-console
    console.error('Provider error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h2 className="text-lg font-semibold text-red-700">Something went wrong</h2>
          <p className="text-red-600">{this.state.error?.message || 'Unknown error'}</p>
          <button 
            className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ProviderErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

// Wrapper component to provide RainbowKit with current locale
const RainbowKitWrapper = ({ children }) => {
  const { i18n } = useTranslation();
  const locale = i18n.language === 'ja' ? 'ja' : 'en';
  
  return (
    <RainbowKitProvider locale={locale}>
      {children}
    </RainbowKitProvider>
  );
};

RainbowKitWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProviderErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WagmiConfigProvider>
          <ProviderErrorBoundary>
            <AuthKitProvider config={farcasterConfig}>
              <ProviderErrorBoundary>
                <RainbowKitWrapper>
                  <ProviderErrorBoundary>
                    <WalletProvider>
                      <FarcasterProvider>
                        <SSEProvider>
                          <RouterProvider router={router} />
                          {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
                        </SSEProvider>
                      </FarcasterProvider>
                    </WalletProvider>
                  </ProviderErrorBoundary>
                </RainbowKitWrapper>
              </ProviderErrorBoundary>
            </AuthKitProvider>
          </ProviderErrorBoundary>
        </WagmiConfigProvider>
        {/* ReactQueryDevtools outside of provider errors */}
      </QueryClientProvider>
    </ProviderErrorBoundary>
  </React.StrictMode>,
);