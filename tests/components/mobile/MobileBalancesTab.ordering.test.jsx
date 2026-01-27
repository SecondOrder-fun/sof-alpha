/*
  @vitest-environment jsdom
*/
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/account/InfoFiPositionsTab", () => ({
  __esModule: true,
  default: () => <div data-testid="infofi-positions" />,
}));

vi.mock("@/components/mobile/RaffleBalanceItem", () => ({
  __esModule: true,
  default: ({ seasonId }) => (
    <div data-testid="raffle-balance-item">{String(seasonId)}</div>
  ),
}));

import MobileBalancesTab from "@/components/mobile/MobileBalancesTab";

describe("MobileBalancesTab", () => {
  it("renders raffle positions in reverse season order (most recent first)", () => {
    render(
      <MobileBalancesTab
        address="0x0000000000000000000000000000000000000001"
        sofBalance="0.0000"
        rafflePositions={[
          {
            seasonId: 11,
            name: "Season 11",
            token: "0x0000000000000000000000000000000000000011",
            ticketCount: "51",
          },
          {
            seasonId: 13,
            name: "Season 13",
            token: "0x0000000000000000000000000000000000000013",
            ticketCount: "10000",
          },
        ]}
      />,
    );

    const rows = screen.getAllByTestId("raffle-balance-item");
    expect(rows.map((el) => el.textContent)).toEqual(["13", "11"]);
  });
});
