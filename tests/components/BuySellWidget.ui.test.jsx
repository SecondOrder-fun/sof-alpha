/*
  @vitest-environment jsdom
*/
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Minimal stubs for dependencies
vi.mock('@/hooks/useSofDecimals', () => ({ useSofDecimals: () => 18 }));
vi.mock('@/config/contracts', () => ({ getContractAddresses: () => ({}) }));
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

    // Tabs as header
    expect(screen.getByText('Buy')).toBeInTheDocument();
    expect(screen.getByText('Sell')).toBeInTheDocument();

    // Default tab shows buy label text
    expect(screen.getByText('Amount to Buy')).toBeInTheDocument();
  });
});
