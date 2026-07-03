/*
 * Videobox render server.
 *
 * Tiny Express service that takes the editor's `videoProps` payload and
 * produces an mp4 by driving @remotion/renderer against the bundled
 * Remotion project in /project.
 *
 * Endpoints:
 *   POST /render               Body: videoProps JSON OR
 *                              { props: videoProps, mode: "integral"|"scenes" }.
 *                              "integral" (default) → one mp4 of the full comp.
 *                              "scenes" → one mp4 per scene, all zipped together
 *                              and served as <id>.zip.
 *                              Returns { ok, id } immediately. Render runs
 *                              in the background (serialised queue).
 *   GET  /render/:id/status    Returns { status, progress, error?, ms? }
 *                              status ∈ "queued" | "running" | "bundling"
 *                                       | "selecting" | "rendering"
 *                                       | "packing" | "done" | "failed"
 *                                       | "cancelled"
 *   GET  /render/:id/file      Streams the rendered output when status ==
 *                              "done" (mp4 for "integral", zip for "scenes").
 *                              File is removed after a successful stream.
 *   POST /render/:id/cancel    Abort an in-flight render. Returns
 *                              { ok, status } once the cancellation has been
 *                              acknowledged (the actual run resolves to
 *                              status="cancelled" asynchronously).
 *   GET  /health               Liveness probe used by nginx + docker-compose.
 *
 * Concurrency: renders are run one at a time. Submitting a second job while
 * one is in flight queues it; clients see status="queued".
 *
 * Cleanup: job records older than 1 h are reaped on a 10 min sweep so the
 * jobs Map doesn't grow forever. Orphan mp4s in OUTPUT_DIR are pruned at
 * the same time.
 */
import express from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { bundle } from "@remotion/bundler";
import {
    renderMedia,
    selectComposition,
    ensureBrowser,
    makeCancelSignal,
} from "@remotion/renderer";

// require() shim so we can pull in webpack (transitive dep of
// @remotion/bundler) without juggling ESM/CJS interop.
const require = createRequire(import.meta.url);
const { default: archiver } = await import("archiver");

const PROJECT_DIR = process.env.PROJECT_DIR || "/project";
const ENTRY_POINT = path.join(PROJECT_DIR, "src/index.ts");
const COMPOSITION_ID = process.env.COMPOSITION_ID || "HelloWorld";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/renders";
const PORT = Number(process.env.PORT) || 3001;
// UPSTREAM_CDN is where the asset cache fetches files from on a miss. The
// bundle itself is pointed at the loopback cache, not the CDN — see
// ASSET_BASE_URL below.
const UPSTREAM_CDN = process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "https://storage.googleapis.com/audeobox-cdn/videobox";
// Bundle-facing asset base URL. Loopback to this same Express server's
// /cache/* route, so OffthreadVideo / Audio / Img inside the rendered tab
// only ever talks to localhost (no per-frame internet round-trip, no
// multi-tab CDN download race that was deadlocking renders).
const ASSET_BASE_URL = `http://localhost:${PORT}/cache`;
const RENDER_API_BASE = process.env.NEXT_PUBLIC_RENDER_API_BASE || "/api/render";
const FEED_BASE_URL = process.env.NEXT_PUBLIC_FEED_BASE_URL || "/audeobox-feeds";

// Number of Chromium tabs Remotion runs in parallel for each render. Default
// 1 because a 2-core / 2 GB WSL podman VM can't reliably keep two tabs alive
// (zombie processes, render froze at 0% — see project-render-hang-regression).
// Production hosts with more CPU/RAM should set RENDER_CONCURRENCY=2 (or
// higher) for roughly linear speedup. Capped at 8 to avoid silly values.
const RENDER_CONCURRENCY = Math.max(1, Math.min(8,
    Number.parseInt(process.env.RENDER_CONCURRENCY || "", 10) || 1));

// On-disk cache for CDN assets. In Docker the cache lives for the
// container's lifetime (tmpdir). In the desktop Electron app, an explicit
// ASSET_CACHE_DIR is passed pointing to a persistent userData directory so
// assets survive app restarts and don't need re-downloading.
const ASSET_CACHE_DIR = process.env.ASSET_CACHE_DIR
    ?? path.join(os.tmpdir(), "videobox-asset-cache");
fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });

// Lottie transition JSONs are preloaded once at server startup from the
// CDN and injected into every render's inputProps so the bundle never has
// to fetch them at render time. The in-bundle fetch path was racing /
// failing during headless render (lottie-web crashed in completeLayers on
// whatever came back); doing the fetch+parse once here on the server, on
// a settled connection, avoids that whole class of failure.
//
// Hardcoded filename list rather than directory discovery because GCS
// doesn't expose a listing endpoint via the public HTTPS URL. If a new
// transition is added to the CDN, append it here.
const TRANSITION_FILES = ["Arrow.json", "Box1.json", "Box2.json", "flash.json"];
async function loadTransitionPreloads() {
    const out = {};
    await Promise.all(TRANSITION_FILES.map(async (file) => {
        const url = `${UPSTREAM_CDN}/picker/transitions/${file}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
            out[file] = await res.json();
        } catch (err) {
            console.warn(`[videobox-render] preload transition ${file} from CDN failed: ${err?.message || err}`);
        }
    }));
    const loaded = Object.keys(out);
    console.log(`[videobox-render] preloaded ${loaded.length}/${TRANSITION_FILES.length} Lottie transitions from CDN: ${loaded.join(", ")}`);
    return out;
}
const TRANSITIONS_PRELOAD = await loadTransitionPreloads();

// ───────────────────────── ASSET CACHE ─────────────────────────
// Singleflight downloader: concurrent requests for the same path collapse
// into one upstream fetch. Returns the absolute path on disk when ready.
const inflightDownloads = new Map();
function cachePathFor(relPath) {
    // Mirror the upstream layout so the file structure is human-readable
    // and easy to spot-check. relPath is the slash-joined trailing portion
    // of the CDN URL (e.g. "picker/music/Tournament.mp3").
    const safe = relPath.split("/").map(encodeURIComponent).join("/");
    return { decoded: path.join(ASSET_CACHE_DIR, relPath), safeRel: safe };
}
function ensureCached(relPath) {
    // Strip any leading slash and any querystring before caching.
    const clean = relPath.replace(/^\/+/, "").split("?")[0];
    if (!clean) return Promise.reject(new Error("empty asset path"));
    const { decoded: filePath } = cachePathFor(clean);
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
        return Promise.resolve(filePath);
    }
    const existing = inflightDownloads.get(clean);
    if (existing) return existing;
    const url = `${UPSTREAM_CDN}/${clean.split("/").map(encodeURIComponent).join("/")}`;
    const tmp = `${filePath}.${process.pid}.${Date.now()}.partial`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const p = (async () => {
        const t0 = Date.now();
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`upstream ${res.status} ${res.statusText} for ${clean}`);
        }
        const ab = await res.arrayBuffer();
        fs.writeFileSync(tmp, Buffer.from(ab));
        fs.renameSync(tmp, filePath);
        const ms = Date.now() - t0;
        const kb = Math.round(ab.byteLength / 1024);
        console.log(`[videobox-render] cached ${clean} (${kb} KB in ${ms} ms)`);
        return filePath;
    })().finally(() => {
        inflightDownloads.delete(clean);
        // Clean up any leftover partial on failure.
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}
    });
    inflightDownloads.set(clean, p);
    return p;
}

// Walk inputProps and emit every relative asset path the render is going
// to need. Mirrors how HelloWorld.tsx + sceneUtils.ts build URLs from the
// props. We only enumerate user-driven choices — anything statically
// referenced by scene layouts (firedash.webp, Audeobox_text.png, etc.)
// will be lazy-cached on first miss via /cache/*.
function collectAssetPaths(inputProps) {
    const out = new Set();
    if (!inputProps || typeof inputProps !== "object") return out;
    const push = (p) => {
        if (typeof p !== "string") return;
        const trimmed = p.trim();
        if (!trimmed) return;
        // Skip blob:/data: URLs (uploaded videos live in the browser) and
        // anything that's already a fully-qualified URL to somewhere other
        // than the configured upstream CDN.
        if (/^(blob:|data:)/i.test(trimmed)) return;
        if (/^https?:/i.test(trimmed)) {
            if (trimmed.startsWith(UPSTREAM_CDN + "/")) {
                out.add(trimmed.slice(UPSTREAM_CDN.length + 1));
            }
            return;
        }
        out.add(trimmed.replace(/^\/+/, ""));
    };
    if (inputProps.music && inputProps.music !== "none") {
        push(`picker/music/${inputProps.music}`);
    }
    if (inputProps.transition && inputProps.transition !== "none" &&
        /\.(webm|mp4)$/i.test(inputProps.transition)) {
        // Only video transitions need caching — JSON ones are preloaded.
        push(`picker/transitions/${inputProps.transition}`);
    }
    if (inputProps.overlayVideo && inputProps.overlayVideo !== "none") {
        push(inputProps.overlayVideo);
    }
    const scenes = Array.isArray(inputProps.scenes) ? inputProps.scenes : [];
    for (const scene of scenes) {
        if (!scene || typeof scene !== "object") continue;
        if (scene.portrait) push(`picker/Portraits/${scene.portrait}`);
        const bg = scene.backgroundVideo;
        if (bg && typeof bg === "object" && typeof bg.src === "string") push(bg.src);
    }
    return out;
}

async function prewarmAssets(inputProps) {
    const paths = [...collectAssetPaths(inputProps)];
    if (paths.length === 0) {
        console.log(`[videobox-render] no assets to prewarm`);
        return;
    }
    const t0 = Date.now();
    const results = await Promise.allSettled(paths.map((p) => ensureCached(p)));
    const failed = results.filter((r) => r.status === "rejected");
    const ms = Date.now() - t0;
    if (failed.length) {
        console.warn(`[videobox-render] prewarm: ${paths.length - failed.length}/${paths.length} ok in ${ms} ms — ${failed.length} failed: ${failed.map((f) => f.reason?.message || f.reason).join("; ")}`);
    } else {
        console.log(`[videobox-render] prewarmed ${paths.length} assets in ${ms} ms`);
    }
}
// Optional path to a pre-installed browser binary. When set we skip the
// network download in ensureBrowser() and pass this through to
// selectComposition/renderMedia. In the fastapi container this is set to
// /usr/bin/chromium (the Debian package) because the audeobox network has
// broken outbound IPv4 and chrome-headless-shell can't be fetched on demand.
const BROWSER_EXECUTABLE = process.env.BROWSER_EXECUTABLE || null;
// How long to keep finished/failed job records (and any unsent mp4 files)
// before reaping. 1 hour is enough to recover from a flaky download and
// not so long that disk usage runs away.
const JOB_TTL_MS = 60 * 60 * 1000;
// Per-job hard timeout. If a render hangs past this it gets cancelled
// automatically so the queue doesn't get stuck behind one wedged job.
// Configurable per-request via `?timeout=<seconds>`; capped at the max.
const DEFAULT_RENDER_TIMEOUT_MS = 60 * 60 * 1000;   // 60 min
const MAX_RENDER_TIMEOUT_MS = 90 * 60 * 1000;       // 90 min — leaves headroom for ?timeout= overrides above the default
// Grace period after cancel() before the queue gives up waiting for the
// in-flight job to settle. Stops a stuck cancel from blocking other jobs.
const CANCEL_GRACE_MS = 60 * 1000;                  // 1 min

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let cachedBundlePath = null;
let cachedBundleSig = null;

/** Cheap signature: latest mtime across the project's TS/TSX files. */
function projectSignature() {
    let latest = 0;
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name === "out" ||
                entry.name === ".next" || entry.name === "server") continue;
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(p);
            else if (/\.(ts|tsx|mjs|js|json)$/.test(entry.name)) {
                const m = fs.statSync(p).mtimeMs;
                if (m > latest) latest = m;
            }
        }
    };
    try { walk(PROJECT_DIR); } catch (_) {}
    return String(latest);
}

async function getBundle() {
    const sig = projectSignature();
    if (cachedBundlePath && cachedBundleSig === sig) {
        return cachedBundlePath;
    }
    console.log(`[videobox-render] bundling ${ENTRY_POINT} (sig=${sig})…`);
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "videobox-bundle-"));
    const bundlePath = await bundle({
        entryPoint: ENTRY_POINT,
        outDir,
        publicDir: null,
        // Match the Next.js client build env so Remotion server renders
        // resolve the same CDN/feed/render paths as the editor preview.
        webpackOverride: (config) => {
            const webpack = require("webpack");
            return {
                ...config,
                plugins: [
                    ...(config.plugins || []),
                    new webpack.DefinePlugin({
                        "process.env.NEXT_PUBLIC_ASSET_BASE_URL": JSON.stringify(ASSET_BASE_URL),
                        "process.env.NEXT_PUBLIC_RENDER_API_BASE": JSON.stringify(RENDER_API_BASE),
                        "process.env.NEXT_PUBLIC_FEED_BASE_URL": JSON.stringify(FEED_BASE_URL),
                    }),
                ],
            };
        },
    });
    cachedBundlePath = bundlePath;
    cachedBundleSig = sig;
    console.log(`[videobox-render] bundle ready: ${bundlePath} (assets=${ASSET_BASE_URL})`);
    return bundlePath;
}

// ───────────────────────── Job tracking ─────────────────────────
// One in-memory record per render request. The client polls
// /render/:id/status to drive its progress UI and then downloads the mp4
// via /render/:id/file when status flips to "done".
//
//   queued     — accepted, waiting for the queue head
//   bundling   — webpack pass running (only on first render or after edits)
//   selecting  — selectComposition() is launching headless chromium
//   rendering  — renderMedia() is producing frames (progress 0..1 live here)
//   done       — mp4 sits at outputPath, ready to download
//   failed     — error is non-null; outputPath unset
const jobs = new Map();

function newJob() {
    const id = crypto.randomBytes(6).toString("hex");
    const record = {
        id,
        status: "queued",
        progress: 0,
        outputPath: null,
        outputName: null,
        error: null,
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        // Set by the POST /render handler before enqueue().
        timeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
        timedOut: false,
    };
    jobs.set(id, record);
    return record;
}

// ───────────────────────── Render queue ─────────────────────────
// Serialise renders: a 1080×1920 30 s comp uses ~1 GB and a Chromium
// instance. Letting two run in parallel on this WSL/podman host causes the
// second browser launch to time out at 30 s ("setting up the headless
// browser") and leaves zombie chrome-headless processes behind.
//
// Hardened: the chain catches errors so one failed task doesn't poison the
// queue, AND each task is wrapped with a hard timeout so a hung renderMedia
// (cancel signal not honored, ffmpeg deadlocked, etc.) can't pin the queue
// forever. After CANCEL_GRACE_MS past the timeout we give up waiting and
// let the next job start regardless.
let renderQueue = Promise.resolve();
function enqueue(task, { maxWaitMs, label } = {}) {
    renderQueue = renderQueue.then(() => {
        if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) return task();
        // Race the task against a hard ceiling. If the task never resolves
        // (a wedged renderMedia, ffmpeg deadlock, …) we move on so the
        // next queued job can start. The orphaned task continues running
        // in the background but no longer holds the queue.
        return Promise.race([
            task(),
            new Promise((resolve) => setTimeout(() => {
                console.warn(`[videobox-render] queue gave up waiting on ${label || "task"} after ${Math.round(maxWaitMs / 1000)}s — moving on`);
                resolve();
            }, maxWaitMs)),
        ]);
    }).catch((err) => {
        console.warn(`[videobox-render] queue task threw: ${err?.message || err}`);
    });
    return renderQueue;
}

// Helper: render the whole composition once. Updates job.progress 0..1.
// cancelSignal lets POST /render/:id/cancel abort renderMedia mid-frame.
async function renderFull({ job, serveUrl, composition, inputProps, outputLocation, cancelSignal }) {
    let lastLoggedPct = -1;
    await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation,
        inputProps,
        browserExecutable: BROWSER_EXECUTABLE,
        chromiumOptions: { headless: true },
        // Configurable via RENDER_CONCURRENCY env var. Default 1 because
        // resource-tight hosts (like a 2-core / 2 GB WSL VM) can't keep a
        // second Chromium tab alive — see project-render-hang-regression.
        concurrency: RENDER_CONCURRENCY,
        timeoutInMilliseconds: 120000,
        cancelSignal,
        onProgress: ({ progress }) => {
            job.progress = Math.min(0.999, Math.max(0, progress));
            const pct = Math.floor(progress * 100);
            if (pct !== lastLoggedPct && pct % 5 === 0) {
                lastLoggedPct = pct;
                console.log(`[videobox-render] ${job.id} ${pct}%`);
            }
        },
    });
}

// Helper: zip a directory's contents into outPath. Returns when the zip is
// fully written and closed.
function zipDirectory(srcDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver("zip", { zlib: { level: 6 } });
        output.on("close", resolve);
        archive.on("warning", (err) => {
            if (err.code !== "ENOENT") reject(err);
        });
        archive.on("error", reject);
        archive.pipe(output);
        archive.directory(srcDir, false);
        archive.finalize();
    });
}

const DEFAULT_SCENE_DURATION_S = 3;

function getInputScenes(inputProps) {
    return Array.isArray(inputProps?.scenes) ? inputProps.scenes : [];
}

function sceneDurationFrames(scene, fps) {
    const seconds = Number(scene?.duration ?? DEFAULT_SCENE_DURATION_S);
    const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_SCENE_DURATION_S;
    return Math.max(1, Math.round(safeSeconds * fps));
}

function getTotalFramesForScenes(scenes, fps) {
    return scenes.reduce((total, scene) => total + sceneDurationFrames(scene, fps), 0);
}

async function runRender(job, inputProps, mode) {
    // Skip if the job was cancelled while still queued.
    if (job.cancelled) {
        console.log(`[videobox-render] ${job.id} skipped (cancelled before start)`);
        return;
    }
    job.status = "bundling";
    job.startedAt = Date.now();
    console.log(`[videobox-render] ${job.id} start (mode=${mode}, timeout=${Math.round(job.timeoutMs / 1000)}s)`);
    // One cancel signal per job. cancel() is wired to job.cancelFn so the
    // /cancel endpoint can fire it from outside this scope.
    const { cancelSignal, cancel } = makeCancelSignal();
    job.cancelFn = () => {
        if (job.cancelled) return;
        job.cancelled = true;
        try { cancel(); } catch (_) {}
    };
    // Hard timeout failsafe: if the render hasn't settled within
    // job.timeoutMs we mark it timed-out and fire the cancel signal. The
    // queue's per-task race in enqueue() backs this up by giving up
    // waiting after a further CANCEL_GRACE_MS so a stuck render can't
    // pin the queue.
    let timedOut = false;
    const timeoutHandle = setTimeout(() => {
        if (job.cancelled || job.status === "done") return;
        timedOut = true;
        job.timedOut = true;
        console.warn(`[videobox-render] ${job.id} TIMEOUT after ${Math.round(job.timeoutMs / 1000)}s — cancelling`);
        try { job.cancelFn?.(); } catch (_) {}
    }, job.timeoutMs);
    try {
        const serveUrl = await getBundle();
        if (job.cancelled) throw new Error("cancelled");
        // Pre-warm the asset cache so every URL the bundle will hit
        // (looped back through /cache) is already on local disk. Stops
        // the multi-tab CDN-download race that used to deadlock renders.
        job.status = "caching";
        await prewarmAssets(inputProps);
        if (job.cancelled) throw new Error("cancelled");
        job.status = "selecting";
        const composition = await selectComposition({
            serveUrl,
            id: COMPOSITION_ID,
            inputProps,
            browserExecutable: BROWSER_EXECUTABLE,
        });
        if (job.cancelled) throw new Error("cancelled");
        const fps = composition.fps || 60;
        const scenes = getInputScenes(inputProps);
        const totalFrames = getTotalFramesForScenes(scenes, fps);
        if (!scenes.length || totalFrames <= 0) {
            throw new Error("inputProps.scenes must be a non-empty array");
        }
        composition.durationInFrames = totalFrames;
        job.status = "rendering";

        if (mode === "scenes") {
            // Per-scene mode: render one mp4 per scene by passing the FULL
            // scenes array (so the HelloWorld component sees each scene at
            // its original position — important because resolveLayoutIndex
            // falls back to the array index when scene.layout is unset)
            // and using Remotion's frameRange to slice just that scene's
            // frames out of the composition.
            // Compute cumulative scene starts + total — must match exactly
            // what HelloWorld.tsx does (see "sceneStarts" loop there).
            const sceneStarts = [];
            let offset = 0;
            for (const scene of scenes) {
                sceneStarts.push(offset);
                offset += sceneDurationFrames(scene, fps);
            }
            composition.durationInFrames = totalFrames;

            const sceneDir = path.join(OUTPUT_DIR, `scenes-${job.id}`);
            fs.mkdirSync(sceneDir, { recursive: true });
            const totalScenes = scenes.length;

            for (let i = 0; i < totalScenes; i++) {
                if (job.cancelled) throw new Error("cancelled");
                const scene = scenes[i];
                const sceneStart = sceneStarts[i];
                const frames = sceneDurationFrames(scene, fps);
                const sceneEnd = sceneStart + frames - 1; // frameRange is inclusive

                const label = (scene.layout || `scene-${i + 1}`)
                    .toString()
                    .replace(/[^\w.-]+/g, "_")
                    .slice(0, 40);
                const sceneFile = path.join(
                    sceneDir,
                    `${String(i + 1).padStart(2, "0")}-${label}.mp4`
                );

                console.log(`[videobox-render] ${job.id} scene ${i + 1}/${totalScenes} frames=[${sceneStart}..${sceneEnd}] → ${path.basename(sceneFile)}`);
                let lastLoggedPct = -1;
                await renderMedia({
                    composition,
                    serveUrl,
                    codec: "h264",
                    outputLocation: sceneFile,
                    inputProps,           // full props — keeps scene indices aligned
                    frameRange: [sceneStart, sceneEnd],
                    browserExecutable: BROWSER_EXECUTABLE,
                    chromiumOptions: { headless: true },
                    // Configurable — see note in renderFull().
                    concurrency: RENDER_CONCURRENCY,
                    timeoutInMilliseconds: 120000,
                    cancelSignal,
                    onProgress: ({ progress }) => {
                        // Combine intra-scene progress with scenes-so-far so
                        // the bar in the editor advances smoothly over the
                        // entire batch instead of resetting per scene.
                        const overall = (i + progress) / totalScenes;
                        job.progress = Math.min(0.999, Math.max(0, overall));
                        const pct = Math.floor(progress * 100);
                        if (pct !== lastLoggedPct && pct % 25 === 0) {
                            lastLoggedPct = pct;
                            console.log(`[videobox-render] ${job.id} scene ${i + 1} ${pct}%`);
                        }
                    },
                });
            }

            // Bundle everything into a single zip.
            job.status = "packing";
            const zipName = `videobox-scenes-${job.id}.zip`;
            const zipPath = path.join(OUTPUT_DIR, zipName);
            console.log(`[videobox-render] ${job.id} zipping ${totalScenes} scenes → ${zipName}`);
            await zipDirectory(sceneDir, zipPath);
            // Drop the per-scene mp4s now that they're inside the zip.
            try { fs.rmSync(sceneDir, { recursive: true, force: true }); } catch (_) {}

            job.outputPath = zipPath;
            job.outputName = zipName;
            job.outputMime = "application/zip";
        } else {
            // Integral mode: single mp4 of the full composition.
            const filename = `videobox-${job.id}.mp4`;
            const outputLocation = path.join(OUTPUT_DIR, filename);
            job.outputName = filename;
            job.outputMime = "video/mp4";
            await renderFull({ job, serveUrl, composition, inputProps, outputLocation, cancelSignal });
            job.outputPath = outputLocation;
        }

        job.progress = 1;
        job.status = "done";
        job.finishedAt = Date.now();
        const ms = job.finishedAt - job.startedAt;
        console.log(`[videobox-render] ${job.id} done in ${ms}ms → ${job.outputName}`);
    } catch (err) {
        // Cancellation paths land here too — Remotion's cancelSignal rejects
        // with a "cancelled" Error, and our pre-render guards throw the same
        // message. Surface it as a distinct status so the UI can show
        // "Cancelled" / "Timed out" instead of generic "Failed".
        const isCancelled = job.cancelled || /cancel/i.test(String(err?.message || err));
        if (timedOut) {
            console.log(`[videobox-render] ${job.id} timed_out`);
            job.status = "timed_out";
            job.error = `render exceeded ${Math.round(job.timeoutMs / 1000)}s timeout`;
        } else if (isCancelled) {
            console.log(`[videobox-render] ${job.id} cancelled`);
            job.status = "cancelled";
            job.error = "cancelled by user";
        } else {
            console.error(`[videobox-render] ${job.id} FAIL`, err);
            job.status = "failed";
            job.error = String(err?.message || err);
        }
        job.finishedAt = Date.now();
        // Best-effort cleanup of any partial output. Per-scene staging dirs
        // and integral mp4s might exist; wipe both.
        try {
            const staging = path.join(OUTPUT_DIR, `scenes-${job.id}`);
            if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
        } catch (_) {}
        try {
            const partial = path.join(OUTPUT_DIR, `videobox-${job.id}.mp4`);
            if (fs.existsSync(partial)) fs.unlinkSync(partial);
        } catch (_) {}
    } finally {
        clearTimeout(timeoutHandle);
    }
}

// ───────────────────────── HTTP ─────────────────────────
const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Loopback asset cache. The rendered bundle's ASSET_BASE_URL points here,
// so OffthreadVideo / Audio / Img inside the headless tab reads files
// straight off this container's tmpfs. Pre-warmed by /render before
// renderMedia starts; lazy-cached on miss for anything we didn't predict.
app.get(/^\/cache\/(.+)$/, async (req, res) => {
    const relPath = decodeURIComponent(req.params[0] || "");
    if (!relPath || relPath.includes("..")) {
        return res.status(400).send("bad path");
    }
    try {
        const filePath = await ensureCached(relPath);
        res.setHeader("Cache-Control", "public, max-age=3600");
        // The headless Chromium that renders the bundle during server-side
        // renders serves it from a different local port than this Express
        // app, so video/image fetches into /cache are cross-origin from its
        // perspective. Without this header the browser silently blocks the
        // response (net::ERR_FAILED) and Remotion's per-frame media wait
        // never resolves — the render doesn't fail, it just crawls at a
        // few percent progress per minute. Safe to open wide: this proxy
        // only ever re-serves already-public CDN content.
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.sendFile(filePath);
    } catch (err) {
        const msg = err?.message || String(err);
        console.warn(`[videobox-render] cache miss for ${relPath}: ${msg}`);
        res.status(502).send(`asset fetch failed: ${msg}`);
    }
});

app.post("/render", (req, res) => {
    // Two body shapes accepted:
    //   - bare videoProps               → mode "integral"
    //   - { props, mode: "scenes" }     → render scene by scene + zip
    const body = req.body || {};
    let inputProps, mode;
    if (body && typeof body === "object" && body.props && typeof body.props === "object") {
        inputProps = body.props;
        mode = body.mode === "scenes" ? "scenes" : "integral";
    } else {
        inputProps = body;
        mode = "integral";
    }
    // Inject only the selected Lottie transition (if any) so the bundle
    // reads it synchronously from inputProps instead of fetching at render
    // time. Avoids shipping ~1.5 MB of unused Lottie JSON in every render.
    const selectedTransition = typeof inputProps?.transition === "string" ? inputProps.transition : null;
    const scopedTransitions = (selectedTransition && TRANSITIONS_PRELOAD[selectedTransition])
        ? { [selectedTransition]: TRANSITIONS_PRELOAD[selectedTransition] }
        : {};
    inputProps = { ...inputProps, transitions: scopedTransitions };
    // Per-request timeout (seconds), clamped to [1, MAX_RENDER_TIMEOUT_MS/1000].
    // Default 15 min. If ?timeout is malformed we fall back to default rather
    // than 400ing — the caller might be a legacy editor without the param.
    const rawTimeout = Number.parseInt(String(req.query.timeout || ""), 10);
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
        ? Math.min(MAX_RENDER_TIMEOUT_MS, rawTimeout * 1000)
        : DEFAULT_RENDER_TIMEOUT_MS;
    const job = newJob();
    job.mode = mode;
    job.timeoutMs = timeoutMs;
    console.log(`[videobox-render] ${job.id} queued (mode=${mode}, transition=${selectedTransition || "none"}, timeout=${Math.round(timeoutMs / 1000)}s)`);
    enqueue(() => runRender(job, inputProps, mode), {
        maxWaitMs: timeoutMs + CANCEL_GRACE_MS,
        label: job.id,
    });
    res.json({ ok: true, id: job.id, mode, timeoutSec: Math.round(timeoutMs / 1000) });
});

app.get("/render/:id/status", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
        return res.status(404).json({ ok: false, error: "unknown render id" });
    }
    const payload = {
        ok: true,
        id: job.id,
        status: job.status,
        // Round to 3 decimals so jitter doesn't churn the UI.
        progress: Math.round(job.progress * 1000) / 1000,
        error: job.error,
        outputName: job.outputName,
        timedOut: Boolean(job.timedOut),
    };
    if (job.startedAt) payload.elapsedMs = (job.finishedAt || Date.now()) - job.startedAt;
    res.json(payload);
});

app.post("/render/:id/cancel", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
        return res.status(404).json({ ok: false, error: "unknown render id" });
    }
    if (["done", "failed", "cancelled", "timed_out"].includes(job.status)) {
        return res.json({ ok: true, id: job.id, status: job.status, note: "already finished" });
    }
    console.log(`[videobox-render] ${job.id} cancel requested (status=${job.status})`);
    if (typeof job.cancelFn === "function") {
        job.cancelFn();
    } else {
        // No cancel function yet → render is queued but hasn't started.
        // Mark cancelled so the worker skips it when it gets to the head.
        job.cancelled = true;
        job.status = "cancelled";
        job.finishedAt = Date.now();
    }
    res.json({ ok: true, id: job.id, status: job.status });
});

app.get("/render/:id/file", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
        return res.status(404).json({ ok: false, error: "unknown render id" });
    }
    if (job.status !== "done" || !job.outputPath) {
        return res.status(409).json({ ok: false, error: `not ready (status=${job.status})` });
    }
    res.setHeader("Content-Type", job.outputMime || "application/octet-stream");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${job.outputName}"`
    );
    const stream = fs.createReadStream(job.outputPath);
    stream.pipe(res);
    stream.on("close", () => {
        fs.unlink(job.outputPath, () => {});
        job.outputPath = null;
    });
});

// Periodic sweep: drop job records and orphan mp4s older than JOB_TTL_MS.
setInterval(() => {
    const cutoff = Date.now() - JOB_TTL_MS;
    for (const [id, job] of jobs) {
        if ((job.finishedAt || job.createdAt) < cutoff) {
            if (job.outputPath) fs.unlink(job.outputPath, () => {});
            jobs.delete(id);
        }
    }
    // Catch any orphan mp4/zip not tracked by a job (e.g. left from a
    // previous process). Anything in OUTPUT_DIR older than JOB_TTL_MS is
    // fair game — same for the per-scene staging directories.
    try {
        for (const entry of fs.readdirSync(OUTPUT_DIR, { withFileTypes: true })) {
            const p = path.join(OUTPUT_DIR, entry.name);
            try {
                const st = fs.statSync(p);
                if (st.mtimeMs >= cutoff) continue;
                if (entry.isDirectory() && entry.name.startsWith("scenes-")) {
                    fs.rmSync(p, { recursive: true, force: true });
                } else if (entry.isFile() && /\.(mp4|zip)$/.test(entry.name)) {
                    fs.unlinkSync(p);
                }
            } catch (_) {}
        }
    } catch (_) {}
}, 10 * 60 * 1000).unref();

(async () => {
    // Pre-warm Chromium so the first render isn't slow. When
    // BROWSER_EXECUTABLE is set we skip this — ensureBrowser() would try to
    // download chrome-headless-shell over the network, but our system
    // chromium is already on disk.
    if (!BROWSER_EXECUTABLE) {
        try {
            await ensureBrowser();
        } catch (err) {
            console.warn("[videobox-render] ensureBrowser failed (will retry on demand):", err?.message || err);
        }
    } else {
        console.log(`[videobox-render] using system browser at ${BROWSER_EXECUTABLE}`);
    }
    app.listen(PORT, () => {
        console.log(`[videobox-render] listening on ${PORT}`);
    });
})();
