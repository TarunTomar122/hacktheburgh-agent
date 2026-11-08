import { randomUUID } from "node:crypto";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => ({
  // A new id each time `npm run dev` starts. lib/auth0.ts mixes it into the session key, so a restart signs everyone out (D77).
  env: phase === PHASE_DEVELOPMENT_SERVER && process.env.AUTH0_KEEP_SESSIONS !== "1" ? { DEV_BOOT_ID: randomUUID() } : {},
  // A second dev server (the hand-off UI check) can use its own build dir so it does not fight the one already running.
  distDir: process.env.NEXT_DIST || ".next",
  serverExternalPackages: ["playwright"],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
});

export default nextConfig;
