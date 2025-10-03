/*
  @vitest-environment jsdom
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock i18n
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: 'en' },
  }),
}));

// Mock hooks used by RaffleDetails
vi.mock('@/hooks/useRaffleState', () => ({
  useRaffleState: () => ({
    seasonDetailsQuery: {
      data: {
        status: 1,
        config: {
          name: 'Test Season 1',
          startTime: `${Math.floor(Date.now() / 1000) - 60}`,
          endTime: `${Math.floor(Date.now() / 1000) + 3600}`,
          bondingCurve: '0xC011bEad00000000000000000000000000000000',
        },
      },
      isLoading: false,
      error: null,
    },
  }),
}));

vi.mock('@/hooks/useCurveState', () => ({
  useCurveState: () => ({
    curveSupply: 10000n,
    curveReserves: 0n,
    curveStep: { step: 10 },
    allBondSteps: [],
    debouncedRefresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useRaffleTracker', () => ({
  useRaffleTracker: () => ({
    usePlayerSnapshot: () => ({ isLoading: false, error: null, data: null, refetch: vi.fn() }),
    usePlayerSnapshotLive: () => {},
  }),
}));

vi.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ address: '0xabc0000000000000000000000000000000000001', isConnected: true }),
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(async ({ functionName }) => {
        if (functionName === 'playerTickets') return 1234n;
        if (functionName === 'curveConfig') return [10000n, 0n, 0n, 0, 0, false, true];
        if (functionName === 'balanceOf') return 1234n;
        if (functionName === 'totalSupply') return 10000n;
        return 0n;
      }),
      getBlock: vi.fn(async () => ({ timestamp: BigInt(Math.floor(Date.now() / 1000)) })),
    })),
    http: vi.fn(() => ({})),
  };
});

// Mock BuySellWidget to expose a test button that triggers onTxSuccess and onNotify
vi.mock('@/components/curve/BuySellWidget', () => ({
  __esModule: true,
  default: ({ onTxSuccess, onNotify }) => (
    <div>
      <button onClick={() => { onNotify?.({ type: 'success', message: 'Purchase complete', hash: '0xtest' }); onTxSuccess?.(); }}>Simulate Buy</button>
    </div>
  ),
}));

// Mock BondingCurvePanel minimal
vi.mock('@/components/curve/CurveGraph', () => ({
  __esModule: true,
  default: () => <div data-testid="curve" />,
}));

// Mock deps used inside RaffleDetails
vi.mock('@/config/networks', () => ({
  getNetworkByKey: () => ({ id: 31337, name: 'Local Anvil', rpcUrl: 'http://127.0.0.1:8545', explorer: '' }),
}));
vi.mock('@/lib/wagmi', () => ({ getStoredNetworkKey: () => 'LOCAL' }));

// Mock admin components to avoid Wagmi provider requirements
vi.mock('@/components/admin/RaffleAdminControls', () => ({
  RaffleAdminControls: () => null,
}));
vi.mock('@/components/admin/TreasuryControls', () => ({
  TreasuryControls: () => null,
}));

import RaffleDetails from '@/routes/RaffleDetails.jsx';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={["/raffles/1"]}>
      <Routes>
        <Route path="/raffles/:seasonId" element={<RaffleDetails />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RaffleDetails current position refresh', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates the Your Current Position widget after a simulated buy', async () => {
    renderWithRouter();

    // initially shows placeholder or 0 (i18n key: yourCurrentPosition)
    expect(screen.getByText('yourCurrentPosition')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Simulate Buy'));

    // After our on-chain reads, tickets should update to 1234 and probability to 12.34%
    await waitFor(() => {
      // Look for the i18n key 'tickets' followed by the value
      expect(screen.getByText(/tickets/)).toBeInTheDocument();
      expect(screen.getByText(/1234/)).toBeInTheDocument();
      expect(screen.getByText(/12\.34%/)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
