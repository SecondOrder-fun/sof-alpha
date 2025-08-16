import React, { Suspense, lazy } from 'react';

import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { mainnet, polygon, optimism, arbitrum, base } from 'wagmi/chains'; // Keep for Farcaster AuthKit
import { WagmiConfigProvider } from './context/WagmiConfigProvider';
import { AuthKitProvider } from '@farcaster/auth-kit';
import '@rainbow-me/rainbowkit/styles.css';
import './styles/tailwind.css';

import App from './App';
import ErrorPage from './components/common/ErrorPage';
import { WalletProvider } from './context/WalletProvider';
import { FarcasterProvider } from './context/FarcasterProvider';
import { SSEProvider } from './context/SSEProvider';
import ClientOnly from './components/common/ClientOnly';

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

// Lazy-loaded route components
const Home = lazy(() => import('./routes/Home'));
const Test = lazy(() => import('./routes/Test'));
const NotFound = lazy(() => import('./routes/NotFound'));
const RaffleList = lazy(() => import('./routes/RaffleList'));
const RaffleDetails = lazy(() => import('./routes/RaffleDetails'));
const AdminPanel = lazy(() => import('./routes/AdminPanel'));
const AccountPage = lazy(() => import('./routes/AccountPage'));

// Create router
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <Home />
          </Suspense>
        ),
      },
      {
        path: 'test',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <Test />
          </Suspense>
        ),
      },
      {
        path: 'raffles',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <ClientOnly>
              <RaffleList />
            </ClientOnly>
          </Suspense>
        ),
      },
      {
        path: 'raffles/:seasonId',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <RaffleDetails />
          </Suspense>
        ),
      },
      {
        path: 'admin',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <AdminPanel />
          </Suspense>
        ),
      },
      {
        path: 'account',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <AccountPage />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: (
          <Suspense fallback={<div>Loading...</div>}>
            <NotFound />
          </Suspense>
        ),
      },
    ],
  },
]);

// Render application
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiConfigProvider>
      <AuthKitProvider config={farcasterConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider>
            <WalletProvider>
              <FarcasterProvider>
                <SSEProvider>
                  <RouterProvider router={router} />
                  <ReactQueryDevtools initialIsOpen={false} />
                </SSEProvider>
              </FarcasterProvider>
            </WalletProvider>
          </RainbowKitProvider>
        </QueryClientProvider>
      </AuthKitProvider>
    </WagmiConfigProvider>
  </React.StrictMode>,
);