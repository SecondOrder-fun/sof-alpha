import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TreasuryControls } from '@/components/admin/TreasuryControls';
import { useTreasury } from '@/hooks/useTreasury';

// Mock the useTreasury hook
vi.mock('@/hooks/useTreasury', () => ({
  useTreasury: vi.fn(),
}));

describe('TreasuryControls', () => {
  const defaultTreasuryState = {
    accumulatedFees: '10.5',
    accumulatedFeesRaw: 10500000000000000000n,
    sofReserves: '100.0',
    treasuryBalance: '25.75',
    treasuryBalanceRaw: 25750000000000000000n,
    totalFeesCollected: '150.25',
    treasuryAddress: '0xTreasuryAddress',
    hasManagerRole: true,
    hasTreasuryRole: true,
    canExtractFees: true,
    canTransferToTreasury: true,
    extractFees: vi.fn(),
    transferToTreasury: vi.fn(),
    isExtracting: false,
    isExtractConfirmed: false,
    extractError: null,
    isTransferring: false,
    isTransferConfirmed: false,
    transferError: null,
    refetchAccumulatedFees: vi.fn(),
    refetchTreasuryBalance: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useTreasury.mockReturnValue(defaultTreasuryState);
  });

  describe('Rendering', () => {
    it('should render treasury controls when user has permissions', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByTestId('treasury-controls')).toBeInTheDocument();
      expect(screen.getByText('Treasury Management')).toBeInTheDocument();
    });

    it('should not render when user has no permissions', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        hasManagerRole: false,
        hasTreasuryRole: false,
      });

      const { container } = render(<TreasuryControls seasonId="1" />);

      expect(container.firstChild).toBeNull();
    });

    it('should display accumulated fees correctly', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('10.5000 SOF')).toBeInTheDocument();
      expect(screen.getByText('In bonding curve')).toBeInTheDocument();
    });

    it('should display treasury balance correctly', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('25.7500 SOF')).toBeInTheDocument();
      expect(screen.getByText('In SOF token contract')).toBeInTheDocument();
    });

    it('should display total fees collected', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('150.2500 SOF')).toBeInTheDocument();
      expect(screen.getByText('All-time platform revenue')).toBeInTheDocument();
    });

    it('should display SOF reserves', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('100.0000 SOF')).toBeInTheDocument();
      expect(screen.getByText('Reserves backing raffle tokens (not extractable)')).toBeInTheDocument();
    });

    it('should display treasury address', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('0xTreasuryAddress')).toBeInTheDocument();
    });
  });

  describe('Fee Extraction', () => {
    it('should show extract button when user has manager role', () => {
      render(<TreasuryControls seasonId="1" />);

      const extractButton = screen.getByTestId('extract-fees-button');
      expect(extractButton).toBeInTheDocument();
      expect(extractButton).toHaveTextContent('Extract 10.50 SOF');
    });

    it('should call extractFees when button clicked', async () => {
      const mockExtractFees = vi.fn();
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        extractFees: mockExtractFees,
      });

      render(<TreasuryControls seasonId="1" />);

      const extractButton = screen.getByTestId('extract-fees-button');
      fireEvent.click(extractButton);

      await waitFor(() => {
        expect(mockExtractFees).toHaveBeenCalledTimes(1);
      });
    });

    it('should disable extract button when no fees to extract', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        canExtractFees: false,
        accumulatedFeesRaw: 0n,
      });

      render(<TreasuryControls seasonId="1" />);

      const extractButton = screen.getByTestId('extract-fees-button');
      expect(extractButton).toBeDisabled();
    });

    it('should show extracting state', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        isExtracting: true,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Extracting...')).toBeInTheDocument();
    });

    it('should show success message after extraction', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        isExtractConfirmed: true,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Fees extracted successfully!')).toBeInTheDocument();
    });

    it('should show error message on extraction failure', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        extractError: { message: 'Insufficient permissions' },
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    });

    it('should not show extraction section if user lacks manager role', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        hasManagerRole: false,
        hasTreasuryRole: true,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.queryByTestId('extract-fees-button')).not.toBeInTheDocument();
    });
  });

  describe('Treasury Distribution', () => {
    it('should show transfer controls when user has treasury role', () => {
      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByTestId('transfer-to-treasury-button')).toBeInTheDocument();
      expect(screen.getByTestId('transfer-all-button')).toBeInTheDocument();
    });

    it('should allow entering transfer amount', () => {
      render(<TreasuryControls seasonId="1" />);

      const input = screen.getByLabelText('Amount (SOF)');
      fireEvent.change(input, { target: { value: '10.5' } });

      expect(input.value).toBe('10.5');
    });

    it('should call transferToTreasury with correct amount', async () => {
      const mockTransferToTreasury = vi.fn();
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        transferToTreasury: mockTransferToTreasury,
      });

      render(<TreasuryControls seasonId="1" />);

      const input = screen.getByLabelText('Amount (SOF)');
      fireEvent.change(input, { target: { value: '10.5' } });

      const transferButton = screen.getByTestId('transfer-to-treasury-button');
      fireEvent.click(transferButton);

      await waitFor(() => {
        expect(mockTransferToTreasury).toHaveBeenCalledWith(10500000000000000000n);
      });
    });

    it('should transfer all balance when Transfer All clicked', async () => {
      const mockTransferToTreasury = vi.fn();
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        transferToTreasury: mockTransferToTreasury,
      });

      render(<TreasuryControls seasonId="1" />);

      const transferAllButton = screen.getByTestId('transfer-all-button');
      fireEvent.click(transferAllButton);

      await waitFor(() => {
        expect(mockTransferToTreasury).toHaveBeenCalledWith(25750000000000000000n);
      });
    });

    it('should set max amount when Max button clicked', () => {
      render(<TreasuryControls seasonId="1" />);

      const maxButton = screen.getByText('Max');
      fireEvent.click(maxButton);

      const input = screen.getByLabelText('Amount (SOF)');
      expect(input.value).toBe('25.75');
    });

    it('should disable transfer button when no amount entered', () => {
      render(<TreasuryControls seasonId="1" />);

      const transferButton = screen.getByTestId('transfer-to-treasury-button');
      expect(transferButton).toBeDisabled();
    });

    it('should show transferring state', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        isTransferring: true,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Transferring...')).toBeInTheDocument();
    });

    it('should show success message after transfer', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        isTransferConfirmed: true,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Transferred successfully to treasury!')).toBeInTheDocument();
    });

    it('should show error message on transfer failure', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        transferError: { message: 'Insufficient balance' },
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    });

    it('should not show transfer section if user lacks treasury role', () => {
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        hasManagerRole: true,
        hasTreasuryRole: false,
      });

      render(<TreasuryControls seasonId="1" />);

      expect(screen.queryByTestId('transfer-to-treasury-button')).not.toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should not allow negative transfer amounts', () => {
      render(<TreasuryControls seasonId="1" />);

      const input = screen.getByLabelText('Amount (SOF)');
      expect(input).toHaveAttribute('min', '0');
    });

    it('should not allow transfer amount exceeding balance', () => {
      render(<TreasuryControls seasonId="1" />);

      const input = screen.getByLabelText('Amount (SOF)');
      expect(input).toHaveAttribute('max', '25.75');
    });

    it('should clear input after successful transfer', async () => {
      const mockTransferToTreasury = vi.fn().mockResolvedValue(undefined);
      useTreasury.mockReturnValue({
        ...defaultTreasuryState,
        transferToTreasury: mockTransferToTreasury,
      });

      render(<TreasuryControls seasonId="1" />);

      const input = screen.getByLabelText('Amount (SOF)');
      fireEvent.change(input, { target: { value: '10.5' } });

      const transferButton = screen.getByTestId('transfer-to-treasury-button');
      fireEvent.click(transferButton);

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });
});
