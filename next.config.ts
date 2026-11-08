import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
