import { loadFont as loadDelaGothicOne } from "@remotion/google-fonts/DelaGothicOne";
import { loadFont as loadExo2 } from "@remotion/google-fonts/Exo2";
import { loadFont as loadPermanentMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadBigShoulders } from "@remotion/google-fonts/BigShoulders";
import { loadFont as loadBowlbyOneSC } from "@remotion/google-fonts/BowlbyOneSC";
import { loadFont as loadFugazOne } from "@remotion/google-fonts/FugazOne";
import { loadFont as loadPassionOne } from "@remotion/google-fonts/PassionOne";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadChakraPetch } from "@remotion/google-fonts/ChakraPetch";
import { loadFont as loadRajdhani } from "@remotion/google-fonts/Rajdhani";
import type { ColorScheme } from "./types";
import { FPS, DEFAULT_SCENE_DURATION } from "./types";
import { assetUrl } from "./config";

export type FontConfig = {
  fontFamily: string;
  fontWeight?: number;
  fontStyle?: string;
  lineHeight?: number;
};

// Load only the exact weight/style/subset each scene template actually uses.
// Without these options @remotion/google-fonts fans out to every weight ×
// every subset per family — 100s of network requests per render, each one
// holding an unresolved delayRender() handle, a single stalled fetch
// freezes the whole render and the FIFO queue behind it.
// Weight coverage is cross-referenced from the FONT_MAP defaults below and
// hardcoded fontWeight overrides in HelloWorld.tsx (Exo 2 at 700/800 in
// Killstreak/King overlays, Passion One's `?? 700` fallback).
const SUBSETS: Array<"latin"> = ["latin"];

export const FONT_MAP: Record<string, FontConfig> = {
  // Single-weight fonts (Google only ships 400). One file per family.
  "Dela Gothic One": {
    fontFamily: loadDelaGothicOne("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Permanent Marker": {
    fontFamily: loadPermanentMarker("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Anton": {
    fontFamily: loadAnton("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Bowlby One SC": {
    fontFamily: loadBowlbyOneSC("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Fugaz One": {
    fontFamily: loadFugazOne("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  // Two-weight font — `?? 700` fallback in HelloWorld may pick 700.
  "Passion One": {
    fontFamily: loadPassionOne("normal", { weights: ["400", "700"], subsets: SUBSETS }).fontFamily,
    lineHeight: 0.85,
  },
  // Variable fonts — only the weights we render. Exo 2 italic is used at
  // 700/800/900 (sceneUtils default + Killstreak/King/BotW overlays in
  // HelloWorld.tsx). Big Shoulders 600 from fontConfig. Montserrat italic
  // 900 from fontConfig (no overrides).
  "Exo 2": {
    fontFamily: loadExo2("italic", { weights: ["700", "800", "900"], subsets: SUBSETS }).fontFamily,
    fontWeight: 900,
    fontStyle: "italic",
  },
  "Big Shoulders": {
    fontFamily: loadBigShoulders("normal", { weights: ["600"], subsets: SUBSETS }).fontFamily,
    fontWeight: 600,
  },
  "Montserrat": {
    fontFamily: loadMontserrat("italic", { weights: ["900"], subsets: SUBSETS }).fontFamily,
    fontWeight: 900,
    fontStyle: "italic",
  },
  // Display name omits "Bold Italic" — fontWeight/fontStyle below apply it.
  "Chakra Petch": {
    fontFamily: loadChakraPetch("italic", { weights: ["700"], subsets: SUBSETS }).fontFamily,
    fontWeight: 700,
    fontStyle: "italic",
  },
  // Display name omits "Medium" — fontWeight below applies it.
  "Rajdhani": {
    fontFamily: loadRajdhani("normal", { weights: ["500"], subsets: SUBSETS }).fontFamily,
    fontWeight: 500,
  },
};

export const FONT_OPTIONS = Object.keys(FONT_MAP);

export const SCENE_DURATION = DEFAULT_SCENE_DURATION * FPS;

export const CHAR1 = assetUrl("char1.webp");
export const CHAR2 = assetUrl("char2.webp");
export const CHAR3 = assetUrl("char3.webp");

// Season 13 cast — used in place of CHAR1/2/3 in the S13 scene templates.
export const S13_CYGNUS = assetUrl("s13-Cygnus.webp");
export const S13_DATA = assetUrl("s13-Data.webp");
export const S13_GLITCH = assetUrl("s13-Glitch.webp");
export const S13_HAMMER = assetUrl("s13-Hammer-alt.webp");
export const S13_HAZE = assetUrl("s13-Haze.webp");
export const S13_LYRA = assetUrl("s13-Lyra.webp");
export const S13_MAXX = assetUrl("s13-Maxx.webp");
export const S13_NOVA = assetUrl("s13-Nova.webp");
export const S13_PYRON = assetUrl("s13-Pyron.webp");
export const S13_ZEPH = assetUrl("s13-Zeph.webp");
export const S13_ARENA = assetUrl("s13-Arena.png");
export const S13_LOGO = assetUrl("s13-Logo.webp");
export const S13_STRIPE = assetUrl("s13-stripe.svg");
export const LOGO = assetUrl("logo.webp");
export const LOGO11 = assetUrl("s11logo.webp");
export const S11ART = assetUrl("S11art.webp");
export const LOGO10 = assetUrl("s10logo.webp");
export const S10ART = assetUrl("S10art.webp");
export const BRACKETS = assetUrl("brackets.webp");
export const BELT1 = assetUrl("Belt1.webp");
export const ARENA = assetUrl("arena.webp");

// Shared customStyle factories for S13 scenes. Without an explicit
// customStyle, SceneCard cycles through 4 background variants keyed by
// layoutIndex % 4 — one of which ends in pure white, which is what
// produced the unwanted bright tone. These two give every S13 scene an
// explicit, deliberate light/dark focus instead of leaving it to that
// arbitrary array-position cycling.
export const lightFocusedStyle = (c: ColorScheme) => ({
  background: `linear-gradient(135deg, ${c.dark}, ${c.light})`,
  textColor: c.dark,
});

export const darkFocusedStyle = (c: ColorScheme) => ({
  background: `linear-gradient(135deg, #000000, ${c.dark})`,
  textColor: "#ffffff",
});

// Parses a #rgb/#rrggbb hex color, rotates its hue by hueDeg degrees and
// nudges lightness by lightnessDeltaPct percentage points, returning a
// plain hsl() string. Deliberately NOT using CSS relative color syntax
// (`hsl(from ...)`) — that needs Chrome 119+/Safari 16.4+, fine for the
// server-side renderer's controlled Chromium but not guaranteed in
// whatever browser views the editor's live <Player> preview. A
// browser that can't parse "hsl(from ...)" drops the whole declaration
// and falls back to an inherited color, which is exactly the "text turned
// white" bug this replaced. Plain hsl(h, s%, l%) has universal support.
export function shiftHue(hex: string, hueDeg: number, lightnessDeltaPct = 0): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex; // not a hex color we can parse — leave untouched
  const hexBody = m[1];
  const expand = hexBody.length === 3
    ? hexBody.split("").map((ch) => ch + ch).join("")
    : hexBody;
  const r = parseInt(expand.slice(0, 2), 16) / 255;
  const g = parseInt(expand.slice(2, 4), 16) / 255;
  const b = parseInt(expand.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const newH = (h + hueDeg + 360) % 360;
  const newL = Math.min(100, Math.max(0, l * 100 + lightnessDeltaPct));
  return `hsl(${newH.toFixed(1)}, ${(s * 100).toFixed(1)}%, ${newL.toFixed(1)}%)`;
}

export type CharPlacement = {
  src: string;
  side: "left" | "right";
  scale: number;
  bottomPct: number;
  flip?: boolean;
  offsetX?: number;
  widthPct?: number;
  leftPct?: number;
  opacity?: number;
  fadeOnly?: boolean;
  // Stacks two black silhouette copies behind the character art: one solid
  // at 30px offset, one 50%-opacity at 60px offset (non-column mode only).
  doubleShadow?: boolean;
};

// "lineSlide" is unrelated to the slideLinesOverlay feature below (that's
// a separate labeled-plane overlay system) — this is a plain TextMode
// variant: text is NOT split into one-word-per-line, it wraps normally
// inside an 80%-width box and each \n-delimited line slides in from the
// right with a staggered delay.
// "marquee" renders the full text as a single line that continuously
// scrolls right-to-left across the frame over the scene's duration — no
// word-by-word reveal, no "shift up to keep newest word visible" behavior.
export type TextMode = "normal" | "flat" | "scroll" | "lineSlide" | "marquee";

export type CustomControl =
  | { type: "videoUpload"; field: "backgroundVideo"; label?: string }
  | { type: "videoMute" }
  | { type: "weekPicker" };

export type SceneLayout = {
  label: string;
  category: string;
  characters: CharPlacement[];
  backgroundVideo?: { src: string; scale?: number; blendMode?: string; startFrom?: number; muted?: boolean };
  backgroundImageSrc?: string;
  backgroundImageStatic?: { src: string; filter?: string };
  spotlight?: boolean;
  textBlock?: boolean;
  // leftAnchorPx only applies when align === "left" — distance from the
  // screen's left edge for the left-anchored word stack. Defaults to 30px.
  textDefaults?: { x?: number; y?: number; fontSize?: number; rotateZ?: number; rotateX?: number; perspective?: number; mode?: TextMode; align?: "left" | "center" | "right"; leftAnchorPx?: number };
  customStyle?: (colors: ColorScheme) => { background: string; textColor: string; textGlow?: string };
  titleCard?: boolean;
  logoSrc?: string;
  // Vertical pixel offset applied to the title-card logo stomp graphic
  // (positive = further down). Layout-specific because the shared
  // TitleCard component is reused across multiple seasons' logo scenes.
  logoOffsetY?: number;
  // Slow-panning full-bleed background image, rendered behind the scene's
  // existing gradient (which becomes translucent on top of it once this is
  // set). "ltr" pans the visible window left-to-right across the image
  // over the scene's duration; "rtl" reverses it.
  backgroundPan?: { src: string; direction: "ltr" | "rtl" };
  // One-shot decorative stripe graphic that slides in from off-canvas right
  // and eases to rest with its left edge at stopAtLeftPx, anchored at
  // bottomPct from the bottom of the frame. Plays once near the start of
  // the scene, then holds at rest. Rendered as inline SVG (not an image
  // file) so its gradient can be driven by the scene's actual colorScheme
  // at render time — see SlideInGraphic in HelloWorld.tsx.
  slideInGraphic?: { bottomPct: number; stopAtLeftPx: number };
  // Enables the user-editable Subtitle input in the editor (second text
  // box, below Title) for this layout. The typed value renders below the
  // slide-in stripe in lineSlide mode — small, centered, dark-tinted. Only
  // meaningful alongside slideInGraphic; see the lineSlide branch and
  // isSubtitleEnabledLayout() in HelloWorld.tsx.
  subtitleEnabled?: boolean;
  prizesGrid?: boolean;
  loopVideo?: boolean;
  beltStomp?: { src: string };
  battleOverlay?: boolean;
  battleSlide?: number;
  weeklyTitle?: boolean;
  // Title input accepts Enter in the editor; each typed line renders as
  // its own row in the word-stack text modes (normal/flat/scroll). Without
  // \n in the text the classic one-word-per-row behavior is unchanged.
  multilineText?: boolean;
  // Centered hexagon outline (highlight color) with a slow expanding
  // hexagonal ripple behind it — see HexRippleOverlay in HelloWorld.tsx.
  hexRipple?: boolean;
  killstreakOverlay?: boolean;
  kingOverlay?: boolean;
  slideLinesOverlay?: boolean;
  slideLinesLabels?: string[];
  slideLinesOffsetX?: number;
  slideLinesDuel?: boolean;
  slideLinesTourney?: boolean;
  slideLinesFixed?: boolean;
  polkaDotOverlay?: boolean;
  top10?: boolean;
  videoFit?: "cover" | "contain";
  defaultDuration?: number;
  sceneMusic?: { src: string; fadeIn?: number; fadeOut?: number; startFrom?: number };
  customControls?: CustomControl[];
};

export type { ColorScheme };
