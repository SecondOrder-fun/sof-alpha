/*
  @vitest-environment jsdom
*/
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

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

import BondingCurvePanel from "@/components/curve/CurveGraph.jsx";

describe("BondingCurvePanel hover coordinate conversion", () => {
  const originalCreateSVGPoint = SVGSVGElement.prototype.createSVGPoint;
  const originalGetScreenCTM = SVGSVGElement.prototype.getScreenCTM;

  beforeEach(() => {
    SVGSVGElement.prototype.createSVGPoint = vi.fn(() => {
      return {
        x: 0,
        y: 0,
        matrixTransform: vi.fn(() => ({ x: 100, y: 50 })),
      };
    });

    SVGSVGElement.prototype.getScreenCTM = vi.fn(() => {
      return {
        inverse: vi.fn(() => ({
          /* identity placeholder */
        })),
      };
    });
  });

  afterEach(() => {
    SVGSVGElement.prototype.createSVGPoint = originalCreateSVGPoint;
    SVGSVGElement.prototype.getScreenCTM = originalGetScreenCTM;
  });

  it("uses SVG transform helpers instead of getBoundingClientRect for hover coords", () => {
    const steps = [
      { step: 1n, rangeTo: 1000n, price: 1000000000000000000n },
      { step: 2n, rangeTo: 2000n, price: 2000000000000000000n },
    ];

    const { container } = render(
      <BondingCurvePanel
        curveSupply={0n}
        curveStep={{ step: 1n, price: steps[0].price }}
        allBondSteps={steps}
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();

    const rectSpy = vi.spyOn(svg, "getBoundingClientRect");

    fireEvent.mouseMove(svg, { clientX: 123, clientY: 45 });

    expect(SVGSVGElement.prototype.createSVGPoint).toHaveBeenCalledTimes(1);
    expect(SVGSVGElement.prototype.getScreenCTM).toHaveBeenCalledTimes(1);
    expect(rectSpy).not.toHaveBeenCalled();
  });
});
