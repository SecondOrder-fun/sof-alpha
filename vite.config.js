import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Get git commit hash for version display
const getGitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

// https://vitejs.dev/config/
export default defineConfig(() => {
  const gitHash = getGitHash();
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_HASH__: JSON.stringify(gitHash),
      global: "globalThis",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@components": path.resolve(__dirname, "./src/components"),
        "@features": path.resolve(__dirname, "./src/features"),
        "@hooks": path.resolve(__dirname, "./src/hooks"),
        "@lib": path.resolve(__dirname, "./src/lib"),
        "@services": path.resolve(__dirname, "./src/services"),
        "@store": path.resolve(__dirname, "./src/store"),
        "@styles": path.resolve(__dirname, "./src/styles"),
        "@types": path.resolve(__dirname, "./src/types"),
        "@utils": path.resolve(__dirname, "./src/utils"),
        "@contracts": path.resolve(__dirname, "./src/contracts"),
      },
    },
    optimizeDeps: {
      include: ["bn.js"],
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            // Web3 stack — wagmi, viem, connectors
            web3: ["wagmi", "viem", "@wagmi/core", "@wagmi/connectors"],
            // React core + router
            react: ["react", "react-dom", "react-router-dom"],
            // UI framework — Radix primitives
            radix: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-popover",
              "@radix-ui/react-select",
              "@radix-ui/react-tabs",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-accordion",
              "@radix-ui/react-switch",
              "@radix-ui/react-separator",
              "@radix-ui/react-progress",
              "@radix-ui/react-label",
            ],
            // Charts — recharts + dependencies
            charts: ["recharts", "d3-scale", "d3-shape", "d3-interpolate"],
            // Animation
            motion: ["motion"],
            // i18n
            i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
            // Farcaster + Coinbase
            farcaster: [
              "@farcaster/auth-kit",
              "@farcaster/miniapp-sdk",
              "@farcaster/miniapp-node",
              "@farcaster/miniapp-wagmi-connector",
              "@base-org/account",
            ],
            // Data layer — react-query + react-table
            data: [
              "@tanstack/react-query",
              "@tanstack/react-query-devtools",
              "@tanstack/react-table",
            ],
            // Visx charting (BondingCurveEditor)
            visx: [
              "@visx/xychart",
              "@visx/shape",
              "@visx/scale",
              "@visx/group",
              "@visx/drag",
              "@visx/event",
            ],
          },
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true, // Fail if port is already in use instead of trying next available
      host: "127.0.0.1",
      open: true,
      proxy: {
        // Proxy Fastify backend for API and SSE endpoints
        "/api": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
          ws: true,
        },
      },
      allowedHosts: ["127.0.0.1", "localhost", "4256d87ae5d6.ngrok-free.app"],
    },
  };
});
