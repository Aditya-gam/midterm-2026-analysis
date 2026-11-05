import type { NextConfig } from "next";

// A fully static site: every page, including the 51 state pages, is built by `next build` into out/.
// Cache Components is left off because it streams dynamic content from a server, which a static export has none of.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
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
