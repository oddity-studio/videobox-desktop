"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Player, type PlayerRef, Thumbnail } from "@remotion/player";
// overlayscrollbars — replaces native scrollbars on the scene list with
// a fully-custom thin, dark, no-arrow scrollbar. Identical look across
// Chrome / Firefox / Safari; no platform-specific quirks.
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import "overlayscrollbars/overlayscrollbars.css";
import { HelloWorld, LAYOUT_OPTIONS, FONT_OPTIONS, getLayoutControls, isBattleLayout, isWeeklyTitleLayout, isKillstreakOverlayLayout, isKingOverlayLayout, isSlideLinesOverlayLayout, isSlideLinesDuelLayout, isSlideLinesTourneyLayout, isSlideLinesFixedLayout, isTextBlockLayout, isPrizesGridLayout, isTop10Layout, isSubtitleEnabledLayout, PRIZE_LOGOS, getLayoutDefaultDuration, getLayoutDefaultFontSize, resolveLayoutIndex, getLayoutLabel, resolveBackgroundVideo, resolveSceneMusic } from "@/src/HelloWorld";
import { defaultVideoProps, videoPropsSchema, FPS, DEFAULT_SCENE_DURATION, getSceneFrames, getTotalFrames } from "@/src/types";
import type { VideoProps, Scene, ColorScheme } from "@/src/types";
import { assetUrl, feedUrl, renderApiUrl } from "@/src/config";
import { AUTOMATE_PARSERS } from "./automateParsers";

type RssEntry = { username: string; number: string };

const RSS_FEEDS: Record<string, string> = {
  "weekly-top-battles": feedUrl("weekly-top-battles.xml"),
  "weekly-top-wins": feedUrl("weekly-top-wins.xml"),
  "weekly-top-plays": feedUrl("weekly-top-plays.xml"),
  "weekly-top-votes": feedUrl("weekly-top-votes.xml"),
  "weekly-top-comments": feedUrl("weekly-top-comments.xml"),
  "weekly-top-xp": feedUrl("weekly-top-xp.xml"),
  "top-winstreak": feedUrl("top-winstreak.xml"),
  "weekly-top-genre-kings": feedUrl("weekly-top-genre-kings.xml"),
  "top-producers": feedUrl("top-producers.xml"),
  "current-tourney": feedUrl("current-tourney.xml"),
};

type RssBinding = {
  feedKey: string;
  slotIndex: number;
  format?: "stats" | "numUser" | "top10" | "bracket" | "lineup";
};

const LAYOUT_RSS_BINDINGS: Record<string, RssBinding[]> = {
  "Weekly Stats 1": [
    { feedKey: "weekly-top-battles", slotIndex: 0 },
    { feedKey: "weekly-top-wins", slotIndex: 1 },
    { feedKey: "weekly-top-plays", slotIndex: 2 },
  ],
  "Weekly Stats 2": [
    { feedKey: "weekly-top-votes", slotIndex: 0 },
    { feedKey: "weekly-top-comments", slotIndex: 1 },
    { feedKey: "weekly-top-xp", slotIndex: 2 },
  ],
  "Killstreak": [
    { feedKey: "top-winstreak", slotIndex: 0, format: "numUser" },
  ],
  "King": [
    { feedKey: "weekly-top-genre-kings", slotIndex: 0, format: "numUser" },
  ],
  "Top10": [
    { feedKey: "top-producers", slotIndex: 0, format: "top10" },
  ],
  "Bracket": [
    { feedKey: "current-tourney", slotIndex: 0, format: "bracket" },
  ],
  // Lineup pulls the same current-tourney feed as Bracket but populates
  // ALL of Round 1's pairs at once — 16 (or however many) Player 1
  // names into layer 1, Player 2 names into layer 2.
  "Lineup": [
    { feedKey: "current-tourney", slotIndex: 0, format: "lineup" },
  ],
};

async function fetchRssLastBuildDate(): Promise<Date | null> {
  const feedUrl = RSS_FEEDS["weekly-top-battles"];
  if (!feedUrl) return null;
  try {
    // corsproxy.io was here originally — needed when videobox was on
    // GitHub Pages. Now that audeobox API sends CORS headers for
    // local/dev/www audeobox origins we can fetch the feed directly.
    const res = await fetch(feedUrl);
    if (!res.ok) return null;
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const raw = doc.querySelector("lastBuildDate")?.textContent;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

async function fetchRssFeed(feedKey: string): Promise<RssEntry | null> {
  const feedUrl = RSS_FEEDS[feedKey];
  if (!feedUrl) return null;
  try {
    // corsproxy.io was here originally — needed when videobox was on
    // GitHub Pages. Now that audeobox API sends CORS headers for
    // local/dev/www audeobox origins we can fetch the feed directly.
    const res = await fetch(feedUrl);
    if (!res.ok) return null;
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const title = doc.querySelector("item > title")?.textContent ?? "";
    const m = title.match(/#\d+\s*[—–-]\s*(.+?)\s*\((\d+)/);
    if (!m) return null;
    return { username: m[1].trim(), number: m[2] };
  } catch {
    return null;
  }
}

async function fetchRssAll(feedKey: string): Promise<RssEntry[]> {
  const feedUrl = RSS_FEEDS[feedKey];
  if (!feedUrl) return [];
  try {
    // corsproxy.io was here originally — needed when videobox was on
    // GitHub Pages. Now that audeobox API sends CORS headers for
    // local/dev/www audeobox origins we can fetch the feed directly.
    const res = await fetch(feedUrl);
    if (!res.ok) return [];
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const items = doc.querySelectorAll("item > title");
    const entries: RssEntry[] = [];
    items.forEach((el) => {
      const m = (el.textContent ?? "").match(/#\d+\s*[—–-]\s*(.+?)\s*\((\d+)/);
      if (m) entries.push({ username: m[1].trim(), number: m[2] });
    });
    return entries;
  } catch {
    return [];
  }
}

type TourneyItem = { user1: string; user2: string; round: number };

async function fetchTourneyFeed(): Promise<TourneyItem[]> {
  const feedUrl = RSS_FEEDS["current-tourney"];
  if (!feedUrl) return [];
  try {
    // corsproxy.io was here originally — needed when videobox was on
    // GitHub Pages. Now that audeobox API sends CORS headers for
    // local/dev/www audeobox origins we can fetch the feed directly.
    const res = await fetch(feedUrl);
    if (!res.ok) return [];
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const items = doc.querySelectorAll("item");
    const result: TourneyItem[] = [];
    items.forEach((item) => {
      const round = parseInt(item.querySelector("round")?.textContent ?? "0", 10);
      const user1 = item.querySelector("user1")?.textContent ?? "";
      const user2 = item.querySelector("user2")?.textContent ?? "";
      result.push({ user1, user2, round });
    });
    return result;
  } catch {
    return [];
  }
}

function applyRssToScene(scene: Scene, bindings: RssBinding[], cache: Record<string, RssEntry>, cacheAll: Record<string, RssEntry[]>, tourneyItems?: TourneyItem[]): Scene {
  const fmt = bindings[0]?.format;
  if (fmt === "bracket" && tourneyItems?.length) {
    const parts = (scene.text || "").split("\n");
    const meta = (parts[3] || "0,0").split(",");
    const round = parseInt(meta[0] || "0", 10) + 1;
    const group = parseInt(meta[1] || "0", 10);
    const roundItems = tourneyItems.filter((it) => it.round === round);
    const idx1 = group * 2;
    const idx2 = group * 2 + 1;
    const item1 = roundItems[idx1];
    const item2 = roundItems[idx2];
    if (!item1 && !item2) return scene;
    const l1Prev = (parts[0] || "").split("|");
    const l2Prev = (parts[1] || "").split("|");
    const box1 = item1?.user1 ?? l1Prev[0] ?? "";
    const box2 = item1?.user2 ?? l2Prev[0] ?? "";
    const box3 = item2?.user1 ?? l1Prev[1] ?? "";
    const box4 = item2?.user2 ?? l2Prev[1] ?? "";
    const nextRoundItems = tourneyItems.filter((it) => it.round === round + 1);
    const nextNames = new Set(nextRoundItems.flatMap((it) => [it.user1.toLowerCase(), it.user2.toLowerCase()]));
    const t1 = item1 ? (nextNames.has(item1.user1.toLowerCase()) ? "0" : "1") : (parts[2] || "0,0").split(",")[0] || "0";
    const t2 = item2 ? (nextNames.has(item2.user1.toLowerCase()) ? "0" : "1") : (parts[2] || "0,0").split(",")[1] || "0";
    const roundGroup = parts[3] || "0,0";
    return { ...scene, text: `${box1}|${box3}\n${box2}|${box4}\n${t1},${t2}\n${roundGroup}` };
  }
  if (fmt === "lineup" && tourneyItems?.length) {
    // Pull every Round-1 pair into a single Lineup scene:
    //   layer1 (line 1) = all Player 1 names, pipe-separated
    //   layer2 (line 2) = all Player 2 names, pipe-separated
    // Pipes preserve multi-word names; the renderer accepts either pipes
    // or spaces for back-compat with older space-separated text.
    const round1 = tourneyItems.filter((it) => it.round === 1).slice(0, 16);
    if (!round1.length) return scene;
    const layer1 = round1.map((it) => it.user1.trim()).join("|");
    const layer2 = round1.map((it) => it.user2.trim()).join("|");
    return { ...scene, text: `${layer1}\n${layer2}` };
  }
  if (fmt === "top10") {
    const entries = cacheAll[bindings[0].feedKey];
    if (!entries?.length) return scene;
    return { ...scene, text: entries.map((e) => `${e.username}|${e.number}`).join("|") };
  }
  if (fmt === "numUser") {
    const entry = cache[bindings[0].feedKey];
    if (!entry) return scene;
    return { ...scene, text: `${entry.number}|${entry.username}` };
  }
  const [users = "", nums = ""] = scene.text.split("\n");
  const uArr = users.split("|");
  const nArr = nums.split("|");
  for (const { feedKey, slotIndex } of bindings) {
    const entry = cache[feedKey];
    if (!entry) continue;
    uArr[slotIndex] = entry.username;
    nArr[slotIndex] = entry.number;
  }
  return { ...scene, text: `${uArr.join("|")}\n${nArr.join("|")}` };
}

const RSS_BORDER = { border: "1px solid #f59e0b" };

const hasRssBindings = (layout: string | number | undefined): boolean => {
  const label = typeof layout === "string" ? layout : getLayoutLabel(typeof layout === "number" ? layout : -1);
  return label != null && (label in LAYOUT_RSS_BINDINGS || label === "Weekly Title");
};

const SCENE_DURATION = DEFAULT_SCENE_DURATION * FPS;

const IconPlay = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <polygon points="5,3 17,10 5,17" />
  </svg>
);
const IconPause = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <rect x="4" y="3" width="4" height="14" rx="1" />
    <rect x="12" y="3" width="4" height="14" rx="1" />
  </svg>
);
const IconPrev = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <rect x="3" y="3" width="2" height="14" rx="1" />
    <polygon points="17,3 7,10 17,17" />
  </svg>
);
const IconNext = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <polygon points="3,3 13,10 3,17" />
    <rect x="15" y="3" width="2" height="14" rx="1" />
  </svg>
);
const IconFullscreen = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7V3h4" />
    <path d="M13 3h4v4" />
    <path d="M17 13v4h-4" />
    <path d="M7 17H3v-4" />
  </svg>
);
const IconMuted = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="3,7 7,7 12,3 12,17 7,13 3,13" fill="currentColor" stroke="none" />
    <line x1="14" y1="7" x2="18" y2="13" />
    <line x1="18" y1="7" x2="14" y2="13" />
  </svg>
);
const IconUnmuted = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="3,7 7,7 12,3 12,17 7,13 3,13" fill="currentColor" stroke="none" />
    <path d="M14.5 7c1.5 1.5 1.5 4.5 0 6" />
    <path d="M16.8 5c2.4 2.4 2.4 7.6 0 10" />
  </svg>
);
const IconChevronDown = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5,8 10,13 15,8" />
  </svg>
);

// Property icons used inside timeline segments and gallery cards.
// Size + colour controllable via props so the same components are reused
// for both surfaces.
type IconProps = { size?: number; color: string };

const IconPropSpeaker: React.FC<IconProps> = ({ size = 24, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M3 9v6h4l5 5V4L7 9H3z" />
  </svg>
);

const IconPropVideoCamera: React.FC<IconProps> = ({ size = 24, color }) => (
  // Classic video-camera / videocall silhouette: rounded body + lens
  // pointing right.
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
    <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" />
  </svg>
);

const IconPropRss: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#f59e0b" aria-hidden>
    <circle cx="6" cy="18" r="2.2" />
    <path d="M4 11.5v2.6c3.8 0 6.9 3.1 6.9 6.9h2.6c0-5.2-4.3-9.5-9.5-9.5z" />
    <path d="M4 5v2.6c7.4 0 13.4 6 13.4 13.4H20C20 12.5 12.8 5 4 5z" />
  </svg>
);

export default function Editor() {
  const [props, setProps] = useState<VideoProps>(defaultVideoProps);
  const [rendering, setRendering] = useState(false);
  const [exportRes, setExportRes] = useState<"720p" | "1080p">("720p");
  const [renderProgress, setRenderProgress] = useState(0);
  const [serverRendering, setServerRendering] = useState(false);
  const [serverRenderError, setServerRenderError] = useState<string | null>(null);
  // Live progress from the videobox render server's /status polling loop:
  // status ∈ "queued" | "bundling" | "selecting" | "rendering"
  //        | "packing" (scenes mode) | "done" | "failed"
  // progress is 0..1 (only meaningful while status === "rendering")
  const [serverRenderStatus, setServerRenderStatus] = useState<string>("");
  const [serverRenderProgress, setServerRenderProgress] = useState(0);
  const [serverRenderEtaMs, setServerRenderEtaMs] = useState<number | null>(null);
  // Which server render is currently active. null when idle; otherwise
  // tracks the mode that fired so the progress fill stays put if the
  // toggle switch is moved mid-render.
  const [serverRenderMode, setServerRenderMode] = useState<"integral" | "scenes" | null>(null);
  // The Full/Scenes switch selection — this is what the single Render
  // button uses when clicked. Persists across renders.
  const [serverRenderTarget, setServerRenderTarget] = useState<"integral" | "scenes">("integral");
  // Active job id from the render server's POST /render response. Held in
  // a ref so the Stop button can fire /cancel without recreating the
  // handler each poll tick.
  const serverRenderJobIdRef = useRef<string | null>(null);
  const [serverRenderCancelling, setServerRenderCancelling] = useState(false);
  // A server render is useful only while this editor is present to poll and
  // download it. Best-effort cancellation on navigation prevents a closed tab
  // from leaving Chromium/FFmpeg busy until the server-side timeout.
  useEffect(() => {
    const cancelActiveServerRender = () => {
      const id = serverRenderJobIdRef.current;
      if (!id) return;
      void fetch(renderApiUrl(`${id}/cancel`), {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", cancelActiveServerRender);
    return () => {
      window.removeEventListener("pagehide", cancelActiveServerRender);
      cancelActiveServerRender();
    };
  }, []);
  // Mobile/vertical-screen tab navigation. On wide screens the three
  // sections (preset, scenes, preview) sit side-by-side; on narrow
  // viewports only the active tab is visible and a fixed bottom bar
  // switches between them.
  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<"preset" | "scenes" | "preview">("scenes");
  // Quick Tips panel sits below the preset panel in the left column.
  // Default collapsed — only the title bar with a chevron is visible.
  const [tipsExpanded, setTipsExpanded] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const [recordingMode, setRecordingMode] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  // "add"  → gallery click appends a new scene (legacy behaviour)
  // "swap" → gallery click replaces the layout of scenes[selectedSceneIndex]
  const [galleryMode, setGalleryMode] = useState<"add" | "swap">("add");
  // Which timeline segment the user has clicked on. Drives the
  // Swap-Scene button and the highlight on its segment.
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  // Per-scene RSS data status for the Data tile in the timeline row.
  // loadedSceneData tracks scenes whose RSS fetch has completed in this
  // session; fetchingScenes tracks active in-flight fetches.
  const [loadedSceneData, setLoadedSceneData] = useState<Set<number>>(new Set());
  const [fetchingScenes, setFetchingScenes] = useState<Set<number>>(new Set());
  // Ref + drag state for the duration-resize handle on the selected
  // segment. Tracking via ref (not state) so we don't churn renders 60×/s
  // while the user is dragging; updateScene() drives the actual UI update.
  const timelineRef = useRef<HTMLDivElement>(null);
  const sceneDragRef = useRef<{
    sceneIndex: number;
    startX: number;
    startDuration: number;
    pxPerSec: number;
  } | null>(null);
  // Per-layout flag for "the picker/thumbs/<label>.webp image 404'd, fall
  // back to live <Thumbnail>". Shared between gallery cards and timeline
  // segments so we don't re-attempt failed URLs.
  // (Originally defined further below for the gallery — keeping the
  // declaration there to avoid a duplicate.)
  const playerRef = useRef<PlayerRef>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [portraitNames, setPortraitNames] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  // Sample top-producers data used as ghost placeholders inside Top10
  // inputs — only fetched when the "Weekly Report" preset is selected
  // so other presets aren't paying for an RSS call they don't need.
  const [top10Samples, setTop10Samples] = useState<RssEntry[]>([]);
  useEffect(() => {
    if (selectedPreset !== "Weekly Report") {
      setTop10Samples([]);
      return;
    }
    let cancelled = false;
    fetchRssAll("top-producers").then((entries) => {
      if (!cancelled) setTop10Samples(entries.slice(0, 10));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedPreset]);
  const [fetching, setFetching] = useState(false);
  const [automateText, setAutomateText] = useState("");
  const [thumbMissing, setThumbMissing] = useState<Record<number, boolean>>({});
  const [showDevTools, setShowDevTools] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "`" && !["INPUT","TEXTAREA","SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        setShowDevTools((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Subscribe to Remotion Player events so our custom controls reflect state.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onMuteChange = (e: { detail: { isMuted: boolean } }) => setIsMuted(e.detail.isMuted);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    player.addEventListener("mutechange", onMuteChange);
    setIsMuted(player.isMuted());
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
      player.removeEventListener("mutechange", onMuteChange);
    };
  }, []);

  // Poll current frame every animation frame so the progress bar stays in sync.
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const p = playerRef.current;
      if (p) {
        const f = p.getCurrentFrame();
        if (f !== last) {
          last = f;
          setCurrentFrame(f);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleBakeFrame = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen capture not supported.");
      return;
    }
    let displayStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        // @ts-expect-error preferCurrentTab is a newer Chrome API
        preferCurrentTab: true,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      throw err;
    }
    setRecordingMode(true);
    await new Promise((r) => setTimeout(r, 600));
    try {
      const playerWrap = document.querySelector(".player-wrap") as HTMLElement;
      if (!playerWrap) throw new Error("Player not found");

      // Try CropTarget for an exact crop
      let cropSuccess = false;
      // @ts-expect-error CropTarget newer Chrome API
      if (typeof CropTarget !== "undefined") {
        try {
          // @ts-expect-error
          const ct = await CropTarget.fromElement(playerWrap);
          // @ts-expect-error
          await displayStream.getVideoTracks()[0].cropTo(ct);
          cropSuccess = true;
        } catch {}
      }
      const rect = playerWrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.round(rect.left * dpr);
      const sy = Math.round(rect.top * dpr);
      const sw = Math.round(rect.width * dpr);
      const sh = Math.round(rect.height * dpr);

      // Read one frame from the track
      const track = displayStream.getVideoTracks()[0];
      const processor = new MediaStreamTrackProcessor({ track });
      const reader = processor.readable.getReader();
      // Skip a couple of frames to let cropTo settle
      for (let i = 0; i < 3; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        if (i < 2) value?.close();
        else if (value) {
          const out = new OffscreenCanvas(1080, 1920);
          const ctx = out.getContext("2d")!;
          if (cropSuccess) ctx.drawImage(value, 0, 0, 1080, 1920);
          else ctx.drawImage(value, sx, sy, sw, sh, 0, 0, 1080, 1920);
          value.close();
          const blob = await out.convertToBlob({ type: "image/png" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          // Name by current first scene's layout index if any
          const layoutIdx = resolveLayoutIndex(props.scenes[0]?.layout, 0);
          a.href = url;
          a.download = `${layoutIdx}.png`;
          a.click();
          URL.revokeObjectURL(url);
          break;
        }
      }
      reader.cancel();
    } finally {
      displayStream?.getTracks().forEach((t) => t.stop());
      setRecordingMode(false);
    }
  }, [props.scenes]);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const loadPreset = useCallback(async (name: string) => {
    try {
      // Presets are bundled locally (public/picker/presets), not on the
      // CDN — served straight off the app's own origin via Next's static
      // export, so there's no asset-upload step when adding a new one.
      const res = await fetch(`/picker/presets/${encodeURIComponent(name)}.json`);
      const data = await res.json();
      const parsed = videoPropsSchema.safeParse(data);
      if (!parsed.success) return;
      setProps({ ...parsed.data, overlayVideo: parsed.data.overlayVideo ?? "none" });
      setSelectedPreset(name);
    } catch {}
  }, []);

  // Fetch preset list, then auto-load S13 Demo
  useEffect(() => {
    // Local, not CDN — see loadPreset above for why.
    fetch("/picker/presets/index.json")
      .then((r) => r.json())
      .then((names: string[]) => setPresetNames(names))
      .catch(() => {});
    fetch(assetUrl("picker/Portraits/index.json"))
      .then((r) => r.json())
      .then((names: string[]) => setPortraitNames(names))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (presetNames.length > 0 && !selectedPreset) {
      if (presetNames.includes("S13 Demo")) loadPreset("S13 Demo");
    }
  }, [presetNames, loadPreset, selectedPreset]);

  // Group layouts by category
  const categories = LAYOUT_OPTIONS.reduce<Record<string, typeof LAYOUT_OPTIONS>>((acc, opt) => {
    (acc[opt.category] ??= []).push(opt);
    return acc;
  }, {});
  const categoryEntries = Object.entries(categories).sort(([left], [right]) => {
    if (left === "Season 13") return -1;
    if (right === "Season 13") return 1;
    return 0;
  });

  const handleSave = useCallback(() => {
    // Strip blob: URLs from backgroundVideo since they're session-only, but keep muted state.
    // Also normalize layout → string label so presets survive template reordering.
    const cleaned = {
      ...props,
      scenes: props.scenes.map((s) => {
        let scene = s;
        if (typeof s.layout === "number") {
          const label = getLayoutLabel(s.layout);
          if (label) scene = { ...scene, layout: label };
        }
        if (scene.backgroundVideo?.src?.startsWith("blob:")) {
          const { backgroundVideo, ...rest } = scene;
          const muted = backgroundVideo?.muted;
          return muted !== undefined ? { ...rest, backgroundVideo: { src: "", muted } } : rest;
        }
        return scene;
      }),
    };
    const json = JSON.stringify(cleaned, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "videobox-preset.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [props]);

  const handleLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = videoPropsSchema.safeParse(JSON.parse(reader.result as string));
        if (parsed.success) {
          setProps({ ...parsed.data, overlayVideo: parsed.data.overlayVideo ?? "none" });
        } else {
          alert("Invalid preset file.");
        }
      } catch {
        alert("Could not read preset file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const renderClipBlob = useCallback(async (
    clipProps: VideoProps,
    displayStream: MediaStream,
    hwPref: HardwareAcceleration,
    onProgress: (pct: number) => void,
    audioStartFrame: number = 0,
  ): Promise<Blob> => {
    const outW = exportRes === "1080p" ? 1080 : 720;
    const outH = exportRes === "1080p" ? 1920 : 1280;
    const playerWrap = document.querySelector(".player-wrap") as HTMLElement;
    if (!playerWrap) throw new Error("Player element not found");

    const totalFramesLocal = getTotalFrames(clipProps);
    const durationMs = (totalFramesLocal / FPS) * 1000;

    // Pre-load and decode audio
    const audioCtx = new AudioContext();
    let audioBuf: AudioBuffer;
    if (!clipProps.music || clipProps.music === "none") {
      audioBuf = audioCtx.createBuffer(2, audioCtx.sampleRate, audioCtx.sampleRate);
    } else {
      const audioResp = await fetch(assetUrl(`picker/music/${clipProps.music}`));
      audioBuf = await audioCtx.decodeAudioData(await audioResp.arrayBuffer());
    }

    // Mix in unmuted scene video audio
    const clipTotalSamples = Math.ceil((audioCtx.sampleRate * durationMs) / 1000);
    const clipMixBuf = audioCtx.createBuffer(2, clipTotalSamples, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = clipMixBuf.getChannelData(c);
      if (audioBuf.numberOfChannels > 0) {
        const musicSrc = audioBuf.getChannelData(Math.min(c, audioBuf.numberOfChannels - 1));
        const musicStart = Math.floor((audioStartFrame / FPS) * audioCtx.sampleRate);
        const musicSlice = musicSrc.subarray(musicStart, musicStart + clipTotalSamples);
        ch.set(musicSlice.subarray(0, Math.min(musicSlice.length, clipTotalSamples)));
      }
    }
    let clipSceneOffset = 0;
    for (const scene of clipProps.scenes) {
      const sceneFrames = getSceneFrames(scene);
      const sceneSamples = Math.ceil((sceneFrames / FPS) * audioCtx.sampleRate);
      const bgVideo = resolveBackgroundVideo(scene);
      if (bgVideo?.muted === false && bgVideo?.src) {
        const videoUrl = assetUrl(bgVideo.src);
        try {
          const resp = await fetch(videoUrl);
          const videoAudio = await audioCtx.decodeAudioData(await resp.arrayBuffer());
          const startFrom = bgVideo.startFrom ?? 0;
          const srcStart = Math.floor((startFrom / FPS) * audioCtx.sampleRate);
          const dstStart = Math.floor((clipSceneOffset / FPS) * audioCtx.sampleRate);
          for (let c = 0; c < 2; c++) {
            const dst = clipMixBuf.getChannelData(c);
            const s = videoAudio.getChannelData(Math.min(c, videoAudio.numberOfChannels - 1));
            for (let j = 0; j < sceneSamples && (srcStart + j) < s.length && (dstStart + j) < dst.length; j++) {
              dst[dstStart + j] += s[srcStart + j];
            }
          }
        } catch (e) {
          console.warn("Could not decode scene video audio:", e);
        }
      }
      const sm = resolveSceneMusic(scene);
      if (sm && scene.sceneMusicMuted !== true) {
        try {
          const resp = await fetch(assetUrl(sm.src));
          const smAudio = await audioCtx.decodeAudioData(await resp.arrayBuffer());
          const dstStart = Math.floor((clipSceneOffset / FPS) * audioCtx.sampleRate);
          const smSrcStart = Math.floor((sm.startFrom ?? 0) * audioCtx.sampleRate);
          const fadeInSamples = Math.round((sm.fadeIn ?? 0.3) * audioCtx.sampleRate);
          const fadeOutSamples = Math.round((sm.fadeOut ?? 0.5) * audioCtx.sampleRate);
          for (let c = 0; c < 2; c++) {
            const dst = clipMixBuf.getChannelData(c);
            const s = smAudio.getChannelData(Math.min(c, smAudio.numberOfChannels - 1));
            for (let j = 0; j < sceneSamples && (smSrcStart + j) < s.length && (dstStart + j) < dst.length; j++) {
              let vol = 1;
              if (j < fadeInSamples) vol = j / fadeInSamples;
              if (j > sceneSamples - fadeOutSamples) vol = Math.min(vol, (sceneSamples - j) / fadeOutSamples);
              dst[dstStart + j] += s[smSrcStart + j] * vol;
            }
          }
        } catch (e) {
          console.warn("Could not decode scene music audio:", e);
        }
      }
      clipSceneOffset += sceneFrames;
    }
    audioBuf = clipMixBuf;
    await audioCtx.close();

    const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      firstTimestampBehavior: "offset",
      video: { codec: "avc", width: outW, height: outH },
      audio: {
        codec: "aac",
        sampleRate: audioBuf.sampleRate,
        numberOfChannels: audioBuf.numberOfChannels,
      },
      fastStart: "in-memory",
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error("VideoEncoder:", e),
    });
    videoEncoder.configure({
      codec: "avc1.640034",
      width: outW,
      height: outH,
      bitrate: 10_000_000,
      framerate: FPS,
      hardwareAcceleration: hwPref,
    });

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error("AudioEncoder:", e),
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audioBuf.sampleRate,
      numberOfChannels: audioBuf.numberOfChannels,
      bitrate: 128_000,
    });

    let cropSuccess = false;
    // @ts-expect-error CropTarget
    if (typeof CropTarget !== "undefined") {
      try {
        // @ts-expect-error
        const ct = await CropTarget.fromElement(playerWrap);
        // @ts-expect-error
        await displayStream.getVideoTracks()[0].cropTo(ct);
        cropSuccess = true;
      } catch {}
    }

    const rect = playerWrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.round(rect.left * dpr);
    const sy = Math.round(rect.top * dpr);
    const sw = Math.round(rect.width * dpr);
    const sh = Math.round(rect.height * dpr);

    const offscreen = new OffscreenCanvas(outW, outH);
    const offCtx = offscreen.getContext("2d")!;

    playerRef.current?.seekTo(0);
    playerRef.current?.play();
    const startTime = performance.now();
    let frameCount = 0;

    const videoTrack = displayStream.getVideoTracks()[0].clone();
    const processor = new MediaStreamTrackProcessor({ track: videoTrack });
    const reader = processor.readable.getReader();

    while (true) {
      const { value: frame, done } = await reader.read();
      if (done || !frame) break;
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) {
        frame.close();
        break;
      }
      if (cropSuccess) offCtx.drawImage(frame, 0, 0, outW, outH);
      else offCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, outW, outH);
      const outputFrame = new VideoFrame(offscreen, { timestamp: frame.timestamp });
      videoEncoder.encode(outputFrame, { keyFrame: frameCount % 120 === 0 });
      outputFrame.close();
      frame.close();
      frameCount++;
      onProgress(Math.min(95, Math.round((elapsed / durationMs) * 100)));
    }

    playerRef.current?.pause();
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
    try { videoTrack.stop(); } catch {}

    const CHUNK_SIZE = 1024;
    const maxSamples = Math.min(audioBuf.length, Math.ceil((audioBuf.sampleRate * durationMs) / 1000));
    for (let i = 0; i < maxSamples; i += CHUNK_SIZE) {
      const len = Math.min(CHUNK_SIZE, maxSamples - i);
      const data = new Float32Array(len * audioBuf.numberOfChannels);
      for (let c = 0; c < audioBuf.numberOfChannels; c++) {
        data.set(audioBuf.getChannelData(c).subarray(i, i + len), c * len);
      }
      const ad = new AudioData({
        format: "f32-planar",
        sampleRate: audioBuf.sampleRate,
        numberOfFrames: len,
        numberOfChannels: audioBuf.numberOfChannels,
        timestamp: Math.round((i / audioBuf.sampleRate) * 1_000_000),
        data,
      });
      audioEncoder.encode(ad);
      ad.close();
    }

    await videoEncoder.flush();
    await audioEncoder.flush();
    videoEncoder.close();
    audioEncoder.close();
    muxer.finalize();

    onProgress(100);
    return new Blob([target.buffer], { type: "video/mp4" });
  }, [exportRes]);

  // Server-side render via the dedicated Videobox render container. The
  // endpoint is async + poll-based so
  // we get a live progress bar instead of waiting on one long HTTP
  // request (which used to time out at nginx and made the UX opaque):
  //   1. POST /api/render    → { id }
  //   2. GET  /api/render/:id/status  every 2 s until status
  //      is "done" or "failed"
  //   3. GET  /api/render/:id/file    to download the mp4
  // mode === "scenes" asks the server to render each scene as its own
  // mp4 and bundle them into a single zip download.
  const handleServerRender = useCallback(async (mode: "integral" | "scenes" = "integral") => {
    if (serverRendering) return;
    setServerRendering(true);
    setServerRenderMode(mode);
    setServerRenderError(null);
    setServerRenderStatus("queued");
    setServerRenderProgress(0);
    setServerRenderEtaMs(null);
    try {
      // 1. enqueue
      const startRes = await fetch(renderApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The resolution selector applies to server renders too. Previously
        // the UI defaulted to 720p while this path silently rendered every
        // job at 1080x1920, doing 2.25x as much pixel work as requested.
        body: JSON.stringify({ props, mode, resolution: exportRes }),
      });
      if (!startRes.ok) {
        const text = await startRes.text().catch(() => "");
        throw new Error(`Server render failed (HTTP ${startRes.status}): ${text.slice(0, 200) || startRes.statusText}`);
      }
      const { id } = (await startRes.json()) as { id: string };
      if (!id) throw new Error("Server did not return a render id");
      serverRenderJobIdRef.current = id;

      // 2. poll for completion. 2 s feels responsive for a render that
      //    runs for minutes without being chatty on the network.
      let outputName = "videobox.mp4";
      let consecutiveStatusFailures = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        let s: {
          status: string;
          progress: number;
          error: string | null;
          outputName?: string;
          estimatedRemainingMs?: number | null;
        };
        try {
          const sRes = await fetch(renderApiUrl(`${id}/status`));
          if (!sRes.ok) {
            throw new Error(`Status check failed (HTTP ${sRes.status})`);
          }
          s = await sRes.json();
          consecutiveStatusFailures = 0;
        } catch (err) {
          consecutiveStatusFailures += 1;
          if (consecutiveStatusFailures < 5) {
            console.warn(
              `[videobox] render status check ${consecutiveStatusFailures}/5 failed; retrying`,
              err,
            );
            continue;
          }
          throw err;
        }
        setServerRenderStatus(s.status);
        setServerRenderProgress(s.progress);
        setServerRenderEtaMs(
          typeof s.estimatedRemainingMs === "number" ? s.estimatedRemainingMs : null,
        );
        if (s.outputName) outputName = s.outputName;
        if (s.status === "done") break;
        if (s.status === "cancelled") {
          // Treat as a clean exit — no download, no error toast.
          return;
        }
        if (s.status === "failed") {
          throw new Error(s.error || "render failed");
        }
        if (s.status === "timed_out") {
          // Server-side failsafe fired (DEFAULT_RENDER_TIMEOUT_MS in
          // server.mjs). Show the user an error so they know the render
          // didn't silently die — otherwise the loop would poll forever.
          throw new Error(s.error || "render timed out");
        }
      }

      // 3. download. Fetch as a blob so we can trigger a save with the
      //    server-supplied filename (matches what the legacy direct-stream
      //    flow used to do).
      const fileRes = await fetch(renderApiUrl(`${id}/file`));
      if (!fileRes.ok) {
        throw new Error(`Download failed (HTTP ${fileRes.status})`);
      }
      const blob = await fileRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outputName || (mode === "scenes" ? "videobox-scenes.zip" : "videobox.mp4");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Do not cancel on the first failed status/download request: a transient
      // proxy or network blip should get the server-side lease grace period.
      // If this client truly stopped polling, the renderer cancels the job
      // after RENDER_CLIENT_LEASE_MS; pagehide still cancels immediately.
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[videobox] server render failed", err);
      setServerRenderError(msg);
      alert(`Server render failed:\n${msg}`);
    } finally {
      setServerRendering(false);
      setServerRenderMode(null);
      setServerRenderStatus("");
      setServerRenderProgress(0);
      setServerRenderCancelling(false);
      serverRenderJobIdRef.current = null;
    }
  }, [props, serverRendering, exportRes]);

  // Stop button → fires POST /render/:id/cancel. The poll loop above sees
  // status="cancelled" on its next tick and exits cleanly through the
  // finally block, so we don't need to mutate any flow state ourselves.
  const handleServerRenderCancel = useCallback(async () => {
    const id = serverRenderJobIdRef.current;
    if (!id || serverRenderCancelling) return;
    setServerRenderCancelling(true);
    try {
      await fetch(renderApiUrl(`${id}/cancel`), { method: "POST" });
    } catch (err) {
      console.warn("[videobox] cancel request failed", err);
    }
  }, [serverRenderCancelling]);

  const handleDownloadPerScene = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof VideoEncoder === "undefined") {
      alert("Screen capture or video encoding not supported.");
      return;
    }
    let displayStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: FPS } },
        // @ts-expect-error preferCurrentTab
        preferCurrentTab: true,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") return;
      throw err;
    }

    const savedProps = props;
    const scenes = props.scenes;
    setRendering(true);
    setRecordingMode(true);
    setRenderProgress(0);
    await new Promise((r) => setTimeout(r, 600));

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    try {
      let cumulativeFrames = 0;
      for (let i = 0; i < scenes.length; i++) {
        const sceneProps: VideoProps = { ...savedProps, scenes: [scenes[i]] };
        setProps(sceneProps);
        await new Promise((r) => setTimeout(r, 800));
        const blob = await renderClipBlob(
          sceneProps,
          displayStream,
          "no-preference",
          (pct) => setRenderProgress(Math.round(((i + pct / 100) / scenes.length) * 100)),
          cumulativeFrames,
        );
        zip.file(`scene-${String(i + 1).padStart(2, "0")}.mp4`, blob);
        cumulativeFrames += getSceneFrames(scenes[i]);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scenes.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Per-scene render failed. See console.");
    } finally {
      displayStream?.getTracks().forEach((t) => t.stop());
      setProps(savedProps);
      setRendering(false);
      setRecordingMode(false);
      setRenderProgress(0);
    }
  }, [props, renderClipBlob]);

  const handleDownload = useCallback(async (hwPref: HardwareAcceleration = "no-preference") => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert(
        'Screen capture not supported. Use Chrome or run "npm run render" for offline export.',
      );
      return;
    }
    if (typeof VideoEncoder === "undefined") {
      alert(
        'Video encoding not supported. Use Chrome 94+ or run "npm run render" for offline export.',
      );
      return;
    }

    // Capture the current tab immediately while user gesture is still active
    let displayStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: FPS } },
        // @ts-expect-error preferCurrentTab is a newer Chrome API
        preferCurrentTab: true,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        return; // User cancelled — no alert needed
      }
      throw err;
    }

    const outW = exportRes === "1080p" ? 1080 : 720;
    const outH = exportRes === "1080p" ? 1920 : 1280;
    const totalFrames = getTotalFrames(props);
    const durationMs = (totalFrames / FPS) * 1000;

    setRendering(true);
    setRecordingMode(true);
    setRenderProgress(0);

    // Wait for recording overlay to render
    await new Promise((r) => setTimeout(r, 600));

    try {
      const playerWrap = document.querySelector(
        ".player-wrap",
      ) as HTMLElement;
      if (!playerWrap) throw new Error("Player element not found");

      // Pre-load and decode audio
      const audioCtx = new AudioContext();
      let audioBuf: AudioBuffer;
      if (!props.music || props.music === "none") {
        // Silent 1s stereo buffer; will be encoded as silence
        audioBuf = audioCtx.createBuffer(2, audioCtx.sampleRate, audioCtx.sampleRate);
      } else {
        const audioResp = await fetch(assetUrl(`picker/music/${props.music}`));
        audioBuf = await audioCtx.decodeAudioData(await audioResp.arrayBuffer());
      }

      // Mix in unmuted scene video audio
      const totalSamples = Math.ceil((audioCtx.sampleRate * durationMs) / 1000);
      const mixBuf = audioCtx.createBuffer(2, totalSamples, audioCtx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = mixBuf.getChannelData(c);
        if (audioBuf.numberOfChannels > 0) {
          const src = audioBuf.getChannelData(Math.min(c, audioBuf.numberOfChannels - 1));
          ch.set(src.subarray(0, Math.min(src.length, totalSamples)));
        }
      }
      let sceneOffset = 0;
      for (const scene of props.scenes) {
        const sceneFrames = getSceneFrames(scene);
        const sceneSamples = Math.ceil((sceneFrames / FPS) * audioCtx.sampleRate);
        const bgVideo = resolveBackgroundVideo(scene);
        if (bgVideo?.muted === false && bgVideo?.src) {
          const videoUrl = assetUrl(bgVideo.src);
          try {
            const resp = await fetch(videoUrl);
            const videoAudio = await audioCtx.decodeAudioData(await resp.arrayBuffer());
            const startFrom = bgVideo.startFrom ?? 0;
            const srcStart = Math.floor((startFrom / FPS) * audioCtx.sampleRate);
            const dstStart = Math.floor((sceneOffset / FPS) * audioCtx.sampleRate);
            for (let c = 0; c < 2; c++) {
              const dst = mixBuf.getChannelData(c);
              const s = videoAudio.getChannelData(Math.min(c, videoAudio.numberOfChannels - 1));
              for (let j = 0; j < sceneSamples && (srcStart + j) < s.length && (dstStart + j) < dst.length; j++) {
                dst[dstStart + j] += s[srcStart + j];
              }
            }
          } catch (e) {
            console.warn("Could not decode scene video audio:", e);
          }
        }
        const sm = resolveSceneMusic(scene);
        if (sm && scene.sceneMusicMuted !== true) {
          try {
            const resp = await fetch(assetUrl(sm.src));
            const smAudio = await audioCtx.decodeAudioData(await resp.arrayBuffer());
            const dstStart = Math.floor((sceneOffset / FPS) * audioCtx.sampleRate);
            const smSrcStart = Math.floor((sm.startFrom ?? 0) * audioCtx.sampleRate);
            const fadeInSamples = Math.round((sm.fadeIn ?? 0.3) * audioCtx.sampleRate);
            const fadeOutSamples = Math.round((sm.fadeOut ?? 0.5) * audioCtx.sampleRate);
            for (let c = 0; c < 2; c++) {
              const dst = mixBuf.getChannelData(c);
              const s = smAudio.getChannelData(Math.min(c, smAudio.numberOfChannels - 1));
              for (let j = 0; j < sceneSamples && (smSrcStart + j) < s.length && (dstStart + j) < dst.length; j++) {
                let vol = 1;
                if (j < fadeInSamples) vol = j / fadeInSamples;
                if (j > sceneSamples - fadeOutSamples) vol = Math.min(vol, (sceneSamples - j) / fadeOutSamples);
                dst[dstStart + j] += s[smSrcStart + j] * vol;
              }
            }
          } catch (e) {
            console.warn("Could not decode scene music audio:", e);
          }
        }
        sceneOffset += sceneFrames;
      }
      audioBuf = mixBuf;
      await audioCtx.close();

      // Set up MP4 muxer
      const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
      const target = new ArrayBufferTarget();
      const muxer = new Muxer({
        target,
        firstTimestampBehavior: "offset",
        video: { codec: "avc", width: outW, height: outH },
        audio: {
          codec: "aac",
          sampleRate: audioBuf.sampleRate,
          numberOfChannels: audioBuf.numberOfChannels,
        },
        fastStart: "in-memory",
      });

      // Video encoder (H.264)
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => console.error("VideoEncoder:", e),
      });
      videoEncoder.configure({
        codec: "avc1.640034",
        width: outW,
        height: outH,
        bitrate: 10_000_000,
        framerate: FPS,
        hardwareAcceleration: hwPref,
      });

      // Audio encoder (AAC)
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error("AudioEncoder:", e),
      });
      audioEncoder.configure({
        codec: "mp4a.40.2",
        sampleRate: audioBuf.sampleRate,
        numberOfChannels: audioBuf.numberOfChannels,
        bitrate: 128_000,
      });

      // Crop to the player element if CropTarget is available (Chrome 104+)
      let cropSuccess = false;
      // @ts-expect-error CropTarget is a newer Chrome API
      if (typeof CropTarget !== "undefined") {
        try {
          // @ts-expect-error CropTarget is a newer Chrome API
          const ct = await CropTarget.fromElement(playerWrap);
          // @ts-expect-error cropTo is a newer Chrome API
          await displayStream.getVideoTracks()[0].cropTo(ct);
          cropSuccess = true;
        } catch {
          /* CropTarget not supported, fall back to manual crop */
        }
      }

      // For manual crop fallback: get player position
      const rect = playerWrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const sx = Math.round(rect.left * dpr);
      const sy = Math.round(rect.top * dpr);
      const sw = Math.round(rect.width * dpr);
      const sh = Math.round(rect.height * dpr);

      // Offscreen canvas for frame resizing
      const offscreen = new OffscreenCanvas(outW, outH);
      const offCtx = offscreen.getContext("2d")!;

      // Start playback
      playerRef.current?.seekTo(0);
      playerRef.current?.play();
      const startTime = performance.now();
      let frameCount = 0;

      // Read frames from the captured video track
      const videoTrack = displayStream.getVideoTracks()[0];
      const processor = new MediaStreamTrackProcessor({ track: videoTrack });
      const reader = processor.readable.getReader();

      while (true) {
        const { value: frame, done } = await reader.read();
        if (done || !frame) break;

        const elapsed = performance.now() - startTime;
        if (elapsed >= durationMs) {
          frame.close();
          break;
        }

        // Draw frame to offscreen canvas (crop if needed, always resize to 1080x1920)
        if (cropSuccess) {
          offCtx.drawImage(frame, 0, 0, outW, outH);
        } else {
          offCtx.drawImage(frame, sx, sy, sw, sh, 0, 0, outW, outH);
        }

        const outputFrame = new VideoFrame(offscreen, {
          timestamp: frame.timestamp,
        });
        videoEncoder.encode(outputFrame, {
          keyFrame: frameCount % 120 === 0,
        });
        outputFrame.close();
        frame.close();
        frameCount++;

        setRenderProgress(
          Math.min(95, Math.round((elapsed / durationMs) * 100)),
        );
      }

      // Stop capture + playback
      playerRef.current?.pause();
      videoTrack.stop();

      displayStream.getTracks().forEach((t) => t.stop());
      displayStream = null;

      // Encode audio
      const CHUNK_SIZE = 1024;
      const maxSamples = Math.min(
        audioBuf.length,
        Math.ceil((audioBuf.sampleRate * durationMs) / 1000),
      );
      for (let i = 0; i < maxSamples; i += CHUNK_SIZE) {
        const len = Math.min(CHUNK_SIZE, maxSamples - i);
        const data = new Float32Array(len * audioBuf.numberOfChannels);
        for (let c = 0; c < audioBuf.numberOfChannels; c++) {
          data.set(
            audioBuf.getChannelData(c).subarray(i, i + len),
            c * len,
          );
        }
        if (audioBuf.numberOfChannels === 1) {
          data.set(data.subarray(0, len), len);
        }
        const ad = new AudioData({
          format: "f32-planar",
          sampleRate: audioBuf.sampleRate,
          numberOfFrames: len,
          numberOfChannels: audioBuf.numberOfChannels,
          timestamp: Math.round((i / audioBuf.sampleRate) * 1_000_000),
          data,
        });
        audioEncoder.encode(ad);
        ad.close();
      }

      // Finalize MP4
      await videoEncoder.flush();
      await audioEncoder.flush();
      videoEncoder.close();
      audioEncoder.close();
      muxer.finalize();

      setRenderProgress(100);

      // Download
      const blob = new Blob([target.buffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "videobox.mp4";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error(err);
      alert("Recording failed. Check the console for details.");
    } finally {
      displayStream?.getTracks().forEach((t) => t.stop());
      setRendering(false);
      setRecordingMode(false);
      setRenderProgress(0);
    }
  }, [props, exportRes]);

  const updateScene = (
    index: number,
    field: keyof Scene,
    value: string | number | boolean | Scene["backgroundVideo"],
  ) => {
    setProps((prev) => ({
      ...prev,
      scenes: prev.scenes.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      ),
    }));
  };

  const updateColor = (key: keyof ColorScheme, value: string) => {
    setProps((prev) => ({
      ...prev,
      colorScheme: { ...prev.colorScheme, [key]: value },
    }));
  };

  const removeScene = (index: number) => {
    setProps((prev) => ({
      ...prev,
      scenes: prev.scenes.filter((_, i) => i !== index),
    }));
  };

  const reorderScene = (from: number, to: number) => {
    if (from === to) return;
    setProps((prev) => {
      const scenes = [...prev.scenes];
      const [moved] = scenes.splice(from, 1);
      scenes.splice(to, 0, moved);
      return { ...prev, scenes };
    });
  };

  // Fetch RSS data for a single scene. Mirrors the global "Fetch Data"
  // button's pipeline but only touches one scene; lets each Data tile in
  // the timeline row drive its own fetch and flip "Fetch" → "Loaded".
  const fetchSceneData = useCallback(async (sceneIndex: number) => {
    setFetchingScenes((prev) => {
      if (prev.has(sceneIndex)) return prev;
      const next = new Set(prev);
      next.add(sceneIndex);
      return next;
    });
    try {
      const scene = props.scenes[sceneIndex];
      if (!scene) return;
      const resolveLabel = (l: string | number | undefined) =>
        typeof l === "string" ? l : getLayoutLabel(typeof l === "number" ? l : -1) ?? "";
      const label = resolveLabel(scene.layout);
      const layoutIdxRaw = resolveLayoutIndex(scene.layout, -1);
      const isWeeklyTitle = isWeeklyTitleLayout(layoutIdxRaw);
      const bindings = LAYOUT_RSS_BINDINGS[label];
      if (!bindings && !isWeeklyTitle) return;

      const cache: Record<string, RssEntry> = {};
      const cacheAll: Record<string, RssEntry[]> = {};
      let tourneyItems: TourneyItem[] = [];
      let buildDate: Date | null = null;

      if (isWeeklyTitle) {
        buildDate = await fetchRssLastBuildDate();
      }

      if (bindings) {
        const needsTourney = bindings.some((b) => b.format === "bracket" || b.format === "lineup");
        const singleKeys = [...new Set(
          bindings.filter((b) => b.format !== "bracket" && b.format !== "top10").map((b) => b.feedKey),
        )];
        const allKeys = [...new Set(
          bindings.filter((b) => b.format === "top10").map((b) => b.feedKey),
        )];

        if (needsTourney) {
          tourneyItems = await fetchTourneyFeed();
        }
        for (let i = 0; i < singleKeys.length; i++) {
          if (i > 0 || needsTourney || isWeeklyTitle) await new Promise((r) => setTimeout(r, 300));
          const entry = await fetchRssFeed(singleKeys[i]);
          if (entry) cache[singleKeys[i]] = entry;
        }
        for (let i = 0; i < allKeys.length; i++) {
          if (i > 0 || singleKeys.length > 0 || needsTourney) await new Promise((r) => setTimeout(r, 300));
          const entries = await fetchRssAll(allKeys[i]);
          if (entries.length) cacheAll[allKeys[i]] = entries;
        }
      }

      const hasData = Object.keys(cache).length > 0
        || Object.keys(cacheAll).length > 0
        || tourneyItems.length > 0
        || buildDate != null;
      if (!hasData) return;

      setProps((prev) => ({
        ...prev,
        scenes: prev.scenes.map((s, idx) => {
          if (idx !== sceneIndex) return s;
          let updated = s;
          if (buildDate && isWeeklyTitleLayout(resolveLayoutIndex(s.layout, -1))) {
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
            const snap = new Date(buildDate);
            const sun = new Date(snap);
            sun.setDate(snap.getDate() - snap.getDay());
            const nextSun = new Date(sun);
            nextSun.setDate(sun.getDate() + 7);
            updated = { ...updated, text: `${months[sun.getMonth()]} ${ord(sun.getDate())} – ${months[nextSun.getMonth()]} ${ord(nextSun.getDate())}` };
          }
          const b = LAYOUT_RSS_BINDINGS[resolveLabel(updated.layout)];
          if (b) {
            updated = applyRssToScene(updated, b, cache, cacheAll, tourneyItems);
          }
          return updated;
        }),
      }));

      setLoadedSceneData((prev) => {
        const next = new Set(prev);
        next.add(sceneIndex);
        return next;
      });
    } finally {
      setFetchingScenes((prev) => {
        if (!prev.has(sceneIndex)) return prev;
        const next = new Set(prev);
        next.delete(sceneIndex);
        return next;
      });
    }
  }, [props.scenes]);

  const totalFrames = getTotalFrames(props);

  // Cumulative start frame of each scene, for custom prev/next scene controls.
  const sceneStarts = useMemo(() => {
    const starts: number[] = [];
    let acc = 0;
    for (const scene of props.scenes) {
      starts.push(acc);
      acc += getSceneFrames(scene);
    }
    return starts;
  }, [props.scenes]);

  const handleTogglePlay = useCallback(() => {
    playerRef.current?.toggle();
  }, []);
  // Middle mouse button (wheel click) anywhere on the page toggles
  // play/pause. mousedown is handled in the capture phase + preventDefault
  // on the auxclick `mousedown` so the browser doesn't enter its
  // auto-scroll mode (the round scroll cursor).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 1) return;
      // Don't hijack middle-click inside text inputs / textareas / links —
      // users may expect native behavior there (open in new tab, etc.).
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, a, select')) return;
      e.preventDefault();
      handleTogglePlay();
    };
    document.addEventListener('mousedown', onMouseDown);
    // Some browsers also fire `auxclick` for middle button — suppress
    // there too to avoid double-toggling or the autoscroll cursor.
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    document.addEventListener('auxclick', onAuxClick);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('auxclick', onAuxClick);
    };
  }, [handleTogglePlay]);
  const handlePrevScene = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const f = p.getCurrentFrame();
    const BUFFER = FPS; // if more than 1s into current scene, restart it; else jump to previous
    for (let i = sceneStarts.length - 1; i >= 0; i--) {
      if (sceneStarts[i] <= f - BUFFER) {
        p.seekTo(sceneStarts[i]);
        // Keep the timeline + scenes-list selection in sync with the
        // player so the property tiles below the timeline update too.
        setSelectedSceneIndex(i);
        return;
      }
    }
    p.seekTo(0);
    setSelectedSceneIndex(0);
  }, [sceneStarts]);
  const handleNextScene = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const f = p.getCurrentFrame();
    for (let i = 0; i < sceneStarts.length; i++) {
      if (sceneStarts[i] > f) {
        p.seekTo(sceneStarts[i]);
        setSelectedSceneIndex(i);
        return;
      }
    }
    // Already past the last scene start — clamp to end frame and pin
    // the selection to the final scene.
    p.seekTo(Math.max(0, totalFrames - 1));
    if (sceneStarts.length > 0) setSelectedSceneIndex(sceneStarts.length - 1);
  }, [sceneStarts, totalFrames]);
  const handleToggleMute = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) p.unmute();
    else p.mute();
  }, []);
  const handleFullscreen = useCallback(() => {
    playerRef.current?.requestFullscreen();
  }, []);

  // Renders a single scene row (drag handle, conditional inputs per
  // layout type, font-size, delete button). Lifted out of the map so we
  // can render the same row on the mobile Preview tab below the player —
  // letting the user edit the active scene while watching it.
  //
  // `compact` strips the drag handle + reorder behaviour so the inputs
  // can take the full row width (used on mobile Preview where the row
  // stands on its own and order is meaningless).
  const renderSceneRow = (scene: Scene, i: number, opts?: { compact?: boolean }) => {
    const compact = opts?.compact === true;
    // Per-layout caption customisation. Most layouts fall through to the
    // generic "TITLE" caption above the main input, but a handful
    // get tailored labels — and some have multiple inputs that each need
    // their own caption (handled inside the relevant variants below).
    const _layoutIdx = resolveLayoutIndex(scene.layout, i);
    const _layoutLabel = getLayoutLabel(_layoutIdx) || "";
    const _slideStatsCaptions: [string, string][] | null =
      _layoutLabel === "Weekly Stats 1"
        ? [["MOST BATTLES", "SCORE"], ["MOST WINS", "SCORE"], ["MOST PLAYED", "SCORE"]]
        : _layoutLabel === "Weekly Stats 2"
          ? [["MOST VOTES CAST", "SCORE"], ["MOST COMMENTS", "SCORE"], ["BIGGEST XP JUMP", "SCORE"]]
          : null;
    let _outerCaption: string | null = "Title";
    if (isWeeklyTitleLayout(_layoutIdx)) _outerCaption = "Date";
    else if (isBattleLayout(_layoutIdx)) _outerCaption = null;     // PLAYER 1 / PLAYER 2 inside
    else if (_slideStatsCaptions) _outerCaption = null;            // per-column captions inside
    else if (isPrizesGridLayout(_layoutIdx)) _outerCaption = "Pick sponsor logos";
    else if (isKillstreakOverlayLayout(_layoutIdx) || isKingOverlayLayout(_layoutIdx)) _outerCaption = null; // Player/Streak or King/Crowns inside
    else if (isSlideLinesFixedLayout(_layoutIdx)) _outerCaption = null; // Bracket — per-input captions inside
    else if (_layoutLabel === "Lineup") _outerCaption = "Tournament Lineup";
    else if (isTop10Layout(_layoutIdx)) _outerCaption = null;        // "Top 10 Players" caption rendered inline above row 0
    else if (isTextBlockLayout(_layoutIdx)) _outerCaption = null;     // First/Second/Third Line + Portrait inside
    return (
    <div
      key={i}
      className={`scene-list-row${i === selectedSceneIndex && !compact ? " is-selected" : ""}`}
      onClick={() => {
        setSelectedSceneIndex(i);
        // Also jump the player to this scene's start so the preview
        // mirrors the click — same behaviour as clicking a timeline
        // segment. Safe when the row is rendered in compact mode too:
        // sceneStarts is keyed by index and updated with the scenes list.
        const startFrame = sceneStarts[i] ?? 0;
        playerRef.current?.seekTo(startFrame);
      }}
      {...(compact ? {} : {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault();
          // Live reorder: as the dragged row crosses over a new row,
          // swap them immediately. Update dragIndex so subsequent
          // dragOver events know where the moving row sits now. If the
          // moved scene was the selected one (or selection sat on the
          // target row), keep the selection following the user's intent.
          if (dragIndex === null || dragIndex === i) return;
          reorderScene(dragIndex, i);
          setSelectedSceneIndex((prev) => {
            if (prev === dragIndex) return i;
            // Selection on a row that got shifted by the swap: nudge it
            // to stay on the same scene visually.
            if (dragIndex < prev && prev <= i) return prev - 1;
            if (i <= prev && prev < dragIndex) return prev + 1;
            return prev;
          });
          setDragIndex(i);
        },
        onDrop: () => { setDragIndex(null); setDragOverIndex(null); },
        onDragEnd: () => { setDragIndex(null); setDragOverIndex(null); },
      })}
      style={{
        ...styles.sceneRow,
        // Slight fade on the row being dragged so it's obvious which one
        // is moving while the rest shuffles around it.
        opacity: !compact && dragIndex === i ? 0.4 : 1,
        ...(isSlideLinesFixedLayout(resolveLayoutIndex(scene.layout, i)) ? { alignItems: "flex-start" } : {}),
        ...(i === selectedSceneIndex && !compact ? styles.sceneRowSelected : null),
      }}
    >
      {/* Left-side drag handle + order number removed — the top-of-row
          divider strip handles reordering now. */}
      {/* Main input column. The outer caption defaults to "Title"
          but switches to "Date" for Weekly Title, or is omitted when
          the variant below renders its own per-input captions (Battle
          → PLAYER 1/2, Weekly Stats → per-column). Layouts with
          subtitleEnabled (S13 Caption 1-4) get a second "Subtitle"
          input rendered below the main one — see the closing of
          sceneInputCell further down. */}
      <div style={styles.sceneInputCell}>
        {_outerCaption && (
          <span style={styles.sceneInputCaption}>{_outerCaption}</span>
        )}
      {isSlideLinesOverlayLayout(resolveLayoutIndex(scene.layout, i)) ? (
        isSlideLinesFixedLayout(resolveLayoutIndex(scene.layout, i)) ? (
          (() => {
            const parts = (scene.text || "").split("\n");
            const l1Entries = (parts[0] || "").split("|");
            const l2Entries = (parts[1] || "").split("|");
            const toggles = (parts[2] || "0,0").split(",");
            const meta = (parts[3] || "0,0").split(",");
            const box1 = l1Entries[0] || "";
            const box3 = l1Entries[1] || "";
            const box2 = l2Entries[0] || "";
            const box4 = l2Entries[1] || "";
            const t1 = toggles[0] === "1";
            const t2 = toggles[1] === "1";
            const round = parseInt(meta[0] || "0", 10);
            const group = parseInt(meta[1] || "0", 10);
            const save = (b1: string, b2: string, b3: string, b4: string, s1: boolean, s2: boolean, r = round, g = group) => {
              updateScene(i, "text", `${b1}|${b3}\n${b2}|${b4}\n${s1 ? "1" : "0"},${s2 ? "1" : "0"}\n${r},${g}`);
            };
            const toggleStyle: React.CSSProperties = {
              position: "relative",
              width: 36,
              height: 18,
              borderRadius: 9,
              cursor: "pointer",
              border: "none",
              padding: 0,
              flexShrink: 0,
              alignSelf: "center",
            };
            const knobStyle = (on: boolean): React.CSSProperties => ({
              position: "absolute",
              top: 2,
              left: on ? 18 : 2,
              width: 14,
              height: 14,
              borderRadius: 7,
              background: "#fff",
              transition: "left 0.15s",
            });
            return (
              <span style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <span style={styles.sceneInputCaption}>Battle</span>
                  {(() => {
                    // Group count halves as the bracket advances:
                    //   Round 1 → 8 groups
                    //   Round 2 → 4
                    //   Round 3 → 2
                    //   Round 4+ → 1 (final / winner display)
                    // Note: `round` is 0-indexed (so r=0 means "Round 1").
                    const groupCountFor = (r: number) =>
                      r === 0 ? 8 : r === 1 ? 4 : r === 2 ? 2 : 1;
                    const maxGroupHere = groupCountFor(round) - 1;
                    // Clamp the displayed value so a stale group from an
                    // earlier round doesn't show as "Group 5" when only
                    // groups 1–2 exist now.
                    const clampedGroup = Math.min(group, maxGroupHere);
                    return (
                      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <select
                          style={{ ...styles.layoutSelect, padding: "8px 6px", fontSize: 12 }}
                          value={round}
                          onChange={(e) => {
                            const newRound = Number(e.target.value);
                            const maxGroup = groupCountFor(newRound) - 1;
                            const newGroup = Math.min(group, maxGroup);
                            save(box1, box2, box3, box4, t1, t2, newRound, newGroup);
                          }}
                        >
                          {[0,1,2,3].map((r) => (
                            <option key={r} value={r}>Round {r + 1}</option>
                          ))}
                        </select>
                        <select
                          style={{ ...styles.layoutSelect, padding: "8px 6px", fontSize: 12 }}
                          value={clampedGroup}
                          onChange={(e) => save(box1, box2, box3, box4, t1, t2, round, Number(e.target.value))}
                        >
                          {Array.from({ length: groupCountFor(round) }, (_, g) => (
                            <option key={g} value={g}>Group {g + 1}</option>
                          ))}
                        </select>
                      </span>
                    );
                  })()}
                </span>
                <span style={{ display: "flex", flexDirection: "column", flex: 1, gap: 4, minWidth: 0 }}>
                {/* Row 1: captioned — Player 1 / Outcome / Player 2. The
                    inner gap is bumped so the switch reads as its own
                    column with breathing room on both sides. */}
                <span style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
                  <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                    <span style={styles.sceneInputCaption}>Player 1</span>
                    <input
                      style={{ ...styles.sceneInput, width: "100%" }}
                      value={box1}
                      onChange={(e) => save(e.target.value, box2, box3, box4, t1, t2)}
                      placeholder="L1 line 1"
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", flexShrink: 0 }}>
                    <span style={styles.sceneInputCaption}>WIN</span>
                    <button
                      style={{ ...toggleStyle, background: t1 ? "#a855f7" : "#3b82f6" }}
                      onClick={() => save(box1, box2, box3, box4, !t1, t2)}
                      title={t1 ? "Winner: right" : "Winner: left"}
                    >
                      <div style={knobStyle(t1)} />
                    </button>
                  </div>
                  <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                    <span style={styles.sceneInputCaption}>Player 2</span>
                    <input
                      style={{ ...styles.sceneInput, width: "100%" }}
                      value={box2}
                      onChange={(e) => save(box1, e.target.value, box3, box4, t1, t2)}
                      placeholder="L2 line 1"
                    />
                  </div>
                </span>
                {/* Row 2: no captions — same wide gap around the switch
                    so the columns line up between the two rows. */}
                <span style={{ display: "flex", gap: 24, alignItems: "center" }}>
                  <input
                    style={{ ...styles.sceneInput, flex: 1, minWidth: 0 }}
                    value={box3}
                    onChange={(e) => save(box1, box2, e.target.value, box4, t1, t2)}
                    placeholder="L1 line 2"
                  />
                  <button
                    style={{ ...toggleStyle, background: t2 ? "#a855f7" : "#3b82f6" }}
                    onClick={() => save(box1, box2, box3, box4, t1, !t2)}
                    title={t2 ? "Winner: right" : "Winner: left"}
                  >
                    <div style={knobStyle(t2)} />
                  </button>
                  <input
                    style={{ ...styles.sceneInput, flex: 1, minWidth: 0 }}
                    value={box4}
                    onChange={(e) => save(box1, box2, box3, e.target.value, t1, t2)}
                    placeholder="L2 line 2"
                  />
                </span>
              </span>
              </span>
            );
          })()
        ) : isSlideLinesTourneyLayout(resolveLayoutIndex(scene.layout, i)) ? (
          _layoutLabel === "Lineup" ? (
            (() => {
              // Lineup grid: 4 columns × 8 rows = 32 inputs.
              //   col 1: Player 1, pairs 1–8     col 3: Player 1, pairs 9–16
              //   col 2: Player 2, pairs 1–8     col 4: Player 2, pairs 9–16
              // "VS" sits between col1/col2 and col3/col4 on every row.
              // A 50 px gap separates the first half (cols 1+2) from the
              // second half (cols 3+4).
              const [rawA = "", rawB = ""] = (scene.text || "").split("\n");
              // Pipes preserve multi-word player names. Fall back to
              // space-splitting only when no pipes are present (back-
              // compat with the previous storage format).
              const splitNames = (raw: string) =>
                (raw.includes("|") ? raw.split("|") : raw.split(/\s+/))
                  .map((s) => s.trim());
              const p1 = splitNames(rawA);
              const p2 = splitNames(rawB);
              while (p1.length < 16) p1.push("");
              while (p2.length < 16) p2.push("");
              const save = (np1: string[], np2: string[]) => {
                // Trim trailing empty cells so the stored string is
                // tight (no dangling "|||"). Empty interior cells stay
                // intact so column indices remain stable as the user
                // edits non-contiguous rows.
                const trimTail = (arr: string[]) => {
                  const copy = arr.slice(0, 16);
                  while (copy.length && copy[copy.length - 1] === "") copy.pop();
                  return copy;
                };
                const j1 = trimTail(np1).join("|");
                const j2 = trimTail(np2).join("|");
                updateScene(i, "text", `${j1}\n${j2}`);
              };
              const cellInputStyle: React.CSSProperties = {
                ...styles.sceneInput,
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
              };
              const renderHalf = (start: number) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                  {[0,1,2,3,4,5,6,7].map((row) => {
                    const idx = start + row;
                    // Last row of the second half (P1[15] / P2[15]) gets
                    // example placeholders so the empty grid hints at the
                    // expected shape.
                    const isLast = idx === 15;
                    return (
                      <div key={row} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <input
                          style={cellInputStyle}
                          value={p1[idx]}
                          onChange={(e) => {
                            const next = [...p1];
                            next[idx] = e.target.value;
                            save(next, p2);
                          }}
                          placeholder={isLast ? "Maxx" : ""}
                        />
                        <span style={styles.lineupVs}>VS</span>
                        <input
                          style={cellInputStyle}
                          value={p2[idx]}
                          onChange={(e) => {
                            const next = [...p2];
                            next[idx] = e.target.value;
                            save(p1, next);
                          }}
                          placeholder={isLast ? "Hammer" : ""}
                        />
                      </div>
                    );
                  })}
                </div>
              );
              return (
                <div style={{ display: "flex", flex: 1, gap: 50, minWidth: 0 }}>
                  {renderHalf(0)}
                  {renderHalf(8)}
                </div>
              );
            })()
          ) : (
          (() => {
            const [rawA = "", rawB = ""] = (scene.text || "").split("\n");
            return (
              <span style={{ display: "flex", flex: 1, gap: 4, minWidth: 0 }}>
                <input
                  style={{ ...styles.sceneInput, flex: 1, minWidth: 0 }}
                  value={rawA}
                  onChange={(e) => updateScene(i, "text", `${e.target.value}\n${rawB}`)}
                  placeholder="Layer 1 (space = new line)"
                />
                <input
                  style={{ ...styles.sceneInput, flex: 1, minWidth: 0 }}
                  value={rawB}
                  onChange={(e) => updateScene(i, "text", `${rawA}\n${e.target.value}`)}
                  placeholder="Layer 2 (space = new line)"
                />
              </span>
            );
          })()
          )
        ) : (
        (() => {
          const isDuel = isSlideLinesDuelLayout(resolveLayoutIndex(scene.layout, i));
          const rowCount = isDuel ? 1 : 3;
          const [rawA = "", rawB = ""] = (scene.text || "").split("\n");
          const layer1 = rawA.split("|");
          const layer2 = rawB.split("|");
          while (layer1.length < rowCount) layer1.push("");
          while (layer2.length < rowCount) layer2.push("");
          const save = (l1: string[], l2: string[]) => {
            updateScene(i, "text", `${l1.slice(0, rowCount).join("|")}\n${l2.slice(0, rowCount).join("|")}`);
          };
          // Weekly Stats 1 / 2 stack the 3 (name, score) pairs as rows
          // so the captions read as two columns (Most Battles / Most
          // Wins / Most Played + Score / Score / Score). Other
          // SlideLines defaults keep the side-by-side 3-column layout.
          const stackedRows = _slideStatsCaptions != null;
          return (
            <span style={{
              display: "flex",
              flex: 1,
              gap: stackedRows ? 6 : 4,
              minWidth: 0,
              flexDirection: stackedRows ? "column" : "row",
            }}>
              {Array.from({ length: rowCount }, (_, li) => {
                const [cap1, cap2] = _slideStatsCaptions ? _slideStatsCaptions[li] : ["", ""];
                return (
                <span key={li} style={{ display: "flex", flex: 1, gap: 6, minWidth: 0 }}>
                  <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                    {cap1 && <span style={styles.sceneInputCaption}>{cap1}</span>}
                    <input
                      style={{ ...styles.sceneInput, width: "100%", minWidth: 0 }}
                      value={layer1[li] || ""}
                      onChange={(e) => {
                        const next = [...layer1];
                        next[li] = e.target.value;
                        save(next, layer2);
                      }}
                      placeholder={`Line ${li + 1}`}
                    />
                  </div>
                  <div style={{ ...styles.sceneInputCell, ...(isDuel ? { flex: 1 } : { flex: "0 0 72px" }) }}>
                    {cap2 && <span style={styles.sceneInputCaption}>{cap2}</span>}
                    <input
                      style={{ ...styles.sceneInput, width: "100%", padding: isDuel ? "8px 12px" : "8px 6px" }}
                      {...(isDuel ? {} : { maxLength: 4 })}
                      value={layer2[li] || ""}
                      onChange={(e) => {
                        const next = [...layer2];
                        next[li] = e.target.value;
                        save(layer1, next);
                      }}
                      placeholder="#"
                    />
                  </div>
                </span>
                );
              })}
            </span>
          );
        })()
        )
      ) : isTop10Layout(resolveLayoutIndex(scene.layout, i)) ? (
        (() => {
          // Top10 stores 20 pipe-separated values: User1|Score1|...|
          // User10|Score10. The editor lays them out as 5 rows × 4
          // columns: [User 1] [Score 1] [User 6] [Score 6] / [User 2]
          // [Score 2] [User 7] [Score 7] / … so the eye reads players
          // 1-5 down the left and 6-10 down the right. Score columns
          // are narrow (72 px, same as the Weekly Stats score boxes)
          // and only they get a column caption.
          const raw = (scene.text || "").replace(/\n/g, "|");
          const flat = raw.split("|");
          while (flat.length < 20) flat.push("");
          const setAt = (idx: number, val: string) => {
            const next = flat.slice(0, 20);
            next[idx] = val;
            updateScene(i, "text", next.join("|"));
          };
          const scoreCellStyle: React.CSSProperties = { ...styles.sceneInputCell, flex: "0 0 72px" };
          const userCellStyle: React.CSSProperties = { ...styles.sceneInputCell, flex: 1 };
          const scoreInputStyle: React.CSSProperties = { ...styles.sceneInput, width: "100%", padding: "8px 6px" };
          const userInputStyle: React.CSSProperties = { ...styles.sceneInput, width: "100%", minWidth: 0 };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
              {/* Dedicated header row so every column caption lives on
                  one shared horizontal line — no per-cell caption-and-
                  input mixing that would push inputs around. */}
              <span style={{ display: "flex", gap: 6, minWidth: 0 }}>
                <span style={{ ...styles.sceneInputCaption, flex: 1 }}>Top 10 Players</span>
                <span style={{ ...styles.sceneInputCaption, flex: "0 0 72px" }}>Score</span>
                <span style={{ flex: 1 }} aria-hidden />
                <span style={{ ...styles.sceneInputCaption, flex: "0 0 72px" }}>Score</span>
              </span>
              {[0, 1, 2, 3, 4].map((r) => {
                const leftUserIdx = r * 2;
                const leftScoreIdx = r * 2 + 1;
                const rightUserIdx = r * 2 + 10;
                const rightScoreIdx = r * 2 + 11;
                return (
                  <span key={r} style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
                    <input
                      style={{ ...userInputStyle, flex: 1 }}
                      value={flat[leftUserIdx]}
                      onChange={(e) => setAt(leftUserIdx, e.target.value)}
                      placeholder={`Player ${r + 1}`}
                    />
                    <input
                      style={{ ...scoreInputStyle, flex: "0 0 72px" }}
                      value={flat[leftScoreIdx]}
                      onChange={(e) => setAt(leftScoreIdx, e.target.value)}
                      placeholder="####"
                    />
                    <input
                      style={{ ...userInputStyle, flex: 1 }}
                      value={flat[rightUserIdx]}
                      onChange={(e) => setAt(rightUserIdx, e.target.value)}
                      placeholder={`Player ${r + 6}`}
                    />
                    <input
                      style={{ ...scoreInputStyle, flex: "0 0 72px" }}
                      value={flat[rightScoreIdx]}
                      onChange={(e) => setAt(rightScoreIdx, e.target.value)}
                      placeholder="####"
                    />
                  </span>
                );
              })}
            </div>
          );
        })()
      ) : isKillstreakOverlayLayout(resolveLayoutIndex(scene.layout, i)) || isKingOverlayLayout(resolveLayoutIndex(scene.layout, i)) ? (
        (() => {
          // Killstreak → Player / Streak. King → King / Crowns.
          const isKing = isKingOverlayLayout(resolveLayoutIndex(scene.layout, i));
          const cap1 = isKing ? "King" : "Player";
          const cap2 = isKing ? "Crowns" : "Streak";
          return (
            <span style={{ display: "flex", flex: 1, gap: 6 }}>
              <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                <span style={styles.sceneInputCaption}>{cap1}</span>
                <input
                  style={{ ...styles.sceneInput, width: "100%" }}
                  maxLength={20}
                  value={(scene.text || "").split("|")[1]?.trim() || ""}
                  onChange={(e) => {
                    const parts = (scene.text || "").split("|");
                    const n = parts[0]?.trim() || "";
                    updateScene(i, "text", `${n}|${e.target.value}`);
                  }}
                  placeholder="Username"
                />
              </div>
              <div style={{ ...styles.sceneInputCell, flex: "0 0 72px" }}>
                <span style={styles.sceneInputCaption}>{cap2}</span>
                <input
                  style={{ ...styles.sceneInput, width: "100%", padding: "8px 6px" }}
                  value={(scene.text || "").split("|")[0]?.trim() || ""}
                  onChange={(e) => {
                    const parts = (scene.text || "").split("|");
                    const u = parts[1]?.trim() || "";
                    updateScene(i, "text", `${e.target.value}|${u}`);
                  }}
                  placeholder="#"
                />
              </div>
            </span>
          );
        })()
      ) : isBattleLayout(resolveLayoutIndex(scene.layout, i)) ? (
        // Wider gap between PLAYER 1 and PLAYER 2 so the two halves
        // read as distinct sides of a matchup (BotWeek1/2 etc.).
        <span style={{ display: "flex", flex: 1, gap: 24 }}>
          <div style={{ ...styles.sceneInputCell }}>
            <span style={styles.sceneInputCaption}>PLAYER 1</span>
            <input
              style={{ ...styles.sceneInput, width: "100%" }}
              value={(scene.text || "").split("|")[0]?.trim() || ""}
              onChange={(e) => {
                const parts = (scene.text || "").split("|");
                const b = parts[1]?.trim() || "";
                updateScene(i, "text", `${e.target.value}|${b}`);
              }}
              placeholder="User A"
            />
          </div>
          <div style={{ ...styles.sceneInputCell }}>
            <span style={styles.sceneInputCaption}>PLAYER 2</span>
            <input
              style={{ ...styles.sceneInput, width: "100%" }}
              value={(scene.text || "").split("|")[1]?.trim() || ""}
              onChange={(e) => {
                const parts = (scene.text || "").split("|");
                const a = parts[0]?.trim() || "";
                updateScene(i, "text", `${a}|${e.target.value}`);
              }}
              placeholder="User B"
            />
          </div>
        </span>
      ) : isPrizesGridLayout(resolveLayoutIndex(scene.layout, i)) ? (
        (() => {
          const selected = new Set(
            (scene.text || "").split(",").map((s) => s.trim()).filter(Boolean)
          );
          const toggle = (logo: string) => {
            const next = new Set(selected);
            if (next.has(logo)) next.delete(logo); else next.add(logo);
            updateScene(i, "text", [...next].join(","));
          };
          return (
            <details style={{ flex: 1, minWidth: 0 }}>
              <summary style={{ ...styles.sceneInput, cursor: "pointer", userSelect: "none" as const, listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, fontFamily: "inherit" }}>
                <span>{selected.size === 0 ? "All logos" : `${selected.size} logo${selected.size !== 1 ? "s" : ""} selected`}</span>
                <span style={{ fontSize: 8, color: "#94a3b8", pointerEvents: "none" }}>&#9660;</span>
              </summary>
              <div style={{ position: "absolute", zIndex: 100, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "4px 0", marginTop: 2, minWidth: 220, maxHeight: 300, overflowY: "auto" as const }}>
                {PRIZE_LOGOS.map((logo) => {
                  const checked = selected.has(logo);
                  return (
                    <label key={logo} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", background: checked ? "#334155" : "transparent", fontSize: 14, fontFamily: "inherit", color: "#e2e8f0" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(logo)} style={{ accentColor: "#3b82f6" }} />
                      {logo.replace(".png", "")}
                    </label>
                  );
                })}
              </div>
            </details>
          );
        })()
      ) : isWeeklyTitleLayout(resolveLayoutIndex(scene.layout, i)) ? (
        <input
          type="week"
          style={{ ...styles.sceneInput }}
          value={(() => {
            const t = scene.text || "";
            if (/^\d{4}-W\d{2}$/.test(t)) return t;
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const m = t.match(/^(\w+)\s+(\d+)\w*\s*[–—-]/);
            if (m) {
              const mi = months.indexOf(m[1]);
              const day = parseInt(m[2], 10);
              if (mi >= 0 && day > 0) {
                const now = new Date();
                const d = new Date(now.getFullYear(), mi, day);
                if (d.getTime() > now.getTime() + 180 * 86400000) d.setFullYear(d.getFullYear() - 1);
                const thu = new Date(d);
                thu.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7));
                const jan1 = new Date(thu.getFullYear(), 0, 1);
                const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
                return `${thu.getFullYear()}-W${String(week).padStart(2, "0")}`;
              }
            }
            const now = new Date();
            const jan1 = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now.getTime() - jan1.getTime()) / 86400000);
            const week = Math.ceil((days + jan1.getDay() + 1) / 7);
            return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
          })()}
          onChange={(e) => {
            const val = e.target.value;
            if (!val) return;
            const [yearStr, weekStr] = val.split("-W");
            const year = parseInt(yearStr, 10);
            const week = parseInt(weekStr, 10);
            const jan4 = new Date(year, 0, 4);
            const mon = new Date(jan4);
            mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() - 1);
            const nextSun = new Date(sun);
            nextSun.setDate(sun.getDate() + 7);
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
            const rangeText = `${months[sun.getMonth()]} ${ord(sun.getDate())} – ${months[nextSun.getMonth()]} ${ord(nextSun.getDate())}`;
            updateScene(i, "text", rangeText);
          }}
        />
      ) : isTextBlockLayout(resolveLayoutIndex(scene.layout, i)) ? (
        (() => {
          const parts = (scene.text || "").split("\n");
          const line1 = parts[0] || "";
          const line2 = parts[1] || "";
          const line3 = parts[2] || "";
          const save = (l1: string, l2: string, l3: string) => updateScene(i, "text", `${l1}\n${l2}\n${l3}`);
          return (
            <span style={{ display: "flex", flex: 1, gap: 4, minWidth: 0 }}>
              <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                <span style={styles.sceneInputCaption}>First Line</span>
                <input
                  style={{ ...styles.sceneInput, width: "100%", minWidth: 0 }}
                  value={line1}
                  onChange={(e) => save(e.target.value, line2, line3)}
                  placeholder="Line 1"
                />
              </div>
              <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                <span style={styles.sceneInputCaption}>Second Line</span>
                <input
                  style={{ ...styles.sceneInput, width: "100%", minWidth: 0 }}
                  value={line2}
                  onChange={(e) => save(line1, e.target.value, line3)}
                  placeholder="Line 2"
                />
              </div>
              <div style={{ ...styles.sceneInputCell, flex: 1 }}>
                <span style={styles.sceneInputCaption}>Third Line</span>
                <input
                  style={{ ...styles.sceneInput, width: "100%", minWidth: 0 }}
                  value={line3}
                  onChange={(e) => save(line1, line2, e.target.value)}
                  placeholder="Line 3"
                />
              </div>
              <div style={{ ...styles.sceneInputCell, flexShrink: 0 }}>
                <span style={styles.sceneInputCaption}>Portrait</span>
                <select
                  style={{ ...styles.layoutSelect, minWidth: 90, fontSize: 12 }}
                  value={scene.portrait || ""}
                  onChange={(e) => updateScene(i, "portrait", e.target.value)}
                >
                  <option value="">No portrait</option>
                  {portraitNames.map((p) => (
                    <option key={p} value={p}>{p.replace(/\.\w+$/, "")}</option>
                  ))}
                </select>
              </div>
            </span>
          );
        })()
      ) : (
        <input
          style={styles.sceneInput}
          value={scene.text}
          onChange={(e) => updateScene(i, "text", e.target.value)}
          placeholder={`Title ${i + 1}...`}
        />
      )}
      {/* Second input, only for layouts that opted in (S13 Caption 1-4) —
          renders the live subtitle below the slide-in stripe via
          SceneCard's subtitle prop in HelloWorld.tsx. */}
      {isSubtitleEnabledLayout(_layoutIdx) && (
        <>
          <span style={{ ...styles.sceneInputCaption, marginTop: 6 }}>Subtitle</span>
          <input
            style={styles.sceneInput}
            value={scene.subtitle || ""}
            onChange={(e) => updateScene(i, "subtitle", e.target.value)}
            placeholder={`Subtitle ${i + 1}...`}
          />
        </>
      )}
      </div>
      {/* Font-size input removed from per-row controls — it's now a
          stepper tile in the timeline properties row (below the
          timeline) so the user can nudge the selected scene's font
          size with +/- without leaving the preview. */}
      {/* Top-edge divider strip: line + ≡ + line + × above every row,
          including the first one. The whole strip is draggable (except
          the × button) to reorder. */}
      {!compact && props.scenes.length > 1 && (
        <span
          className="scene-list-row-handle"
          draggable
          onDragStart={(e) => { e.stopPropagation(); setDragIndex(i); }}
          title="Drag to reorder"
        >
          <span className="scene-list-line" aria-hidden />
          <span className="scene-list-glyph" aria-hidden>&#x2630;</span>
          <span className="scene-list-order">{i + 1}</span>
          <span className="scene-list-glyph" aria-hidden>&#x2630;</span>
          <span className="scene-list-line" aria-hidden />
          <button
            type="button"
            className="scene-list-remove"
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); removeScene(i); }}
            title="Delete scene"
            aria-label="Delete scene"
          >
            &times;
          </button>
        </span>
      )}
      {/* Delete-scene button moved to the right end of the divider
          strip above (.scene-list-remove). */}
    </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Navbar is hidden on the mobile Preview tab so the player gets
          the full vertical real estate while watching. Save/Load still
          available from the Preset/Scenes tabs. */}
      {!(isMobile && mobileTab === "preview") && (
      <nav style={styles.navbar}>
        <h1 style={styles.navbarTitle}>VIDEOBOX 2.0</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            ref={loadInputRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={handleLoad}
          />
          <button style={styles.galleryButton} onClick={handleSave}>
            Save
          </button>
          <button style={styles.galleryButton} onClick={() => loadInputRef.current?.click()}>
            Load
          </button>
          {showDevTools && (
            <button style={styles.galleryButton} onClick={handleBakeFrame}>
              Bake Frame
            </button>
          )}
        </div>
      </nav>
      )}

      <div style={isMobile ? styles.contentMobile : styles.content}>
        <div style={isMobile ? { ...styles.main, gridTemplateColumns: "1fr" } : styles.main}>
        <div
          style={{
            ...(recordingMode ? styles.recordingOverlay : { ...styles.preview, order: 3 }),
            ...(isMobile && mobileTab !== "preview" ? styles.mobileHidden : null),
          }}
          data-player
        >
          <div
            className="player-wrap"
            style={recordingMode ? styles.recordingPlayerWrap : undefined}
          >
            <Player
              ref={playerRef}
              component={HelloWorld}
              schema={videoPropsSchema}
              inputProps={props}
              durationInFrames={Math.max(1, totalFrames)}
              fps={FPS}
              compositionWidth={1080}
              compositionHeight={1920}
              style={
                recordingMode
                  ? { width: "100%", height: "100%" }
                  : { width: "100%", aspectRatio: "9/16" }
              }
              controls={false}
              clickToPlay={!recordingMode}
              loop={!recordingMode}
              renderLoading={() => (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "9/16",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: "#000",
                  }}
                >
                  <p style={{ color: "#666", fontSize: 14 }}>
                    Loading assets...
                  </p>
                </div>
              )}
            />
          </div>
          {!recordingMode && (
            <>
            <div
              style={styles.progressBarTrack}
              onPointerDown={(e) => {
                const track = e.currentTarget;
                track.setPointerCapture(e.pointerId);
                const seekFromEvent = (ev: React.PointerEvent | PointerEvent) => {
                  const rect = track.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                  const frame = Math.floor(pct * Math.max(1, totalFrames - 1));
                  playerRef.current?.seekTo(frame);
                };
                seekFromEvent(e);
                const onMove = (ev: PointerEvent) => seekFromEvent(ev);
                const onUp = (ev: PointerEvent) => {
                  track.releasePointerCapture(ev.pointerId);
                  track.removeEventListener("pointermove", onMove);
                  track.removeEventListener("pointerup", onUp);
                  track.removeEventListener("pointercancel", onUp);
                };
                track.addEventListener("pointermove", onMove);
                track.addEventListener("pointerup", onUp);
                track.addEventListener("pointercancel", onUp);
              }}
            >
              <div
                style={{
                  ...styles.progressBarFill,
                  width: `${Math.max(0, Math.min(100, (currentFrame / Math.max(1, totalFrames - 1)) * 100))}%`,
                }}
              />
            </div>
            <div style={styles.playerControls}>
              <button
                type="button"
                style={styles.playerIconButton}
                title="Fullscreen"
                onClick={handleFullscreen}
              >
                <IconFullscreen />
              </button>
              <div style={styles.playerCenterControls}>
                <button
                  type="button"
                  style={styles.playerIconButton}
                  title="Previous scene"
                  onClick={handlePrevScene}
                >
                  <IconPrev />
                </button>
                <button
                  type="button"
                  style={styles.playerPlayButton}
                  title={isPlaying ? "Pause" : "Play"}
                  onClick={handleTogglePlay}
                >
                  {isPlaying ? <IconPause /> : <IconPlay />}
                </button>
                <button
                  type="button"
                  style={styles.playerIconButton}
                  title="Next scene"
                  onClick={handleNextScene}
                >
                  <IconNext />
                </button>
              </div>
              <button
                type="button"
                style={styles.playerIconButton}
                title={isMuted ? "Unmute" : "Mute"}
                onClick={handleToggleMute}
              >
                {isMuted ? <IconMuted /> : <IconUnmuted />}
              </button>
            </div>

            {/* Mobile-only: edit the selected scene's inputs right
                under the video controls, above the render controls.
                Compact mode hides the drag handle/order number so the
                inputs span the full width. */}
            {isMobile && mobileTab === "preview" && !recordingMode && props.scenes[selectedSceneIndex] && (
              <div style={{ margin: "20px 0" }}>
                {renderSceneRow(props.scenes[selectedSceneIndex], selectedSceneIndex, { compact: true })}
              </div>
            )}

            {/* Resolution picker + browser-side recording buttons live
                inside the dev-tools group (toggled with the ` key) so the
                regular UI only exposes the Render-on-Server flow. */}
            {showDevTools && (
              <>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", margin: "8px 0 4px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#e2e8f0", cursor: "pointer" }}>
                    <input type="radio" name="exportRes" checked={exportRes === "720p"} onChange={() => setExportRes("720p")} style={{ accentColor: "#3b82f6" }} />
                    720p
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#e2e8f0", cursor: "pointer" }}>
                    <input type="radio" name="exportRes" checked={exportRes === "1080p"} onChange={() => setExportRes("1080p")} style={{ accentColor: "#3b82f6" }} />
                    1080p
                  </label>
                </div>
                <button
                  style={{
                    ...styles.downloadButton,
                    opacity: rendering ? 0.6 : 1,
                    cursor: rendering ? "not-allowed" : "pointer",
                  }}
                  onClick={() => handleDownload("no-preference")}
                  disabled={rendering}
                >
                  {rendering
                    ? `Recording\u2026 ${renderProgress}%`
                    : "Record Integral"}
                </button>
                <button
                  style={{
                    ...styles.downloadButton,
                    opacity: rendering ? 0.6 : 1,
                    cursor: rendering ? "not-allowed" : "pointer",
                  }}
                  onClick={handleDownloadPerScene}
                  disabled={rendering}
                >
                  Record Scenes
                </button>
              </>
            )}
            {(() => {
              // Single server-render button + a Full/Scenes segmented switch
              // above it. The switch picks which mode the button fires;
              // serverRenderMode tracks the currently in-flight render so
              // the progress fill stays correct even if the user toggles
              // the switch mid-render.
              const target = serverRenderTarget;
              const isActive = serverRendering;
              const activeMode = serverRenderMode;
              const baseLabel = target === "scenes" ? "Render Scenes" : "Render Full Video";
              const etaSeconds = serverRenderEtaMs == null ? null : Math.max(0, Math.ceil(serverRenderEtaMs / 1000));
              const etaLabel = etaSeconds == null
                ? ""
                : ` · ~${Math.floor(etaSeconds / 60)}:${String(etaSeconds % 60).padStart(2, "0")} left`;
              // Segment style helper for the switch.
              const segStyle = (selected: boolean): React.CSSProperties => ({
                flex: 1,
                padding: "6px 10px",
                fontSize: 13,
                fontWeight: selected ? 600 : 400,
                background: selected ? "#3b82f6" : "transparent",
                color: selected ? "#ffffff" : "#94a3b8",
                border: "none",
                borderRadius: 4,
                cursor: isActive ? "not-allowed" : "pointer",
                transition: "background 0.15s, color 0.15s",
              });
              return (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      padding: 2,
                      margin: "8px 0 4px",
                      background: "#1e293b",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      opacity: isActive ? 0.55 : 1,
                    }}
                    role="tablist"
                    aria-label="Server render target"
                  >
                    <button
                      type="button"
                      style={segStyle(target === "integral")}
                      onClick={() => !isActive && setServerRenderTarget("integral")}
                      disabled={isActive}
                      aria-pressed={target === "integral"}
                    >
                      Full
                    </button>
                    <button
                      type="button"
                      style={segStyle(target === "scenes")}
                      onClick={() => !isActive && setServerRenderTarget("scenes")}
                      disabled={isActive}
                      aria-pressed={target === "scenes"}
                    >
                      Scenes
                    </button>
                  </div>
                  <button
                    style={{
                      ...styles.downloadButton,
                      opacity: (rendering || serverRendering) ? 0.6 : 1,
                      cursor: (rendering || serverRendering) ? "not-allowed" : "pointer",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    onClick={() => handleServerRender(target)}
                    disabled={rendering || serverRendering}
                    title={target === "scenes"
                      ? "Render every scene as a separate mp4 and download them as a zip"
                      : "Render the full video on the server using Remotion"}
                  >
                    {isActive && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${Math.max(
                            serverRenderStatus === "rendering" ? serverRenderProgress * 100 : 8,
                            0
                          )}%`,
                          background: "rgba(59, 130, 246, 0.35)",
                          transition: "width 0.4s ease-out",
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>
                      {!isActive && baseLabel}
                      {isActive && serverRenderStatus === "queued" && "Queued…"}
                      {isActive && serverRenderStatus === "bundling" && "Bundling…"}
                      {isActive && serverRenderStatus === "caching" && "Caching assets…"}
                      {isActive && serverRenderStatus === "selecting" && "Launching browser…"}
                      {isActive && serverRenderStatus === "rendering" &&
                        `Rendering ${activeMode === "scenes" ? "scenes " : ""}${Math.round(serverRenderProgress * 100)}%${etaLabel}`}
                      {isActive && serverRenderStatus === "packing" && "Packing zip…"}
                      {isActive && serverRenderStatus === "done" && "Downloading…"}
                      {isActive && !["queued", "bundling", "caching", "selecting", "rendering", "packing", "done"].includes(serverRenderStatus) &&
                        "Rendering on server…"}
                    </span>
                  </button>
                  {serverRendering && (
                    <button
                      type="button"
                      style={{
                        ...styles.downloadButton,
                        background: "#dc2626",
                        borderColor: "#ef4444",
                        color: "#ffffff",
                        fontWeight: 600,
                        opacity: serverRenderCancelling ? 0.6 : 1,
                        cursor: serverRenderCancelling ? "not-allowed" : "pointer",
                      }}
                      onClick={handleServerRenderCancel}
                      disabled={serverRenderCancelling}
                      title="Abort the in-progress server render"
                    >
                      {serverRenderCancelling ? "Stopping…" : "Stop Render"}
                    </button>
                  )}
                </>
              );
            })()}
            {showDevTools && (
              <>
                <button
                  style={{
                    ...styles.downloadButton,
                    opacity: rendering ? 0.6 : 1,
                    cursor: rendering ? "not-allowed" : "pointer",
                  }}
                  onClick={() => handleDownload("prefer-software")}
                  disabled={rendering}
                >
                  Render Software
                </button>
                <button
                  style={{
                    ...styles.downloadButton,
                    opacity: rendering ? 0.6 : 1,
                    cursor: rendering ? "not-allowed" : "pointer",
                  }}
                  onClick={() => handleDownload("prefer-hardware")}
                  disabled={rendering}
                >
                  Render Hardware
                </button>
              </>
            )}
            </>
          )}

        </div>

        {!recordingMode && (!isMobile || mobileTab === "preset") && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              ...(isMobile ? null : { gridColumn: 1, alignSelf: "start" }),
            }}
          >
          <div style={styles.controls}>
            <div>
              <span style={{ ...styles.label, marginBottom: 6 }}>Preset</span>
              <select
                style={{ ...styles.layoutSelect, width: "100%" }}
                value={selectedPreset || ""}
                onChange={(e) => {
                  if (e.target.value) loadPreset(e.target.value);
                }}
              >
                <option value="" disabled>Presets</option>
                {presetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                style={{ ...styles.galleryButton, width: "100%", marginTop: 12, opacity: fetching ? 0.5 : 1, ...RSS_BORDER, color: "#f59e0b" }}
                disabled={fetching}
                onClick={async () => {
                  setFetching(true);
                  try {
                    const resolveLabel = (l: string | number | undefined) =>
                      typeof l === "string" ? l : getLayoutLabel(typeof l === "number" ? l : -1) ?? "";
                    const neededSingle = new Set<string>();
                    const neededAll = new Set<string>();
                    let needsTourney = false;
                    let hasWeeklyTitle = false;
                    for (const scene of props.scenes) {
                      if (isWeeklyTitleLayout(resolveLayoutIndex(scene.layout, -1))) hasWeeklyTitle = true;
                      const bindings = LAYOUT_RSS_BINDINGS[resolveLabel(scene.layout)];
                      if (bindings) bindings.forEach((b) => {
                        if (b.format === "bracket" || b.format === "lineup") needsTourney = true;
                        else if (b.format === "top10") neededAll.add(b.feedKey);
                        else neededSingle.add(b.feedKey);
                      });
                    }
                    const cache: Record<string, RssEntry> = {};
                    const cacheAll: Record<string, RssEntry[]> = {};
                    let tourneyItems: TourneyItem[] = [];
                    let buildDate: Date | null = null;
                    const singleKeys = [...neededSingle];
                    const allKeys = [...neededAll];
                    if (hasWeeklyTitle) {
                      buildDate = await fetchRssLastBuildDate();
                    }
                    if (needsTourney) {
                      tourneyItems = await fetchTourneyFeed();
                    }
                    for (let idx = 0; idx < singleKeys.length; idx++) {
                      if (idx > 0 || needsTourney || hasWeeklyTitle) await new Promise((r) => setTimeout(r, 300));
                      const entry = await fetchRssFeed(singleKeys[idx]);
                      if (entry) cache[singleKeys[idx]] = entry;
                    }
                    for (let idx = 0; idx < allKeys.length; idx++) {
                      if (idx > 0 || singleKeys.length > 0 || needsTourney) await new Promise((r) => setTimeout(r, 300));
                      const entries = await fetchRssAll(allKeys[idx]);
                      if (entries.length) cacheAll[allKeys[idx]] = entries;
                    }
                    const hasRssData = Object.keys(cache).length > 0 || Object.keys(cacheAll).length > 0 || tourneyItems.length > 0;
                    if (hasRssData || buildDate) {
                      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                      const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
                      setProps((prev) => ({
                        ...prev,
                        scenes: prev.scenes.map((scene) => {
                          let updated = scene;
                          if (buildDate && isWeeklyTitleLayout(resolveLayoutIndex(scene.layout, -1))) {
                            const snap = new Date(buildDate);
                            const sun = new Date(snap);
                            sun.setDate(snap.getDate() - snap.getDay());
                            const nextSun = new Date(sun);
                            nextSun.setDate(sun.getDate() + 7);
                            updated = { ...updated, text: `${months[sun.getMonth()]} ${ord(sun.getDate())} – ${months[nextSun.getMonth()]} ${ord(nextSun.getDate())}` };
                          }
                          const bindings = LAYOUT_RSS_BINDINGS[resolveLabel(updated.layout)];
                          if (!bindings) return updated;
                          return applyRssToScene(updated, bindings, cache, cacheAll, tourneyItems);
                        }),
                      }));
                    }
                  } finally {
                    setFetching(false);
                  }
                }}
              >
                {fetching ? "Fetching…" : "Fetch Data"}
              </button>
            </div>

            <div>
              <span style={styles.label}>Color Scheme</span>
              <div style={styles.colorRow}>
                {(["dark", "light", "highlight"] as const).map((key) => (
                  <label key={key} style={styles.colorLabel}>
                    <input
                      type="color"
                      value={props.colorScheme[key]}
                      onChange={(e) => updateColor(key, e.target.value)}
                      style={styles.colorInput}
                    />
                    <span style={styles.colorName}>{key}</span>
                    <span style={styles.colorHex}>
                      {props.colorScheme[key]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.styleRow}>
              <label style={styles.styleLabel}>
                Music
                <select
                  style={{ ...styles.layoutSelect, width: "100%" }}
                  value={props.music || "Tournament.mp3"}
                  onChange={(e) =>
                    setProps((prev) => ({ ...prev, music: e.target.value }))
                  }
                >
                  <option value="none">None</option>
                  <option value="Tournament.mp3">Tournament</option>
                  <option value="Main Lobby.mp3">Main Lobby</option>
                  <option value="Sydosys.mp3">Sydosys</option>
                  <option value="Weekly.mp3">Weekly</option>
                </select>
              </label>
              <label style={styles.styleLabel}>
                Transition
                <select
                  style={{ ...styles.layoutSelect, width: "100%" }}
                  value={props.transition || "flash.json"}
                  onChange={(e) =>
                    setProps((prev) => ({ ...prev, transition: e.target.value }))
                  }
                >
                  <option value="none">None</option>
                  <option value="flash.json">Flash</option>
                  <option value="Arrow.json">Arrow</option>
                  <option value="Box1.json">Box1</option>
                  <option value="Box2.json">Box2</option>
                </select>
              </label>
              <label style={styles.styleLabel}>
                Font
                <select
                  style={{ ...styles.layoutSelect, width: "100%" }}
                  value={props.font || "Dela Gothic One"}
                  onChange={(e) =>
                    setProps((prev) => ({ ...prev, font: e.target.value }))
                  }
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              {/* Falls back to Font above when unset (see HelloWorld's
                  secondaryFontConfig). Currently drives the Subtitle text
                  in S13 Caption 1-4, but kept generic for future secondary
                  text elements. */}
              <label style={styles.styleLabel}>
                Secondary Font
                <select
                  style={{ ...styles.layoutSelect, width: "100%" }}
                  value={props.secondaryFont || props.font || "Dela Gothic One"}
                  onChange={(e) =>
                    setProps((prev) => ({ ...prev, secondaryFont: e.target.value }))
                  }
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label style={styles.styleLabel}>
                Overlay
                <select
                  style={{ ...styles.layoutSelect, width: "100%" }}
                  value={props.overlayVideo || "none"}
                  onChange={(e) =>
                    setProps((prev) => ({ ...prev, overlayVideo: e.target.value }))
                  }
                >
                  <option value="none">None</option>
                  <option value="Grunge-h264.mp4">Grunge</option>
                  <option value="Grunge.mp4">Grunge (legacy HEVC)</option>
                  <option value="rough.mp4">Paint</option>
                </select>
              </label>
            </div>
          </div>

          {/* Quick Tips — sits directly under the preset panel inside the
              same flex column wrapper so the gap matches the right-side
              column gutter (24 px). Default collapsed; clicking the title
              row toggles. */}
          <div style={{ ...styles.controls, gap: tipsExpanded ? 12 : 0 }}>
            <button
              type="button"
              onClick={() => setTipsExpanded((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                padding: 0,
                background: "transparent",
                border: "none",
                color: "#e2e8f0",
                cursor: "pointer",
                font: "inherit",
              }}
              aria-expanded={tipsExpanded}
            >
              <span style={styles.label}>Quick Tips</span>
              <span
                style={{
                  display: "inline-flex",
                  transition: "transform 0.2s",
                  transform: tipsExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  color: "#94a3b8",
                }}
                aria-hidden
              >
                <IconChevronDown />
              </span>
            </button>
            {tipsExpanded && (
              <ul
                style={{
                  // Default browser disc bullets — proper list look.
                  // paddingLeft gives room for the bullet glyph; the rest
                  // of the panel padding comes from the controls wrapper.
                  listStyleType: "disc",
                  paddingLeft: 20,
                  margin: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  color: "#94a3b8",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <li>Left panel has general video options including presets</li>
                <li>Select scenes via Scene List or Timeline. Grab the blue circle inside Timeline to adjust duration</li>
                <li>Available options for active scene are situated underneath the timeline</li>
                <li>Some scenes may have additional options like background sound, video upload and data import. Those options are marked by icons on scene thumbnails</li>
                <li>Use Scene List to edit scene content or add new scenes</li>
                <li>Grab list number to reorder entries</li>
                <li>Use middle click anywhere to play the video preview</li>
                <li>(Mobile) Edit content scene-by-scene directly within the preview tab</li>
              </ul>
            )}
          </div>
          </div>
        )}

        {!recordingMode && (!isMobile || mobileTab === "scenes") && (
          <div style={styles.middleColumn}>
            {/* Scene timeline. Each segment's width is proportional to
                its duration over the comp's total. The scene's thumbnail
                renders at 30 % opacity as a backdrop so it's easy to spot
                what each segment contains. Clicking jumps the player to
                that scene's start frame and marks the scene as selected
                (Swap-Scene button targets the selection). */}
            {props.scenes.length > 0 && (() => {
              const totalDur = props.scenes.reduce(
                (a, s) => a + (s.duration ?? DEFAULT_SCENE_DURATION),
                0,
              );
              let frameAcc = 0;
              return (
                <div style={styles.timeline} ref={timelineRef}>
                  {/* Subtle dark gradient pinned to the bottom of the
                      timeline so the segment icons read cleanly even
                      over bright thumbnail backdrops. Sits above the
                      segment thumbs but below the resize handle. */}
                  <div style={styles.timelineBottomGradient} aria-hidden />
                  {props.scenes.map((scene, i) => {
                    const dur = scene.duration ?? DEFAULT_SCENE_DURATION;
                    const pct = totalDur > 0 ? (dur / totalDur) * 100 : 0;
                    const layoutIdx = resolveLayoutIndex(scene.layout, i);
                    const label = getLayoutLabel(layoutIdx) || `Scene ${i + 1}`;
                    const startFrame = frameAcc;
                    frameAcc += getSceneFrames(scene);
                    const isSelected = i === selectedSceneIndex;
                    const thumbUrl = assetUrl(`picker/thumbs/${encodeURIComponent(label)}.webp`);

                    // Capability flags drive the icon row inside the segment.
                    const segCtrls = getLayoutControls(layoutIdx);
                    const segVideoAudio = segCtrls.some(
                      (c) => c.type === "videoUpload" || c.type === "videoMute",
                    );
                    const segMusic = !!resolveSceneMusic(scene);
                    const segHasSound = segVideoAudio || segMusic;
                    const segSoundPlaying = segVideoAudio
                      ? scene.backgroundVideo?.muted === false
                      : (segMusic && scene.sceneMusicMuted !== true);
                    const segHasVideoSlot = segCtrls.some((c) => c.type === "videoUpload");
                    const segVideoUploaded = !!scene.backgroundVideo?.src;
                    const segHasRss = !!LAYOUT_RSS_BINDINGS[label] || isWeeklyTitleLayout(layoutIdx);
                    const onColor = "#f1f5f9";  // white
                    const offColor = "#64748b"; // grey
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSelectedSceneIndex(i);
                          playerRef.current?.seekTo(startFrame);
                        }}
                        title={`${label} — ${dur}s`}
                        style={{
                          ...styles.timelineSegment,
                          width: `${pct}%`,
                          background:
                            i % 2 === 0
                              ? "rgba(59, 130, 246, 0.18)"
                              : "rgba(59, 130, 246, 0.32)",
                          ...(isSelected ? styles.timelineSegmentSelected : null),
                        }}
                      >
                        {!thumbMissing[layoutIdx] && (
                          <img
                            src={thumbUrl}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            onError={() =>
                              setThumbMissing((prev) => ({ ...prev, [layoutIdx]: true }))
                            }
                            style={styles.timelineSegmentThumb}
                          />
                        )}
                        {/* Scene order number in the top-left corner of
                            the segment so the user can quickly see which
                            scene index they're looking at. */}
                        <span style={styles.timelineSegmentOrder}>{i + 1}</span>
                        {/* Property icons replace the previous duration
                            label. Scene is always present (so no icon for
                            it). Sound: white speaker when playing, grey
                            when muted/missing. Video: white camera when a
                            file is uploaded, grey when the slot is empty.
                            RSS: orange, always — only rendered for layouts
                            with an RSS binding. */}
                        <span style={styles.timelineIcons}>
                          {segHasSound && (
                            <IconPropSpeaker size={19} color={segSoundPlaying ? onColor : offColor} />
                          )}
                          {segHasVideoSlot && (
                            <IconPropVideoCamera size={19} color={segVideoUploaded ? onColor : offColor} />
                          )}
                          {segHasRss && <IconPropRss size={19} />}
                        </span>
                        {/* Resize handle: dragging horizontally snaps the
                            selected scene's duration to the nearest second
                            based on the timeline's pixels-per-second at
                            drag start. */}
                        {isSelected && (
                          <span
                            role="slider"
                            aria-label="Drag to change scene duration"
                            aria-valuenow={dur}
                            aria-valuemin={1}
                            tabIndex={-1}
                            style={styles.timelineHandle}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const tl = timelineRef.current;
                              if (!tl) return;
                              const totalDurNow = props.scenes.reduce(
                                (a, s) => a + (s.duration ?? DEFAULT_SCENE_DURATION),
                                0,
                              );
                              const pxPerSec = totalDurNow > 0
                                ? tl.getBoundingClientRect().width / totalDurNow
                                : 0;
                              sceneDragRef.current = {
                                sceneIndex: i,
                                startX: e.clientX,
                                startDuration: dur,
                                pxPerSec,
                              };
                              (e.currentTarget as Element).setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const drag = sceneDragRef.current;
                              if (!drag || drag.pxPerSec <= 0) return;
                              const dx = e.clientX - drag.startX;
                              const deltaSec = Math.round(dx / drag.pxPerSec);
                              const newDur = Math.max(1, drag.startDuration + deltaSec);
                              const current = props.scenes[drag.sceneIndex]?.duration ?? DEFAULT_SCENE_DURATION;
                              if (newDur !== current) {
                                updateScene(drag.sceneIndex, "duration", newDur);
                              }
                            }}
                            onPointerUp={(e) => {
                              sceneDragRef.current = null;
                              try {
                                (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                              } catch (_) { /* noop */ }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Per-scene properties below the timeline. Each cell pairs
                a dim label on top with a brighter value below
                (Scene/Killstreak, Duration/8 seconds, Sound/Yes…). The
                Swap-Scene button sits at the right edge. */}
            {props.scenes[selectedSceneIndex] && (() => {
              const selScene = props.scenes[selectedSceneIndex];
              const selLayoutIdx = resolveLayoutIndex(selScene.layout, selectedSceneIndex);
              const selLabel = getLayoutLabel(selLayoutIdx) || `Scene ${selectedSceneIndex + 1}`;
              const selDur = selScene.duration ?? DEFAULT_SCENE_DURATION;
              // Sound mirrors the mute-button logic used in the scenes
              // list row:
              //   - layout exposes a videoUpload/videoMute control
              //     → mute toggle applies to backgroundVideo.muted
              //   - layout has a per-scene music slot (resolveSceneMusic)
              //     → mute toggle applies to scene.sceneMusicMuted
              //   - otherwise this scene has no sound at all.
              const selLayoutControls = getLayoutControls(selLayoutIdx);
              const hasVideoAudio = selLayoutControls.some(
                (c) => c.type === "videoUpload" || c.type === "videoMute",
              );
              const sceneMusic = resolveSceneMusic(selScene);
              let soundValue: string;
              if (hasVideoAudio) {
                // backgroundVideo.muted defaults to true → unmuted only when === false
                const isMuted = selScene.backgroundVideo?.muted !== false;
                soundValue = isMuted ? "Muted" : "Playing";
              } else if (sceneMusic) {
                soundValue = selScene.sceneMusicMuted ? "Muted" : "Playing";
              } else {
                soundValue = "None";
              }
              // Video reflects whether this scene's layout exposes an
              // uploadable video slot (i.e. has a `videoUpload` control —
              // BotWeek1, My Video, etc.). When the slot is available and
              // empty the cell becomes an "Add" upload button; when a
              // file's been picked we show its name truncated to 12 chars.
              // Layouts without a video slot stay as a plain "None".
              const hasVideoUpload = selLayoutControls.some(
                (c) => c.type === "videoUpload",
              );
              const bgVideo = selScene.backgroundVideo;
              const videoFileName = bgVideo?.name || (bgVideo?.src ? "Video" : "");
              const videoDisplay = videoFileName
                ? (videoFileName.length > 12 ? videoFileName.slice(0, 12) + "…" : videoFileName)
                : "Add";

              // Tile helper. Static (non-interactive) tiles get a
              // transparent background so they blend with the editor's
              // parent surface; interactive tiles get a slate background
              // + hover affordance.
              const staticTile = (label: string, value: string) => (
                <div style={{ ...styles.timelineTile, ...styles.timelineTileStatic }}>
                  <span style={styles.timelinePropLabel}>{label}</span>
                  <span style={styles.timelinePropValue}>{value}</span>
                </div>
              );

              // Toggling Sound flips muted on whichever source supplies
              // the audio (background video vs. scene music). Only
              // available when the scene actually has a sound source.
              const canToggleSound = hasVideoAudio || !!sceneMusic;
              const handleSoundClick = () => {
                if (hasVideoAudio) {
                  const current = selScene.backgroundVideo ?? { src: "" };
                  // muted defaults to true → unmuted only when === false.
                  const wasMuted = current.muted !== false;
                  updateScene(
                    selectedSceneIndex,
                    "backgroundVideo",
                    { ...current, muted: !wasMuted },
                  );
                } else if (sceneMusic) {
                  updateScene(
                    selectedSceneIndex,
                    "sceneMusicMuted" as keyof Scene,
                    !selScene.sceneMusicMuted,
                  );
                }
              };

              return (
                <div style={styles.timelineActions}>
                  {/* Scene → opens swap gallery */}
                  <button
                    type="button"
                    className="timeline-tile"
                    style={{ ...styles.timelineTile, ...styles.timelineTileClickable }}
                    onClick={() => { setGalleryMode("swap"); setShowGallery(true); }}
                    title="Pick a new layout for this scene"
                  >
                    <span style={styles.timelinePropLabel}>Scene</span>
                    <span style={styles.timelinePropValue}>{selLabel}</span>
                  </button>

                  {/* Duration → stepper tile (also editable via the drag
                      handle on the selected timeline segment). ±1 s per
                      click; floored at 1 s. */}
                  {(() => {
                    const DUR_MIN = 1;
                    const bumpDur = (delta: number) => {
                      const next = Math.max(DUR_MIN, selDur + delta);
                      if (next !== selDur) updateScene(selectedSceneIndex, "duration", next);
                    };
                    return (
                      <div style={{ ...styles.timelineTile, ...styles.timelineTileStatic }}>
                        <span style={styles.timelinePropLabel}>Duration</span>
                        <div style={styles.fontStepperRow}>
                          <button
                            type="button"
                            className="timeline-tile"
                            style={styles.fontStepperBtn}
                            onClick={(e) => { e.stopPropagation(); bumpDur(-1); }}
                            title="Decrease by 1 second"
                            aria-label="Decrease duration"
                          >
                            −
                          </button>
                          <span style={{ ...styles.timelinePropValue, minWidth: 36, textAlign: "center" }}>
                            {selDur}s
                          </span>
                          <button
                            type="button"
                            className="timeline-tile"
                            style={styles.fontStepperBtn}
                            onClick={(e) => { e.stopPropagation(); bumpDur(1); }}
                            title="Increase by 1 second"
                            aria-label="Increase duration"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Font Size → stepper tile. Two icon buttons flank the
                      number; clicks nudge the selected scene's font size
                      by 10 px. Floor at 10 so it never drops to 0. */}
                  {(() => {
                    const FS_STEP = 10;
                    const FS_MIN = 10;
                    const fs = selScene.fontSize ?? 200;
                    const bump = (delta: number) => {
                      const next = Math.max(FS_MIN, fs + delta);
                      if (next !== fs) updateScene(selectedSceneIndex, "fontSize", next);
                    };
                    return (
                      <div style={{ ...styles.timelineTile, ...styles.timelineTileStatic }}>
                        <span style={styles.timelinePropLabel}>Font Size</span>
                        <div style={styles.fontStepperRow}>
                          <button
                            type="button"
                            className="timeline-tile"
                            style={styles.fontStepperBtn}
                            onClick={(e) => { e.stopPropagation(); bump(-FS_STEP); }}
                            title={`Decrease by ${FS_STEP}`}
                            aria-label="Decrease font size"
                          >
                            −
                          </button>
                          <span style={{ ...styles.timelinePropValue, minWidth: 36, textAlign: "center" }}>
                            {fs}
                          </span>
                          <button
                            type="button"
                            className="timeline-tile"
                            style={styles.fontStepperBtn}
                            onClick={(e) => { e.stopPropagation(); bump(FS_STEP); }}
                            title={`Increase by ${FS_STEP}`}
                            aria-label="Increase font size"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sound → only shown when the scene actually has an
                      audio source. "None" tiles are hidden. */}
                  {canToggleSound && (
                    <button
                      type="button"
                      className="timeline-tile"
                      style={{ ...styles.timelineTile, ...styles.timelineTileClickable }}
                      onClick={handleSoundClick}
                      title={soundValue === "Muted" ? "Unmute" : "Mute"}
                    >
                      <span style={styles.timelinePropLabel}>Sound</span>
                      <span style={styles.timelinePropValue}>{soundValue}</span>
                    </button>
                  )}

                  {/* Video → only shown when the layout has a videoUpload
                      slot. "None" tiles are hidden. */}
                  {hasVideoUpload && (
                    <label
                      className="timeline-tile"
                      style={{ ...styles.timelineTile, ...styles.timelineTileClickable }}
                      title={bgVideo?.name || (bgVideo?.src ? "Replace video" : "Upload a video")}
                    >
                      <input
                        type="file"
                        accept="video/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          updateScene(selectedSceneIndex, "backgroundVideo", {
                            src: url,
                            name: file.name,
                            scale: 1.5,
                            blendMode: "normal",
                            startFrom: 0,
                          });
                        }}
                      />
                      <span style={styles.timelinePropLabel}>Video</span>
                      <span style={styles.timelinePropValue}>{videoDisplay}</span>
                    </label>
                  )}

                  {/* Data → clickable RSS fetch for layouts with bindings
                      (or the Weekly Title special case). Reads "Fetch"
                      until data lands, then "Loaded". Stays as the
                      right-most tile in natural flex order. */}
                  {(() => {
                    const sceneHasRssData = !!LAYOUT_RSS_BINDINGS[selLabel] || isWeeklyTitleLayout(selLayoutIdx);
                    if (!sceneHasRssData) {
                      // No RSS binding → hide the Data tile entirely
                      // (was previously a static "None" tile).
                      return null;
                    }
                    const isFetchingThis = fetchingScenes.has(selectedSceneIndex);
                    const isLoadedThis = loadedSceneData.has(selectedSceneIndex);
                    const dataValue = isFetchingThis
                      ? "Fetching…"
                      : isLoadedThis ? "Loaded" : "Fetch";
                    return (
                      <button
                        type="button"
                        className="timeline-tile"
                        style={{ ...styles.timelineTile, ...styles.timelineTileClickable, opacity: isFetchingThis ? 0.7 : 1 }}
                        onClick={() => fetchSceneData(selectedSceneIndex)}
                        disabled={isFetchingThis}
                        title={isLoadedThis ? "Re-fetch RSS data for this scene" : "Pull this scene's data from RSS"}
                      >
                        <span style={styles.timelinePropLabel}>Data</span>
                        <span style={{ ...styles.timelinePropValue, color: "#f59e0b" }}>{dataValue}</span>
                      </button>
                    );
                  })()}
                </div>
              );
            })()}
            {showDevTools && selectedPreset && AUTOMATE_PARSERS[selectedPreset] && (
              <div style={styles.controls}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={styles.scenesHeader}>
                    <span style={{ ...styles.label, flexDirection: "row" }}>{AUTOMATE_PARSERS[selectedPreset].label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                    <textarea
                      value={automateText}
                      onChange={(e) => setAutomateText(e.target.value)}
                      placeholder="Paste weekly report text here…"
                      rows={1}
                      style={{
                        ...styles.input,
                        flex: 1,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                        lineHeight: 1.4,
                        resize: "vertical",
                      }}
                    />
                    <button
                      style={{ ...styles.addButton, alignSelf: "stretch", padding: "0 16px" }}
                      onClick={() => {
                        const entry = AUTOMATE_PARSERS[selectedPreset];
                        if (!entry) return;
                        const next = entry.parser(automateText, props.scenes);
                        setProps((prev) => ({ ...prev, scenes: next }));
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* overflow: visible (vs. controls' default hidden) so the
                custom scrollbar's translateX(10px) shift isn't clipped
                by the panel's rounded edge. */}
            <div style={{ ...styles.controls, overflow: "visible" }}>
            {(() => {
              // Middle-click on the scene list area (anywhere) toggles
              // play instead of triggering the browser's auto-scroll
              // mode. Hoisted into shared handlers so both the desktop
              // OverlayScrollbarsComponent and the mobile plain div use
              // the same logic.
              const onMouseDown = (e: React.MouseEvent) => {
                if (e.button === 1) {
                  e.preventDefault();
                  handleTogglePlay();
                }
              };
              const onAuxClick = (e: React.MouseEvent) => {
                if (e.button === 1) e.preventDefault();
              };
              const listInner = (
                <>
                  {/* Scene rows — body extracted into renderSceneRow so
                      the same JSX can be reused on the mobile Preview tab. */}
                  {props.scenes.map((scene, i) => renderSceneRow(scene, i))}

                  <button
                    style={{ ...styles.addButton, width: "100%", padding: "10px 12px" }}
                    onClick={() => setShowGallery(true)}
                  >
                    + Add Scene
                  </button>
                </>
              );
              if (isMobile) {
                // No internal scrollbar on mobile — the page itself
                // scrolls (contentMobile has bottom padding to clear
                // the tab bar).
                return (
                  <div
                    style={{
                      ...styles.scenesList,
                      paddingTop: 25,
                      maxHeight: "none",
                      overflowY: "visible" as const,
                    }}
                    onMouseDown={onMouseDown}
                    onAuxClick={onAuxClick}
                  >
                    {listInner}
                  </div>
                );
              }
              // Desktop: overlayscrollbars draws a fully-custom thin
              // dark scrollbar (no platform arrows, identical across
              // browsers). The wrapping div retains the flex layout +
              // 25 px top padding + max-height; overlayscrollbars
              // adds its own scroll viewport inside.
              return (
                <OverlayScrollbarsComponent
                  element="div"
                  className="scene-list-os"
                  style={{
                    ...styles.scenesList,
                    paddingTop: 25,
                    // 15 px right padding so the scene-row content has
                    // breathing room from the scrollbar at the host's
                    // right edge.
                    paddingRight: 15,
                  }}
                  options={{
                    scrollbars: {
                      theme: "os-theme-dark",
                      // Fade out when pointer leaves the list area;
                      // reappear on hover / scroll.
                      autoHide: "leave",
                      autoHideDelay: 400,
                    },
                  }}
                  defer
                  onMouseDown={onMouseDown}
                  onAuxClick={onAuxClick}
                >
                  {listInner}
                </OverlayScrollbarsComponent>
              );
            })()}
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Mobile bottom tab bar — only rendered on narrow viewports.
          Switches between the three sections (Preset/Scenes/Preview)
          when the layout collapses to a single column. */}
      {isMobile && !recordingMode && (
        <nav style={styles.mobileTabBar} aria-label="Sections">
          {([
            { id: "preset", label: "Preset", icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 3a9 9 0 100 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7H17a4 4 0 004-4c0-4.4-4-8.3-9-8.3zM7 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
              </svg>
            )},
            { id: "scenes", label: "Scenes", icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1zm1 3v2h2V7H5zm0 4v2h2v-2H5zm0 4v2h2v-2H5zm12-8v2h2V7h-2zm0 4v2h2v-2h-2zm0 4v2h2v-2h-2zM9 7v10h6V7H9z"/>
              </svg>
            )},
            { id: "preview", label: "Preview", icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7L8 5z"/>
              </svg>
            )},
          ] as const).map((t) => {
            const active = mobileTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setMobileTab(t.id)}
                style={{
                  ...styles.mobileTabButton,
                  color: active ? "#60a5fa" : "#94a3b8",
                  background: active ? "#1e293b" : "transparent",
                }}
                aria-pressed={active}
              >
                {t.icon}
                <span style={styles.mobileTabLabel}>{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Gallery Dock */}
      <div
        style={{
          ...styles.dockOverlay,
          pointerEvents: showGallery ? "auto" : "none",
        }}
        onClick={() => { setShowGallery(false); setGalleryMode("add"); }}
      >
        <div
          style={{
            ...styles.dockPanel,
            transform: showGallery ? "translateX(0)" : "translateX(100%)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
            <div style={styles.dockHeader}>
              <h2 style={{ margin: 0, fontSize: 20, color: "#fff" }}>
                {galleryMode === "swap"
                  ? `Swap Scene ${selectedSceneIndex + 1}`
                  : "Scene Gallery"}
              </h2>
              <button
                style={styles.dockClose}
                onClick={() => { setShowGallery(false); setGalleryMode("add"); }}
              >
                x
              </button>
            </div>
            <div className="dock-body-no-scrollbar" style={styles.dockBody}>
              {categoryEntries.map(([category, layouts]) => (
                <div key={category}>
                  <h3 style={styles.categoryHeading}>{category}</h3>
                  <div style={styles.galleryGrid}>
                    {layouts.map((opt) => {
                      // In swap mode, highlight the card matching the
                      // currently selected scene's layout so the user can
                      // see what's in play before picking a new one.
                      const currentLayoutLabel = galleryMode === "swap"
                        ? getLayoutLabel(resolveLayoutIndex(
                            props.scenes[selectedSceneIndex]?.layout,
                            selectedSceneIndex,
                          ))
                        : null;
                      const isCurrent = !!currentLayoutLabel && currentLayoutLabel === opt.label;
                      return (
                      <div
                        key={opt.index}
                        style={{
                          ...styles.galleryCard,
                          cursor: "pointer",
                          ...(isCurrent ? styles.galleryCardCurrent : null),
                        }}
                        onClick={() => {
                          const dur = getLayoutDefaultDuration(opt.index);
                          const fs = getLayoutDefaultFontSize(opt.index) ?? 150;
                          let defaultText = "";
                          if (isSlideLinesFixedLayout(opt.index)) {
                            defaultText = "PLAYER|PLAYER\nPLAYER|PLAYER\n0,0";
                          } else if (isSlideLinesDuelLayout(opt.index)) {
                            defaultText = "Player1\nPlayer2";
                          } else if (isSlideLinesTourneyLayout(opt.index)) {
                            defaultText = "Player1 Player2 Player3\n126 89 257";
                          } else if (isSlideLinesOverlayLayout(opt.index)) {
                            defaultText = "Player1|Player2|Player3\n126|89|257";
                          } else if (isBattleLayout(opt.index)) {
                            defaultText = "Player1|Player2";
                          } else if (isKillstreakOverlayLayout(opt.index)) {
                            defaultText = "3|Player One";
                          } else if (isKingOverlayLayout(opt.index)) {
                            defaultText = "3|Player One";
                          } else if (isTextBlockLayout(opt.index)) {
                            defaultText = opt.label === "Profile" ? "USER\nPROFILE\nPLAYER ONE" : "SEASON 10\nCHAMPION\nPLAYER ONE";
                          }
                          setProps((prev) => {
                            if (galleryMode === "swap") {
                              // Swap the layout of the selected scene; keep
                              // its existing text in place, but pull in the
                              // new layout's default duration/fontSize so
                              // the picked design looks right out of the
                              // box.
                              const idx = Math.min(selectedSceneIndex, prev.scenes.length - 1);
                              if (idx < 0) return prev;
                              const nextScenes = prev.scenes.slice();
                              const existing = nextScenes[idx];
                              nextScenes[idx] = {
                                ...existing,
                                layout: opt.label,
                                fontSize: existing.fontSize ?? fs,
                                ...(dur != null ? { duration: dur } : {}),
                              };
                              return { ...prev, scenes: nextScenes };
                            }
                            // Default "add" flow: append a new scene.
                            return {
                              ...prev,
                              scenes: [
                                ...prev.scenes,
                                { text: defaultText, fontSize: fs, layout: opt.label, ...(dur != null ? { duration: dur } : {}) },
                              ],
                            };
                          });
                          if (galleryMode === "add") {
                            // Newly-added scene becomes the selection so
                            // the timeline + Swap-Scene point at it.
                            setSelectedSceneIndex(props.scenes.length);
                          }
                          setGalleryMode("add");
                          setShowGallery(false);
                        }}
                      >
                        <div style={{ ...styles.galleryPreview, ...(hasRssBindings(opt.label) ? RSS_BORDER : {}) }}>
                          {thumbMissing[opt.index] ? (
                            <Thumbnail
                              component={HelloWorld}
                              inputProps={{
                                ...props,
                                showIntro: false,
                                showOutro: false,
                                scenes: [{ text: category, fontSize: 100, layout: opt.index }],
                              }}
                              durationInFrames={SCENE_DURATION}
                              fps={FPS}
                              compositionWidth={1080}
                              compositionHeight={1920}
                              frameToDisplay={60}
                              style={{ width: "100%", height: "100%", borderRadius: 8 }}
                            />
                          ) : (
                            <img
                              src={assetUrl(`picker/thumbs/${encodeURIComponent(opt.label)}.webp`)}
                              alt={opt.label}
                              loading="lazy"
                              onError={() => setThumbMissing((prev) => ({ ...prev, [opt.index]: true }))}
                              style={{ width: "100%", height: "100%", borderRadius: 8, objectFit: "cover" }}
                            />
                          )}
                          {/* Capability icons overlaid on the bottom of
                              the thumbnail. Speaker / video-camera are
                              always white here (gallery shows what the
                              layout supports, not the current scene's
                              state). RSS stays orange. */}
                          {(() => {
                            const optCtrls = getLayoutControls(opt.index);
                            // resolveSceneMusic only reads scene.layout, so
                            // a stub with the layout index is enough to
                            // ask "does this layout have a music slot?".
                            const optHasMusic = !!resolveSceneMusic({ layout: opt.index } as Scene);
                            const optHasVideoAudio = optCtrls.some(
                              (c) => c.type === "videoUpload" || c.type === "videoMute",
                            );
                            const optHasSound = optHasVideoAudio || optHasMusic;
                            const optHasVideo = optCtrls.some((c) => c.type === "videoUpload");
                            const optHasRss = hasRssBindings(opt.label);
                            if (!optHasSound && !optHasVideo && !optHasRss) return null;
                            return (
                              <span style={styles.galleryIconBar}>
                                {optHasSound && <IconPropSpeaker size={20} color="#ffffff" />}
                                {optHasVideo && <IconPropVideoCamera size={20} color="#ffffff" />}
                                {optHasRss && <IconPropRss size={20} />}
                              </span>
                            );
                          })()}
                        </div>
                        <span style={{ ...styles.galleryLabel, ...(hasRssBindings(opt.label) ? { color: "#f59e0b" } : {}) }}>{opt.label}</span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0a0a0a",
    minHeight: "100vh",
    color: "#e2e8f0",
  },
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 5vw",
    borderBottom: "1px solid #1e293b",
    backgroundColor: "#0a0a0a",
    position: "sticky" as const,
    top: 0,
    zIndex: 10,
  },
  navbarTitle: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    letterSpacing: 1,
    color: "#ffffff",
  },
  content: {
    padding: "32px 5vw",
  },
  contentMobile: {
    // Tighter side gutters on phones; leave room at the bottom for the
    // fixed tab bar so the last row of controls isn't covered.
    padding: "16px 12px 96px",
  },
  mobileHidden: {
    display: "none",
  },
  mobileTabBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 200,
    display: "flex",
    gap: 4,
    padding: "8px 8px calc(8px + env(safe-area-inset-bottom, 0px))",
    background: "rgba(10, 10, 10, 0.92)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderTop: "1px solid #1e293b",
  },
  mobileTabButton: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: "8px 4px",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
    font: "inherit",
  },
  mobileTabLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  heading: {
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 32,
    color: "#ffffff",
  },
  main: {
    display: "grid",
    gridTemplateColumns: "260px 1fr 320px",
    gap: 24,
    alignItems: "start",
  },
  preview: {
    borderRadius: 12,
    overflow: "hidden",
  },
  progressBarTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "#1e293b",
    cursor: "pointer",
    position: "relative" as const,
    touchAction: "none" as const,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#e2e8f0",
    pointerEvents: "none" as const,
  },
  playerControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    backgroundColor: "#0d0d15",
  },
  playerCenterControls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  playerIconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: "#94a3b8",
    cursor: "pointer",
    transition: "background 150ms ease, color 150ms ease",
  },
  playerPlayButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    border: "none",
    borderRadius: 999,
    background: "#e2e8f0",
    color: "#0a0a0a",
    cursor: "pointer",
    transition: "background 150ms ease",
  },
  recordingOverlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 9999,
    backgroundColor: "#000",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  recordingPlayerWrap: {
    height: "100vh",
    aspectRatio: "9/16",
  },
  controls: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    padding: 24,
    borderRadius: 12,
    border: "1px solid #1e293b",
    backgroundColor: "#111118",
    minWidth: 0,
    overflow: "hidden",
  },
  middleColumn: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minWidth: 0,
  },
  timeline: {
    position: "relative",
    display: "flex",
    width: "100%",
    height: 80,
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: 6,
    // overflow visible so the resize handle on the selected segment can
    // sit slightly outside the timeline's bottom-right edge. Segments
    // themselves stay sized via flex-basis so nothing else leaks.
    overflow: "visible",
  },
  timelineSegment: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    padding: "4px 6px",
    border: "none",
    borderRight: "1px solid rgba(15, 23, 42, 0.6)",
    color: "#e2e8f0",
    cursor: "pointer",
    transition: "filter 0.15s",
    // overflow: visible so the resize handle on the selected segment
    // can float over neighbouring segments / outside the timeline without
    // being clipped. The thumbnail image already constrains itself via
    // inset:0 + objectFit so nothing else leaks out.
    overflow: "visible",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  timelineSegmentSelected: {
    boxShadow: "inset 0 0 0 2px #3b82f6",
    filter: "brightness(1.15)",
    // Lift the selected segment above its siblings so the drag handle
    // (which spills past the right edge with right:-10) paints on top of
    // the next segment's thumbnail instead of behind it.
    zIndex: 5,
  },
  timelineBottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    background: "linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 100%)",
    pointerEvents: "none" as const,
    // Above the segment thumbnail (z-index implicit) but below the
    // resize handle (z-index 10) and the icon row (z-index 1 inside the
    // segment, which still wins because segments stack later in DOM).
    zIndex: 1,
    // Inherit the timeline's rounded corners so the gradient hugs the
    // bottom edge cleanly.
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  timelineIcons: {
    // Anchor to the bottom of the segment, full width, centred. Matches
    // the gallery card's icon bar so the affordance reads the same on
    // both surfaces.
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 4,
    zIndex: 1,
    display: "flex",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none" as const,
  },
  timelineSegmentOrder: {
    position: "absolute",
    top: 4,
    left: 6,
    zIndex: 2,
    fontSize: 11,
    fontWeight: 700,
    color: "#f1f5f9",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.8)",
    fontVariantNumeric: "tabular-nums" as const,
    pointerEvents: "none" as const,
  },
  timelineSegmentThumb: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: 0.3,
    pointerEvents: "none",
    zIndex: 0,
  },
  timelineActions: {
    display: "flex",
    gap: 24,
    alignItems: "stretch",
    flexWrap: "wrap",
  },
  // Property tile in the row under the timeline. Interactive tiles
  // (Scene, Sound when togglable, Video when uploadable) sit on a slate
  // background; static tiles (Duration, Sound "None", Video "None") are
  // transparent so they blend into the editor's main surface.
  timelineTile: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
    padding: "8px 12px",
    border: "none",
    borderRadius: 6,
    textAlign: "left" as const,
    color: "inherit",
    font: "inherit",
    margin: 0,
  },
  timelineTileStatic: {
    background: "transparent",
    cursor: "default",
  },
  timelineTileClickable: {
    background: "#1e293b",
    cursor: "pointer",
    transition: "background 0.15s, transform 0.05s",
  },
  timelinePropLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  timelinePropValue: {
    fontSize: 15,
    fontWeight: 600,
    color: "#f1f5f9",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: 220,
    fontVariantNumeric: "tabular-nums",
  },
  fontStepperRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  fontStepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: "#1e293b",
    border: "none",
    color: "#e2e8f0",
    cursor: "pointer",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    fontFamily: "inherit",
  },
  timelineHandle: {
    position: "absolute",
    // Sit on the right edge of the segment, vertically centred and
    // half-outside the segment so the user can grab it without worrying
    // about hitting the next segment. With overflow:visible above, the
    // handle floats freely on top of whatever's beside it.
    right: -10,
    top: "50%",
    transform: "translateY(-50%)",
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "#3b82f6",
    border: "2px solid #0f172a",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.6)",
    cursor: "ew-resize",
    // High z-index so it always paints above sibling segments and the
    // timeline border, even mid-drag.
    zIndex: 10,
    touchAction: "none",
  },
  galleryCardCurrent: {
    outline: "2px solid #3b82f6",
    outlineOffset: 2,
    borderRadius: 8,
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: 600,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  timelineDur: {
    fontSize: 11,
    color: "#94a3b8",
    fontVariantNumeric: "tabular-nums",
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 14,
    fontWeight: 500,
    color: "#94a3b8",
  },
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
  },
  styleRow: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginTop: 8,
  },
  styleLabel: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "#94a3b8",
    flex: 1,
  },
  checkbox: {
    width: 16,
    height: 16,
    cursor: "pointer",
    accentColor: "#94a3b8",
  },
  scenesHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addButton: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "1px solid #334155",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
  },
  scenesList: {
    display: "flex",
    flexDirection: "column",
    // No gap between rows — each row's own vertical padding (sceneRow
    // 8px top/bottom) plus the thin .scene-list-row divider handles
    // separation, so the divider lines look balanced between rows.
    gap: 0,
    // Constrain the list to roughly the remaining viewport height and
    // let it scroll internally. Timeline + property tiles + "Add
    // Scene" button (all rendered outside this div) stay fixed.
    maxHeight: "60vh",
    overflowY: "auto" as const,
    // Force a thin, dark scrollbar directly on this scrollable
    // element. scrollbar-width doesn't inherit from html/body, so
    // without an explicit value here Chrome falls back to its full
    // default scrollbar width regardless of any ::-webkit-scrollbar
    // rules. scrollbar-color sets thumb/track colors in Firefox and
    // Chrome's native thin scrollbar.
    scrollbarWidth: "thin" as const,
    scrollbarColor: "#1e293b transparent",
    scrollbarGutter: "stable",
  },
  sceneRow: {
    display: "flex",
    gap: 4,
    alignItems: "flex-start",
    // Extra bottom padding so the next divider line sits comfortably
    // below the last input box rather than pressing against it.
    padding: "8px 6px 25px",
    // position: relative anchors the divider strip + the highlight
    // pseudo. The row's stacking-context z-index lives in
    // globals.css (.scene-list-row { z-index: 0 }) so the
    // :has(details[open]) rule can raise it when the Prizes logo
    // dropdown is open — without that, the dropdown gets occluded by
    // later rows that have their own z-index:0 contexts.
    position: "relative" as const,
    transition: "background 0.15s",
  },
  // Selected-row highlight is now drawn by .scene-list-row.is-selected
  // ::before in globals.css so it can be inset from the top divider
  // line. Keeping the key in case other inline references show up.
  sceneRowSelected: {} as React.CSSProperties,
  sceneInputCell: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  },
  sceneInputCaption: {
    fontSize: 10,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  lineupVs: {
    fontSize: 10,
    fontWeight: 700,
    color: "#94a3b8",
    letterSpacing: 1,
    flexShrink: 0,
    minWidth: 16,
    textAlign: "center" as const,
  },
  fontSizeCell: {
    // Mirrors sceneInputCell but stays its natural width (the font-size
    // input is fixed at 56 px) so the caption can sit above without
    // forcing the column to grow. marginLeft replaces what used to live
    // on the input itself so caption + box share the same x-origin.
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flexShrink: 0,
    marginLeft: 12,
  },
  columnHeader: {
    fontSize: 10,
    fontWeight: 600,
    color: "#475569",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  sceneNumber: {
    fontSize: 16,
    color: "#94a3b8",
    fontWeight: 700,
    minWidth: 32,
    textAlign: "center" as const,
    flexShrink: 0,
  },
  sceneFixedName: {
    flex: 1,
    padding: "8px 12px",
    fontSize: 14,
    color: "#94a3b8",
    fontWeight: 500,
  },
  sceneInput: {
    flex: 1,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
    // border-box so width:100% inside the new caption wrappers takes
    // the whole cell (instead of content-box pushing padding past it
    // and erasing the gap between siblings).
    boxSizing: "border-box" as const,
    minWidth: 0,
  },
  colorRow: {
    display: "flex",
    gap: 12,
    marginTop: 8,
  },
  colorLabel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    flex: 1,
  },
  colorInput: {
    width: 48,
    height: 48,
    border: "1px solid #334155",
    borderRadius: 8,
    backgroundColor: "transparent",
    cursor: "pointer",
    padding: 2,
  },
  colorName: {
    fontSize: 11,
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "capitalize" as const,
  },
  colorHex: {
    fontSize: 11,
    color: "#475569",
    fontFamily: "monospace",
  },
  layoutSelect: {
    padding: "8px 6px",
    borderRadius: 8,
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    fontSize: 12,
    outline: "none",
    cursor: "pointer",
    minWidth: 0,
    flexShrink: 0,
  },
  attachVideoButton: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px dashed #334155",
    backgroundColor: "transparent",
    color: "#64748b",
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
  } as React.CSSProperties,
  fontSizeInput: {
    width: 56,
    padding: "8px 6px",
    borderRadius: 8,
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    fontSize: 13,
    textAlign: "center" as const,
    outline: "none",
    flexShrink: 0,
    boxSizing: "border-box" as const,
  },
  durationInput: {
    width: 44,
    padding: "8px 4px",
    borderRadius: 8,
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#e2e8f0",
    fontSize: 13,
    textAlign: "center" as const,
    outline: "none",
    flexShrink: 0,
  },
  downloadButton: {
    marginTop: 12,
    padding: "12px 20px",
    borderRadius: 8,
    border: "none",
    backgroundColor: "#e2e8f0",
    color: "#0a0a0a",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  muteIcon: {
    background: "none",
    border: "none",
    padding: 2,
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: 1,
    width: 18,
  },
  muteIconSpacer: {
    width: 18,
    flexShrink: 0,
  },
  removeButton: {
    padding: "4px 8px",
    borderRadius: 4,
    border: "none",
    backgroundColor: "transparent",
    color: "#64748b",
    fontSize: 14,
    cursor: "pointer",
    flexShrink: 0,
  },
  galleryButton: {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid #334155",
    backgroundColor: "transparent",
    color: "#94a3b8",
    fontSize: 13,
    cursor: "pointer",
  },
  dockOverlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "transparent",
    zIndex: 1000,
  },
  dockPanel: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 390,
    maxWidth: "90vw",
    backgroundColor: "#111118",
    borderLeft: "1px solid #1e293b",
    boxShadow: "-8px 0 24px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    zIndex: 1001,
    transition: "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)",
    willChange: "transform",
  },
  dockHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid #1e293b",
  },
  dockClose: {
    background: "none",
    border: "none",
    color: "#64748b",
    fontSize: 18,
    cursor: "pointer",
    padding: "4px 8px",
  },
  dockBody: {
    padding: 20,
    overflowY: "auto" as const,
    flex: 1,
  },
  categoryHeading: {
    fontSize: 14,
    fontWeight: 600,
    color: "#94a3b8",
    margin: "0 0 12px 0",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  galleryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 12,
    marginBottom: 24,
  },
  galleryCard: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 6,
    cursor: "default",
  },
  galleryPreview: {
    position: "relative",
    width: "100%",
    aspectRatio: "9/16",
    borderRadius: 8,
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  galleryIconBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    gap: 6,
    justifyContent: "center",
    alignItems: "center",
    padding: "6px 4px",
    background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)",
    pointerEvents: "none" as const,
  },
  galleryIndex: {
    fontSize: 24,
    fontWeight: 700,
    color: "#334155",
  },
  galleryLabel: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center" as const,
  },
};
