/*
  @vitest-environment jsdom
*/

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const openConnectModalMock = vi.fn();
const openAccountModalMock = vi.fn();

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }) =>
      children({
        account: null,
        chain: null,
        openAccountModal: openAccountModalMock,
        openConnectModal: openConnectModalMock,
        mounted: true,
      }),
  },
}));

vi.mock("@/hooks/useFarcasterSDK", () => ({
  default: () => ({ isInFarcasterClient: false }),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({
    pfpUrl: null,
    displayName: null,
    username: null,
    fid: null,
    address: null,
    source: null,
  }),
}));

vi.mock("@/hooks/useAllowlist", () => ({
  useAllowlist: () => ({
    isAdmin: () => false,
  }),
}));

vi.mock("@/components/backgrounds/MeltyLines", () => ({
  default: () => null,
}));

vi.mock("@/components/farcaster/AddMiniAppButton", () => ({
  default: () => null,
}));

vi.mock("@/components/farcaster/LaunchAppButtons", () => ({
  default: () => null,
}));

vi.mock("@/components/landing/OpenAppButton", () => ({
  default: () => null,
}));

vi.mock("@/components/auth/FarcasterAuth", () => ({
  default: () => null,
}));

vi.mock("@/components/layout/StickyFooter", () => ({
  default: () => null,
}));

import Landing from "@/routes/Landing.jsx";

describe("Landing avatar login", () => {
  beforeEach(() => {
    openConnectModalMock.mockClear();
    openAccountModalMock.mockClear();
  });

  it("opens connect modal when avatar is clicked while logged out", () => {
    render(<Landing />);

    const button = screen.getByRole("button", { name: "Connect wallet" });
    fireEvent.click(button);

    expect(openConnectModalMock).toHaveBeenCalledTimes(1);
    expect(openAccountModalMock).not.toHaveBeenCalled();
  });
});
