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
    },
    server: {
      port: 5173,
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
