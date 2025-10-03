// tests/components/SettlementStatus.test.jsx
// React is needed for JSX in the test components
/* eslint-disable-next-line no-unused-vars */
import * as React from 'react';
import { screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders } from '../utils/test-utils';

// Mock the useSettlement hook - must be hoisted
const mockUseSettlement = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useSettlement', () => ({
  useSettlement: mockUseSettlement,
}));

import SettlementStatus from '@/components/infofi/SettlementStatus';

describe('SettlementStatus', () => {
  it('renders the component with settled status', () => {
    mockUseSettlement.mockReturnValue({
      outcome: {
        winner: '0xabcdef1234567890abcdef1234567890abcdef12',
        settled: true,
        settledAt: 1632312345,
      },
      events: [],
      isSettled: true,
      settlementStatus: 'settled',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
        question="Will this player win?"
      />
    );
    
    // Check that the component renders correctly
    expect(screen.getByText('Market Settlement Status')).toBeInTheDocument();
    expect(screen.getByText('Winner Prediction: Will this player win?')).toBeInTheDocument();
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.getByText(/This market has been settled/)).toBeInTheDocument();
  });
  
  it('renders compact version', () => {
    mockUseSettlement.mockReturnValue({
      outcome: {
        winner: '0xabcdef1234567890abcdef1234567890abcdef12',
        settled: true,
        settledAt: 1632312345,
      },
      events: [],
      isSettled: true,
      settlementStatus: 'settled',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
        compact={true}
      />
    );
    
    // Check that the component renders in compact mode
    expect(screen.getByText('Settled')).toBeInTheDocument();
    expect(screen.queryByText('Market Settlement Status')).not.toBeInTheDocument();
  });
  
  it('shows loading state', () => {
    mockUseSettlement.mockReturnValue({
      outcome: null,
      events: [],
      isSettled: false,
      settlementStatus: 'unknown',
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
      />
    );
    
    expect(screen.getByText('Loading settlement information...')).toBeInTheDocument();
  });
  
  it('shows error state', () => {
    mockUseSettlement.mockReturnValue({
      outcome: null,
      events: [],
      isSettled: false,
      settlementStatus: 'unknown',
      isLoading: false,
      error: new Error('Test error'),
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
      />
    );
    
    expect(screen.getByText(/Error loading settlement status/)).toBeInTheDocument();
  });
  
  it('shows pending settlement state', () => {
    mockUseSettlement.mockReturnValue({
      outcome: {
        winner: '0x0000000000000000000000000000000000000000',
        settled: false,
        settledAt: 0,
      },
      events: [],
      isSettled: false,
      settlementStatus: 'pending',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
      />
    );
    
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText(/waiting for settlement/)).toBeInTheDocument();
  });
  
  it('shows settling state', () => {
    mockUseSettlement.mockReturnValue({
      outcome: {
        winner: '0x0000000000000000000000000000000000000000',
        settled: false,
        settledAt: 0,
      },
      events: [{ args: { marketIds: ['0x123'] } }],
      isSettled: false,
      settlementStatus: 'settling',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    
    renderWithProviders(
      <SettlementStatus 
        marketId="0x123" 
        marketType="WINNER_PREDICTION" 
      />
    );
    
    expect(screen.getByText('Settling')).toBeInTheDocument();
    expect(screen.getByText(/Settlement in progress/)).toBeInTheDocument();
  });
});
