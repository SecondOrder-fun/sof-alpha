/*
  @vitest-environment jsdom
*/
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en' },
  }),
}));

// Minimal stubs for dependencies
vi.mock('@/hooks/useSofDecimals', () => ({ useSofDecimals: () => 18 }));
vi.mock('@/config/contracts', () => ({ getContractAddresses: () => ({}) }));
vi.mock('@/config/networks', () => ({
  getNetworkByKey: () => ({ id: 31337, name: 'Local', rpcUrl: 'http://127.0.0.1:8545' }),
}));
vi.mock('@/lib/wagmi', () => ({
  getStoredNetworkKey: () => 'LOCAL',
}));
vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({
    address: '0x1234567890123456789012345678901234567890',
    isConnected: true,
  }),
}));
vi.mock('@/hooks/useCurve', () => ({
  useCurve: () => ({
    buyTokens: { mutateAsync: vi.fn() },
    sellTokens: { mutateAsync: vi.fn() },
    approve: { mutateAsync: vi.fn() },
  }),
}));

import BuySellWidget from '@/components/curve/BuySellWidget.jsx';

describe('BuySellWidget UI', () => {
  it('renders centered Buy/Sell header and labels', () => {
    render(<BuySellWidget bondingCurveAddress="0xCurve" />);

    // Check that buy and sell text appears (may appear multiple times)
    const buyElements = screen.getAllByText(/common:buy/i);
    const sellElements = screen.getAllByText(/common:sell/i);
    expect(buyElements.length).toBeGreaterThan(0);
    expect(sellElements.length).toBeGreaterThan(0);

    // Default tab shows amount label (i18n key)
    expect(screen.getByText(/common:amount/i)).toBeInTheDocument();
  });
});
