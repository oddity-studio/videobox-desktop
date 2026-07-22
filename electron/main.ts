import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  utilityProcess,
  UtilityProcess,
} from "electron";
import type { AddressInfo } from "net";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as url from "url";

const PORT_RENDER = 3001;
const IS_DEV = !app.isPackaged;
// Matches the editor's background (styles.container in app/Editor.tsx) so
// the title bar area is indistinguishable from the app itself.
const APP_BG_COLOR = "#0a0a0a";

let renderProc: UtilityProcess | null = null;
let uiServer: http.Server | null = null;
let mainWindow: BrowserWindow | null = null;
// Actual UI port (OS-assigned in packaged mode, 3000 in dev) — kept for the
// macOS "activate" re-open handler.
let uiPort = 3000;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// app.getAppPath() returns the project root in dev and resources/app/ in prod.
// With asar:false everything lands there as real files so Node resolution works.
function root(): string {
  return app.getAppPath();
}

function serverScript(): string {
  return path.join(root(), "server", "server.mjs");
}

// ---------------------------------------------------------------------------
// Render server (utilityProcess — uses Electron's embedded Node.js)
// ---------------------------------------------------------------------------

function startRenderServer(): void {
  const userData = app.getPath("userData");
  const assetCacheDir = path.join(userData, "asset-cache");
  const outputDir = path.join(userData, "renders");

  fs.mkdirSync(assetCacheDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  renderProc = utilityProcess.fork(serverScript(), [], {
    env: {
      ...process.env,
      PORT: String(PORT_RENDER),
      // PROJECT_DIR is the parent of src/; server.mjs appends /src/index.ts
      PROJECT_DIR: root(),
      ASSET_CACHE_DIR: assetCacheDir,
      OUTPUT_DIR: outputDir,
      // Remotion's compositor (a Rust binary) reads $HOME to locate its
      // ~/.remotion browser-download cache. A macOS app launched from
      // Finder/the dmg starts with an empty HOME, so ~/.remotion resolved
      // to /.remotion and mkdir failed ("ENOENT … mkdir '/.remotion'").
      // Pin HOME to userData: writable, and the ~150MB browser download
      // persists there so it only happens once. USERPROFILE covers the
      // same lookup on Windows.
      HOME: userData,
      USERPROFILE: userData,
      // Full Chrome, not headless-shell: headless-shell can't decode H.264,
      // which froze <Video>/<Gif> layers (overlays, fire effects) on a
      // single frame in rendered output.
      CHROME_MODE: "chrome-for-testing",
      // Frame-sync wall-clock media (overlay video, loopVideo, fire webp)
      // during renders. Desktop-only — the web deployment keeps its
      // original render path.
      FRAME_SYNC_MEDIA: "1",
      UPSTREAM_CDN:
        "https://storage.googleapis.com/audeobox-cdn/videobox",
    },
    stdio: "pipe",
  });

  renderProc.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  renderProc.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

  renderProc.on("exit", (code) => {
    console.warn(`[electron] render server exited (code=${code})`);
    renderProc = null;
  });
}

// ---------------------------------------------------------------------------
// Minimal static file server + proxy  (packaged mode only)
// The proxy replicates what nginx does in the Docker deployment:
//   /api/render   → http://localhost:3001/render
//   /api/render/* → http://localhost:3001/render/*
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

function proxyToRender(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetPath: string,
): void {
  const options: http.RequestOptions = {
    hostname: "localhost",
    port: PORT_RENDER,
    path: targetPath,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${PORT_RENDER}` },
  };
  const proxy = http.request(options, (upstream) => {
    res.writeHead(upstream.statusCode ?? 200, upstream.headers);
    upstream.pipe(res, { end: true });
  });
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502).end("Bad gateway");
  });
  req.pipe(proxy, { end: true });
}

function proxyToFeed(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  feedPath: string,
): void {
  const options: https.RequestOptions = {
    hostname: "www.audeobox.com",
    path: `/api/feeds/${feedPath}`,
    method: "GET",
    headers: { host: "www.audeobox.com" },
  };
  const proxy = https.request(options, (upstream) => {
    res.writeHead(upstream.statusCode ?? 200, upstream.headers);
    upstream.pipe(res, { end: true });
  });
  proxy.on("error", () => {
    if (!res.headersSent) res.writeHead(502).end("Bad gateway");
  });
  proxy.end();
}

// Resolves with the actual port. Listens on an OS-assigned free port so the
// app never collides with the Docker web container (which binds 3100 on
// this same machine) — only the BrowserWindow needs to know the URL anyway.
function startUIServer(): Promise<number> {
  const outDir = path.join(root(), "out");

  uiServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url ?? "/");
    // Decode %20 etc. — preset files have spaces in their names
    // ("S13 Demo.json") and fetch() sends them percent-encoded.
    let pathname: string;
    try {
      pathname = decodeURIComponent(parsed.pathname ?? "/");
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    const search = parsed.search ?? "";

    // /api/render and /api/render/* → render server
    if (pathname === "/api/render" || pathname.startsWith("/api/render/")) {
      const renderPath =
        pathname === "/api/render"
          ? "/render"
          : "/render/" + pathname.slice("/api/render/".length);
      proxyToRender(req, res, renderPath + search);
      return;
    }

    // /audeobox-feeds/* → audeobox.com/api/feeds/*
    if (pathname.startsWith("/audeobox-feeds/")) {
      proxyToFeed(req, res, pathname.slice("/audeobox-feeds/".length));
      return;
    }

    // Static files from out/
    let filePath = path.join(outDir, pathname);
    // Decoded paths could contain ".." — never serve outside out/.
    if (!path.resolve(filePath).startsWith(path.resolve(outDir))) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
    } catch {
      filePath = path.join(outDir, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      filePath = path.join(outDir, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] ?? "application/octet-stream";
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

  return new Promise((resolve) => {
    uiServer!.listen(0, "127.0.0.1", () => {
      resolve((uiServer!.address() as AddressInfo).port);
    });
  });
}

// ---------------------------------------------------------------------------
// Wait for render server to be healthy
// ---------------------------------------------------------------------------

function waitForRenderServer(maxMs = 45_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    const attempt = () => {
      http
        .get(`http://localhost:${PORT_RENDER}/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) {
        reject(new Error("Render server did not become healthy in time"));
      } else {
        setTimeout(attempt, 600);
      }
    };
    attempt();
  });
}

// ---------------------------------------------------------------------------
// First-run asset prefetch
// On first launch, warm the persistent asset cache with the S13 Demo preset's
// assets so the user can work immediately without waiting for on-demand caching.
// ---------------------------------------------------------------------------

async function prefetchAssets(): Promise<void> {
  const cacheDir = path.join(app.getPath("userData"), "asset-cache");
  const sentinel = path.join(cacheDir, ".prefetch-done");
  if (fs.existsSync(sentinel)) return;

  const manifestPath = path.join(root(), "public", "assets-manifest.json");
  let assets: string[] = [];
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    assets = Array.isArray(data.assets) ? data.assets : [];
  } catch {
    return;
  }

  console.log(`[electron] prefetching ${assets.length} assets…`);
  for (const assetPath of assets) {
    await new Promise<void>((resolve) => {
      http
        .get(`http://localhost:${PORT_RENDER}/cache/${assetPath}`, (res) => {
          res.resume();
          res.on("end", resolve);
        })
        .on("error", () => resolve());
    });
  }

  fs.writeFileSync(sentinel, new Date().toISOString());
  console.log("[electron] asset prefetch complete");
}

// ---------------------------------------------------------------------------
// Browser window
// ---------------------------------------------------------------------------

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    // No native title bar: no app name, no icon, no menu strip. The window
    // controls (min/max/close) are drawn by the OS as an overlay, colored
    // to blend with the app background.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: APP_BG_COLOR,
      symbolColor: "#ffffff",
      height: 36,
    },
    backgroundColor: APP_BG_COLOR,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await mainWindow.loadURL(`http://localhost:${uiPort}`);

  // The title bar band itself is rendered by the app (app/Editor.tsx,
  // gated on window.electronAPI) — injecting DOM from here loses a race
  // with Next.js hydration, which wipes foreign nodes.

  if (IS_DEV) mainWindow.webContents.openDevTools();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle("open-renders-folder", () => {
  return shell.openPath(path.join(app.getPath("userData"), "renders"));
});

ipcMain.handle("app-version", () => app.getVersion());

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // No application menu — removes the File/Edit/View strip entirely.
  Menu.setApplicationMenu(null);

  startRenderServer();

  if (!IS_DEV) {
    uiPort = await startUIServer();
  }

  try {
    await waitForRenderServer();
  } catch (err) {
    console.error("[electron] render server health timeout:", err);
    // Continue anyway — user will see an error in the UI if renders fail.
  }

  // Prefetch in background — don't block the window from opening.
  prefetchAssets().catch((e) =>
    console.warn("[electron] prefetch failed:", e),
  );

  await createWindow();
});

app.on("before-quit", () => {
  renderProc?.kill();
  uiServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
