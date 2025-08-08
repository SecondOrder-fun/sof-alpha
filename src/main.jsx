import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, base } from 'wagmi/chains';
import { AuthKitProvider } from '@farcaster/auth-kit';
import '@rainbow-me/rainbowkit/styles.css';
import './styles/tailwind.css';

import App from './App';
import ErrorPage from './components/common/ErrorPage';
import { WalletProvider } from './context/WalletContext';
import { FarcasterProvider } from './context/FarcasterContext';
import { SSEProvider } from './context/SSEContext';

// Initialize query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

// Initialize Wagmi and RainbowKit
const config = getDefaultConfig({
  appName: 'SecondOrder.fun',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID_HERE',
  chains: [mainnet, polygon, optimism, arbitrum, base],
  ssr: true,
});

// Initialize Farcaster AuthKit
const farcasterConfig = {
  domain: window.location.host,
  siweUri: window.location.origin + '/login',
  relay: 'https://relay.farcaster.xyz',
  rpcUrl: 'https://mainnet.optimism.io',
};

import TestPage from './app/test/page';

// Create router
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: 'test',
        element: <TestPage />,
      },
    ],
  },
]);

// Render application
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
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
    </WagmiProvider>
  </React.StrictMode>,
);