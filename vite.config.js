import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Custom Vite plugin that reads .env file fresh on every config call
 * This ensures VITE_ prefixed variables are always current
 */
function envPlugin() {
  return {
    name: "env-plugin",
    config() {
      // Read .env file directly with fs and dotenv.parse
      const envFile = path.resolve(__dirname, ".env");
      if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, "utf-8");
        const parsed = dotenv.parse(envContent);

        // Inject VITE_ prefixed variables into define
        const defineVars = {};
        Object.entries(parsed).forEach(([key, value]) => {
          if (key.startsWith("VITE_")) {
            defineVars[`import.meta.env.${key}`] = JSON.stringify(value);
          }
        });

        return {
          define: defineVars,
        };
      }
      return {};
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), envPlugin()],
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
    build: {
      outDir: "dist",
      sourcemap: true,
    },
  };
});
