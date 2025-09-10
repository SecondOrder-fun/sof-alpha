/*
  @vitest-environment jsdom
*/
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// Render the actual BondingCurvePanel with minimal props
import BondingCurvePanel from '@/components/curve/CurveGraph.jsx';

// viem formatUnits is used inside; no need to mock if values are bigint with 18 decimals

describe('BondingCurvePanel Y-axis domain', () => {
  it('uses first and last step prices as Y-axis bounds', async () => {
    const steps = [
      { step: 1n, rangeTo: 1000n, price: 1000000000000000000n }, // 1.0
      { step: 2n, rangeTo: 2000n, price: 2000000000000000000n }, // 2.0
    ];

    render(
      <BondingCurvePanel
        curveSupply={0n}
        curveStep={{ step: 1n, price: steps[0].price }}
        allBondSteps={steps}
      />
    );

    // Expect tick labels to include 1.00 and 2.00 (bounds)
    expect(screen.getAllByText('1.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2.00').length).toBeGreaterThan(0);
  });
});
