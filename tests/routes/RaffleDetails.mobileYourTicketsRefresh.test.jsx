/*
  @vitest-environment jsdom
*/

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, params) => params?.defaultValue || key,
  }),
}));

vi.mock("@/hooks/usePlatform", () => ({
  usePlatform: () => ({ isMobile: true }),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: "0x1111111111111111111111111111111111111111",
    isConnected: true,
  }),
  usePublicClient: () => ({
    watchContractEvent: () => () => {},
  }),
}));

vi.mock("@/lib/wagmi", () => ({
  getStoredNetworkKey: () => "LOCAL",
}));

vi.mock("@/hooks/useRaffleState", () => ({
  useRaffleState: () => ({
    seasonDetailsQuery: {
      data: {
        config: {
          name: "Test Season",
          endTime: BigInt(Math.floor(Date.now() / 1000) + 600),
          bondingCurve: "0x0000000000000000000000000000000000000001",
        },
        status: 1,
        totalTickets: 0,
        totalPrizePool: 0n,
      },
      isLoading: false,
      error: null,
    },
  }),
}));

vi.mock("@/hooks/useSeasonWinnerSummaries", () => ({
  useSeasonWinnerSummary: () => ({ data: null }),
}));

vi.mock("@/hooks/useCurveState", () => ({
  useCurveState: () => ({
    curveSupply: 0n,
    curveReserves: 0n,
    curveStep: { price: 0n },
    allBondSteps: [],
    debouncedRefresh: vi.fn(),
  }),
}));

// RaffleDetails renders BuySellSheet in mobile mode; stub it to keep this test focused
// on the "Your Tickets" refresh path.
vi.mock("@/components/mobile/BuySellSheet", () => ({
  default: () => null,
}));

const readContractMock = vi.fn();

// Critical for the regression: emulate ABI module shapes where the JSON import is `{ abi: [...] }`
// and verify RaffleDetails normalizes `SOFBondingCurveAbi` / `ERC20Abi` to arrays.
vi.mock("@/utils/abis", () => ({
  SOFBondingCurveAbi: { abi: [{ type: "function", name: "playerTickets" }] },
  ERC20Abi: { abi: [{ type: "function", name: "balanceOf" }] },
}));

vi.mock("@/lib/viemClient", () => ({
  buildPublicClient: () => ({
    readContract: readContractMock,
    getBlock: vi.fn(async () => ({ timestamp: 123n })),
  }),
}));

import RaffleDetails from "@/routes/RaffleDetails.jsx";

describe("RaffleDetails (mobile) refreshPositionNow ABI normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders updated Your Tickets when playerTickets mapping read succeeds with wrapped ABI", async () => {
    // refreshPositionNow does Promise.all([playerTickets, curveConfig])
    // Provide responses in call order.
    readContractMock.mockImplementation(async ({ functionName }) => {
      if (functionName === "playerTickets") return 7n;
      if (functionName === "curveConfig")
        return [10n, 0n, 0n, 0n, 0n, false, true];
      return 0n;
    });

    render(
      <MemoryRouter initialEntries={["/raffles/1"]}>
        <Routes>
          <Route path="/raffles/:seasonId" element={<RaffleDetails />} />
        </Routes>
      </MemoryRouter>,
    );

    // Initial load effect triggers refreshPositionNow.
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("raffle:yourTickets")).toBeInTheDocument();
    });

    // The ticket count is rendered as a string in MobileRaffleDetail.
    await waitFor(() => {
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    // Ensure readContract was called with an ABI array (post-normalization)
    const playerTicketsCall = readContractMock.mock.calls.find(
      (call) => call?.[0]?.functionName === "playerTickets",
    );
    expect(playerTicketsCall).toBeTruthy();
    expect(Array.isArray(playerTicketsCall[0].abi)).toBe(true);
  });
});
