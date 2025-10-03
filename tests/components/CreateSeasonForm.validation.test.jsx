/*
  @vitest-environment jsdom
*/
// tests/components/CreateSeasonForm.validation.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock dependencies
vi.mock('wagmi', () => ({
  usePublicClient: () => ({
    readContract: vi.fn().mockResolvedValue(18),
    getBlock: vi.fn().mockResolvedValue({ timestamp: BigInt(Math.floor(Date.now() / 1000)) }),
  }),
  useAccount: () => ({ address: '0x123' }),
}));

vi.mock('@/config/contracts', () => ({
  getContractAddresses: () => ({ SOF: '0xSOF' }),
}));

vi.mock('@/lib/wagmi', () => ({
  getStoredNetworkKey: () => 'LOCAL',
}));

vi.mock('@/lib/jsonUtils', () => ({
  safeStringify: (obj) => JSON.stringify(obj),
}));

import CreateSeasonForm from '@/components/admin/CreateSeasonForm';

describe('CreateSeasonForm - Name Validation', () => {
  const mockCreateSeason = {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    isConfirmed: false,
    error: null,
  };

  const mockChainTimeQuery = {
    data: Math.floor(Date.now() / 1000),
    isLoading: false,
  };

  it('should show error when name is empty and form is submitted', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Submit without entering a name
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Season name is required')).toBeInTheDocument();
    });

    // Mutation should not be called
    expect(mockCreateSeason.mutate).not.toHaveBeenCalled();
  });

  it('should show red border on name input when validation fails', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Submit without entering a name
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(nameInput).toHaveClass('border-red-500');
    });
  });

  it('should clear error when user starts typing', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Submit without entering a name to trigger error
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Season name is required')).toBeInTheDocument();
    });

    // Start typing
    fireEvent.change(nameInput, { target: { value: 'Test Season' } });

    await waitFor(() => {
      expect(screen.queryByText('Season name is required')).not.toBeInTheDocument();
    });
  });

  it('should disable submit button when name is empty', () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Button should be disabled when name is empty
    expect(submitButton).toBeDisabled();
  });

  it('should reject whitespace-only names', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Enter only whitespace
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Season name is required')).toBeInTheDocument();
    });

    // Mutation should not be called
    expect(mockCreateSeason.mutate).not.toHaveBeenCalled();
  });

  it('should have required attribute on name input', () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    expect(nameInput).toHaveAttribute('required');
  });

  it('should have proper aria attributes for accessibility', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    const submitButton = screen.getByRole('button', { name: /create season/i });
    
    // Submit to trigger error
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
    });
  });
});
