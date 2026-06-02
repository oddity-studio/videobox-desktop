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
// Without these options @remotion/google-fonts fans out to every weight × every
// subset per family — 100s of network requests per render, with each one
// holding an unresolved delayRender() handle. A single stalled fetch then
// freezes the whole render and the FIFO queue behind it.
const SUBSETS = ["latin"];

export const FONT_MAP: Record<string, FontConfig> = {
  "Dela Gothic One": {
    fontFamily: loadDelaGothicOne("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Exo 2": {
    fontFamily: loadExo2("italic", { weights: ["900"], subsets: SUBSETS }).fontFamily,
    fontWeight: 900,
    fontStyle: "italic",
  },
  "Permanent Marker": {
    fontFamily: loadPermanentMarker("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Anton": {
    fontFamily: loadAnton("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Big Shoulders": {
    fontFamily: loadBigShoulders("normal", { weights: ["600"], subsets: SUBSETS }).fontFamily,
    fontWeight: 600,
  },
  "Bowlby One SC": {
    fontFamily: loadBowlbyOneSC("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Fugaz One": {
    fontFamily: loadFugazOne("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
  },
  "Passion One": {
    fontFamily: loadPassionOne("normal", { weights: ["400"], subsets: SUBSETS }).fontFamily,
    lineHeight: 0.85,
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
