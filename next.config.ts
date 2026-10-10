import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E builds into their own folder so they never replace the developer build (see playwright.config.ts).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  experimental: {
    serverActions: {
      // Image uploads go through a Server Action; files are capped at 8 MB in the media service.
      bodySizeLimit: "9mb",
    },
  },
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
