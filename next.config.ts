import { randomUUID } from "node:crypto";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * A new id each time `npm run dev` starts. lib/auth0.ts mixes it into the session key, so a restart signs everyone out (D77).
 * Made once per server start and kept in process.env: the dev server reads this config more than once, and a fresh id on
 * every read changed the inlined env each time, so Fast Refresh rebuilt and reloaded the page in a loop.
 */
const bootId = (phase: string) => (phase === PHASE_DEVELOPMENT_SERVER && process.env.AUTH0_KEEP_SESSIONS !== "1" ? (process.env.DEV_BOOT_ID ??= randomUUID()) : undefined);

const nextConfig = (phase: string): NextConfig => ({
  env: bootId(phase) ? { DEV_BOOT_ID: bootId(phase)! } : {},
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
