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
const ASSET_BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "https://storage.googleapis.com/audeobox-cdn/videobox";
const RENDER_API_BASE = process.env.NEXT_PUBLIC_RENDER_API_BASE || "/api/render";
const FEED_BASE_URL = process.env.NEXT_PUBLIC_FEED_BASE_URL || "/audeobox-feeds";
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

// Maximum wall-clock time any single render may occupy the queue. Remotion's
// per-handle `timeoutInMilliseconds` doesn't fire when a Chromium tab dies
// silently, so without this cap a wedged render dead-locks every job behind
// it in the FIFO chain. Default 15 min covers a 30 s 1080×1920 render with
// generous headroom; override with RENDER_WALL_CLOCK_MS for longer comps.
const RENDER_WALL_CLOCK_MS = Number(process.env.RENDER_WALL_CLOCK_MS) || 15 * 60 * 1000;

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
    };
    jobs.set(id, record);
    return record;
}

// ───────────────────────── Render queue ─────────────────────────
// Serialise renders: a 1080×1920 30 s comp uses ~1 GB and a Chromium
// instance. Letting two run in parallel on this WSL/podman host causes the
// second browser launch to time out at 30 s ("setting up the headless
// browser") and leaves zombie chrome-headless processes behind.
let renderQueue = Promise.resolve();
function enqueue(task) {
    renderQueue = renderQueue.then(() => task()).catch(() => {});
    return renderQueue;
}

// Race a task against a wall-clock deadline. On timeout we fire the job's
// cancelFn (if any) to nudge Remotion's cancelSignal, log it, and surface a
// distinct "timeout" status — then resolve so the queue advances even when
// Chromium is silently dead. The original task keeps running in the
// background; it can finish into a now-orphaned job record without breaking
// anything, but we no longer block the chain on it.
function withWallClockTimeout(job, taskPromise, ms) {
    let timer;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => {
            if (["done", "failed", "cancelled"].includes(job.status)) {
                resolve();
                return;
            }
            console.error(`[videobox-render] ${job.id} TIMEOUT after ${ms}ms — abandoning slot`);
            try { job.cancelFn?.(); } catch (_) {}
            job.status = "timeout";
            job.error = `wall-clock timeout after ${Math.round(ms / 1000)}s`;
            job.finishedAt = Date.now();
            resolve();
        }, ms);
    });
    return Promise.race([
        taskPromise.finally(() => clearTimeout(timer)),
        timeout,
    ]);
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
    console.log(`[videobox-render] ${job.id} start (mode=${mode})`);
    // One cancel signal per job. cancel() is wired to job.cancelFn so the
    // /cancel endpoint can fire it from outside this scope.
    const { cancelSignal, cancel } = makeCancelSignal();
    job.cancelFn = () => {
        if (job.cancelled) return;
        job.cancelled = true;
        try { cancel(); } catch (_) {}
    };
    try {
        const serveUrl = await getBundle();
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
        // "Cancelled" instead of "Failed".
        const isCancelled = job.cancelled || /cancel/i.test(String(err?.message || err));
        if (isCancelled) {
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
    }
}

// ───────────────────────── HTTP ─────────────────────────
const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

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
    const job = newJob();
    job.mode = mode;
    console.log(`[videobox-render] ${job.id} queued (mode=${mode})`);
    enqueue(() => withWallClockTimeout(job, runRender(job, inputProps, mode), RENDER_WALL_CLOCK_MS));
    res.json({ ok: true, id: job.id, mode });
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
    };
    if (job.startedAt) payload.elapsedMs = (job.finishedAt || Date.now()) - job.startedAt;
    res.json(payload);
});

app.post("/render/:id/cancel", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) {
        return res.status(404).json({ ok: false, error: "unknown render id" });
    }
    if (["done", "failed", "cancelled"].includes(job.status)) {
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
