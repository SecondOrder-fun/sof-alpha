/*
  @vitest-environment jsdom
*/

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock i18n
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, params) => params?.defaultValue || key,
  }),
}));

// Minimal stubs for web3 + services used by BuySellSheet
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
}));

vi.mock("@/hooks/useCurve", () => ({
  useCurve: () => ({
    buyTokens: { mutateAsync: vi.fn() },
    sellTokens: { mutateAsync: vi.fn() },
    approve: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/hooks/useSofDecimals", () => ({ useSofDecimals: () => 18 }));
vi.mock("@/hooks/useSOFToken", () => ({
  useSOFToken: () => ({
    balance: "1000",
    isLoading: false,
    refetchBalance: vi.fn(),
  }),
}));

vi.mock("@/lib/wagmi", () => ({
  getStoredNetworkKey: () => "LOCAL",
}));

vi.mock("@/config/networks", () => ({
  getNetworkByKey: () => ({
    id: 31337,
    name: "Local",
    rpcUrl: "http://127.0.0.1:8545",
  }),
}));

const readContractMock = vi.fn(async ({ functionName }) => {
  if (functionName === "curveConfig") {
    // [totalSupply, sofReserves, currentStep, buyFee, sellFee, tradingLocked, initialized]
    return [0n, 0n, 0n, 0n, 0n, false, true];
  }
  if (functionName === "calculateBuyPrice") return 0n;
  if (functionName === "calculateSellPrice") return 0n;
  if (functionName === "playerTickets") return 0n;
  return 0n;
});

vi.mock("@/lib/viemClient", () => ({
  buildPublicClient: () => ({
    readContract: readContractMock,
    waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
  }),
}));

vi.mock("@/lib/contractErrors", () => ({
  buildFriendlyContractError: () => "Transaction failed",
}));

import BuySellSheet from "@/components/mobile/BuySellSheet.jsx";

describe("BuySellSheet (mobile/Farcaster) input + season guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Safety: if a test fails mid-flight, ensure fake timers don't leak into other suites.
    vi.useRealTimers();
  });

  it("auto-disables buy when seasonEndTime is reached (remaining time hits 0)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
      const nowSec = Math.floor(Date.now() / 1000);
      const endTime = nowSec + 2;

      render(
        <BuySellSheet
          open
          onOpenChange={() => {}}
          bondingCurveAddress="0x0000000000000000000000000000000000000001"
          seasonStatus={1}
          seasonEndTime={endTime}
        />,
      );

      const buyButton = screen.getByRole("button", { name: "BUY NOW" });
      expect(buyButton).not.toBeDisabled();

      // Let the internal 1s interval tick past endTime
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByRole("button", { name: "BUY NOW" })).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("allows clearing the quantity input (does not snap back to 1)", async () => {
    const user = userEvent.setup();

    render(
      <BuySellSheet
        open
        onOpenChange={() => {}}
        bondingCurveAddress="0x0000000000000000000000000000000000000001"
        seasonStatus={1}
      />,
    );

    const getTicketInput = () => {
      const inputs = screen.getAllByRole("spinbutton");
      return inputs.find((el) => el.getAttribute("max") === "1000") || null;
    };

    const ticketInput = getTicketInput();
    expect(ticketInput).toBeTruthy();

    await user.clear(ticketInput);

    await waitFor(() => {
      const latest = getTicketInput();
      expect(latest).toBeTruthy();
      expect(latest.value).toBe("");
    });

    await waitFor(() => {
      const buyButton = screen.getByRole("button", { name: "BUY NOW" });
      expect(buyButton).toBeDisabled();
    });
  });

  it("disables buy when seasonStatus is not Active (status !== 1)", () => {
    render(
      <BuySellSheet
        open
        onOpenChange={() => {}}
        bondingCurveAddress="0x0000000000000000000000000000000000000001"
        seasonStatus={2}
      />,
    );

    const buyButton = screen.getByRole("button", { name: "BUY NOW" });
    expect(buyButton).toBeDisabled();
  });

  it("disables sell when seasonStatus is not Active (status !== 1)", async () => {
    render(
      <BuySellSheet
        open
        onOpenChange={() => {}}
        mode="sell"
        bondingCurveAddress="0x0000000000000000000000000000000000000001"
        seasonStatus={2}
      />,
    );

    const sellButton = await screen.findByRole("button", { name: "SELL NOW" });
    expect(sellButton).toBeDisabled();
  });
});
