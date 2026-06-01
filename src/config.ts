const DEFAULT_ASSET_BASE_URL = "https://storage.googleapis.com/audeobox-cdn/videobox";
const DEFAULT_RENDER_API_BASE = "/api/render";
const DEFAULT_FEED_BASE_URL = "/audeobox-feeds";

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const stripLeadingSlash = (value: string): string => value.replace(/^\/+/, "");

const cleanBase = (value: string | undefined, fallback: string): string => {
  const raw = value?.trim() || fallback;
  return stripTrailingSlash(raw);
};

export const ASSET_BASE_URL = cleanBase(
  process.env.NEXT_PUBLIC_ASSET_BASE_URL,
  DEFAULT_ASSET_BASE_URL,
);

export const RENDER_API_BASE = cleanBase(
  process.env.NEXT_PUBLIC_RENDER_API_BASE,
  DEFAULT_RENDER_API_BASE,
);

export const FEED_BASE_URL = cleanBase(
  process.env.NEXT_PUBLIC_FEED_BASE_URL,
  DEFAULT_FEED_BASE_URL,
);

export const isExternalAsset = (value: string): boolean =>
  /^(https?:|blob:|data:)/i.test(value);

export const assetUrl = (path: string): string => {
  if (!path) return ASSET_BASE_URL;
  if (isExternalAsset(path)) return path;
  return `${ASSET_BASE_URL}/${stripLeadingSlash(path)}`;
};

export const renderApiUrl = (path = ""): string => {
  if (!path) return RENDER_API_BASE;
  return `${RENDER_API_BASE}/${stripLeadingSlash(path)}`;
};

export const feedUrl = (fileName: string): string =>
  `${FEED_BASE_URL}/${stripLeadingSlash(fileName)}`;
