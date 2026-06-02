import { loadFont as loadDelaGothicOne } from "@remotion/google-fonts/DelaGothicOne";
import { loadFont as loadExo2 } from "@remotion/google-fonts/Exo2";
import { loadFont as loadPermanentMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadBigShoulders } from "@remotion/google-fonts/BigShoulders";
import { loadFont as loadBowlbyOneSC } from "@remotion/google-fonts/BowlbyOneSC";
import { loadFont as loadFugazOne } from "@remotion/google-fonts/FugazOne";
import { loadFont as loadPassionOne } from "@remotion/google-fonts/PassionOne";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
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
};

export const FONT_OPTIONS = Object.keys(FONT_MAP);

export const SCENE_DURATION = DEFAULT_SCENE_DURATION * FPS;

export const CHAR1 = assetUrl("char1.webp");
export const CHAR2 = assetUrl("char2.webp");
export const CHAR3 = assetUrl("char3.webp");
export const LOGO = assetUrl("logo.webp");
export const LOGO11 = assetUrl("s11logo.webp");
export const S11ART = assetUrl("S11art.webp");
export const LOGO10 = assetUrl("s10logo.webp");
export const S10ART = assetUrl("S10art.webp");
export const BRACKETS = assetUrl("brackets.webp");
export const BELT1 = assetUrl("Belt1.webp");
export const ARENA = assetUrl("arena.webp");

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
};

export type TextMode = "normal" | "flat" | "scroll";

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
  textDefaults?: { x?: number; y?: number; fontSize?: number; rotateZ?: number; rotateX?: number; perspective?: number; mode?: TextMode };
  customStyle?: (colors: ColorScheme) => { background: string; textColor: string; textGlow?: string };
  titleCard?: boolean;
  logoSrc?: string;
  prizesGrid?: boolean;
  loopVideo?: boolean;
  beltStomp?: { src: string };
  battleOverlay?: boolean;
  battleSlide?: number;
  weeklyTitle?: boolean;
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
