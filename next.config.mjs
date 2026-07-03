const assetBaseUrl =
  process.env.NEXT_PUBLIC_ASSET_BASE_URL ||
  "https://storage.googleapis.com/audeobox-cdn/videobox";
const renderApiBase = process.env.NEXT_PUBLIC_RENDER_API_BASE || "/api/render";
const feedBaseUrl = process.env.NEXT_PUBLIC_FEED_BASE_URL || "/audeobox-feeds";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_ASSET_BASE_URL: assetBaseUrl,
    NEXT_PUBLIC_RENDER_API_BASE: renderApiBase,
    NEXT_PUBLIC_FEED_BASE_URL: feedBaseUrl,
  },
  images: { unoptimized: true },
  // Rewrites only apply during `next dev` — output: "export" ignores them at
  // build time. They let the Electron dev workflow (Next.js hot-reload server
  // at :3000) forward render API calls to the render server at :3001, exactly
  // as nginx does in the Docker deployment.
  async rewrites() {
    return [
      { source: "/api/render", destination: "http://localhost:3001/render" },
      { source: "/api/render/:path*", destination: "http://localhost:3001/render/:path*" },
      { source: "/audeobox-feeds/:path*", destination: "https://www.audeobox.com/api/feeds/:path*" },
    ];
  },
};

export default nextConfig;
