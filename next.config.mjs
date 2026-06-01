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
};

export default nextConfig;
