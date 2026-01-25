/*
  @vitest-environment jsdom
*/
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/config/contracts", () => ({
  getContractAddresses: () => ({
    SOF: "0x0000000000000000000000000000000000000001",
  }),
}));

vi.mock("@/config/networks", () => ({
  getNetworkByKey: () => ({
    id: 31337,
    name: "Local Anvil",
    rpcUrl: "http://127.0.0.1:8545",
  }),
}));

vi.mock("@/lib/wagmi", () => ({
  getStoredNetworkKey: () => "LOCAL",
}));

const readContract = vi.fn().mockResolvedValue(18n);

vi.mock("viem", async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    createPublicClient: () => ({ readContract }),
    http: vi.fn(() => ({})),
  };
});

// Render the actual BondingCurvePanel with minimal props
import BondingCurvePanel from "@/components/curve/CurveGraph.jsx";

// viem formatUnits is used inside; no need to mock if values are bigint with 18 decimals

describe("BondingCurvePanel Y-axis domain", () => {
  it("uses 0 and max step price as Y-axis bounds", async () => {
    const steps = [
      { step: 1n, rangeTo: 1000n, price: 1000000000000000000n }, // 1.0
      { step: 2n, rangeTo: 2000n, price: 2000000000000000000n }, // 2.0
    ];

    render(
      <BondingCurvePanel
        curveSupply={0n}
        curveStep={{ step: 1n, price: steps[0].price }}
        allBondSteps={steps}
      />,
    );

    // Expect tick labels to include 0.00 and 2.00 (bounds)
    expect(screen.getAllByText("0.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.00").length).toBeGreaterThan(0);
  });
});
