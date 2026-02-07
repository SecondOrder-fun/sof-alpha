/*
  @vitest-environment jsdom
*/
// tests/components/CreateSeasonForm.validation.test.jsx
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ResizeObserver polyfill for Radix UI components
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

// Mock dependencies
vi.mock('wagmi', () => ({
  usePublicClient: () => ({
    readContract: vi.fn().mockResolvedValue(18),
    getBlock: vi.fn().mockResolvedValue({ timestamp: BigInt(Math.floor(Date.now() / 1000)) }),
  }),
  useAccount: () => ({ address: '0x123' }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(),
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: () => ({
    isLoading: false,
    isSuccess: false,
  }),
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

    const form = screen.getByRole('button', { name: /create season/i }).closest('form');
    
    // Submit form programmatically to bypass HTML5 validation
    fireEvent.submit(form);

    await waitFor(() => {
      const errorElement = screen.getByText((content, element) => {
        return element.id === 'name-error' && content === 'Season name is required';
      });
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 3000 });

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
    const form = screen.getByRole('button', { name: /create season/i }).closest('form');
    
    // Submit form programmatically
    fireEvent.submit(form);

    await waitFor(() => {
      expect(nameInput).toHaveClass('border-red-500');
    }, { timeout: 3000 });
  });

  it('should clear error when user starts typing', async () => {
    render(
      <CreateSeasonForm 
        createSeason={mockCreateSeason} 
        chainTimeQuery={mockChainTimeQuery} 
      />
    );

    const nameInput = screen.getByPlaceholderText('Season Name');
    const form = screen.getByRole('button', { name: /create season/i }).closest('form');
    
    // Submit form to trigger error
    fireEvent.submit(form);

    await waitFor(() => {
      const errorElement = screen.getByText((content, element) => {
        return element.id === 'name-error' && content === 'Season name is required';
      });
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 3000 });

    // Start typing
    fireEvent.change(nameInput, { target: { value: 'Test Season' } });

    await waitFor(() => {
      const errorElement = screen.queryByText((content, element) => {
        return element.id === 'name-error' && content === 'Season name is required';
      });
      expect(errorElement).not.toBeInTheDocument();
    }, { timeout: 3000 });
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
    const form = screen.getByRole('button', { name: /create season/i }).closest('form');
    
    // Enter only whitespace
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.submit(form);

    await waitFor(() => {
      const errorElement = screen.getByText((content, element) => {
        return element.id === 'name-error' && content === 'Season name is required';
      });
      expect(errorElement).toBeInTheDocument();
    }, { timeout: 3000 });

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
    const form = screen.getByRole('button', { name: /create season/i }).closest('form');
    
    // Submit to trigger error
    fireEvent.submit(form);

    await waitFor(() => {
      expect(nameInput).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
    }, { timeout: 3000 });
  });
});
