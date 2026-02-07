import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAdminAuth", () => ({
  useAdminAuth: () => ({
    getAuthHeaders: () => ({
      Authorization: `Bearer ${import.meta.env.VITE_ADMIN_BEARER_TOKEN}`,
    }),
  }),
}));

import AllowlistPanel from "@/components/admin/AllowlistPanel";

const originalEnv = import.meta.env;
let originalFetch;
let queryClient;

describe("AllowlistPanel auth headers", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input?.url;
      const urlStr = String(url || "");

      if (urlStr.includes("/allowlist/stats")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            active_entries: 0,
            total_entries: 0,
            window_open: false,
          }),
        });
      }

      if (urlStr.includes("/allowlist/entries")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ entries: [], count: 0 }),
        });
      }

      return originalFetch(input, init);
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    Object.assign(import.meta.env, {
      VITE_API_BASE_URL: "https://example.com/api",
      VITE_ADMIN_BEARER_TOKEN: "test-token",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore env object contents (don't try to replace the env object reference).
    for (const key of Object.keys(import.meta.env)) {
      if (!(key in originalEnv)) {
        delete import.meta.env[key];
      }
    }
    Object.assign(import.meta.env, originalEnv);
  });

  it("adds Authorization header to stats + entries requests", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AllowlistPanel />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const calls = globalThis.fetch.mock.calls;

    const statsCall = calls.find((c) =>
      String(c[0]).endsWith("/allowlist/stats"),
    );
    const entriesCall = calls.find((c) =>
      String(c[0]).includes("/allowlist/entries?"),
    );

    expect(statsCall).toBeTruthy();
    expect(entriesCall).toBeTruthy();

    expect(statsCall[1]).toMatchObject({
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    expect(entriesCall[1]).toMatchObject({
      headers: {
        Authorization: "Bearer test-token",
      },
    });

    expect(screen.getByText(/Active Entries/i)).toBeInTheDocument();
  });
});
