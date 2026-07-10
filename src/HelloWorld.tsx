import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  Sequence,
  Loop,
  Img,
  // OffthreadVideo decodes via ffmpeg out of band — required for HEVC/H.265
  // assets like Cube.mp4 in server-side renders (Chrome Headless Shell only
  // ships H.264). It also falls back to plain <video> in @remotion/player so
  // the editor preview behaves identically.
  OffthreadVideo as Video,
  // Used ONLY during server renders (gated on frameSyncMedia) for looping
  // media: plain <video autoPlay>/<img> play on WALL CLOCK, which is
  // undefined during a render — frames aren't captured in real time, so the
  // media raced through its whole sequence in a few output frames
  // ("twitching"). Preview keeps the cheap native elements. Looping videos
  // render as OffthreadVideo inside <Loop> (frame extraction happens in
  // Remotion's ffmpeg compositor) because Html5Video's per-frame seeking
  // never completes in Linux headless Chrome — the seek to frame 1 hangs
  // until delayRender times out. delayRender/continueRender power the
  // metadata probe that measures the loop length.
  AnimatedImage,
  getRemotionEnvironment,
  delayRender,
  continueRender,
  Audio,
} from "remotion";
import type { VideoProps, Scene } from "./types";
import { getSceneFrames } from "./types";
import { LottieTransition, getTransitionProfile } from "./LottieTransition";
import {
  FONT_MAP,
  SCENE_DURATION,
  LOGO,
  shiftHue,
} from "./sceneUtils";
import type { FontConfig, CharPlacement, TextMode, CustomControl, SceneLayout, ColorScheme } from "./sceneUtils";
import { SCENE_LAYOUTS } from "./scenes";
import { assetUrl } from "./config";

export { FONT_OPTIONS } from "./sceneUtils";

// SCENE_LAYOUTS is assembled from individual scene files in src/scenes/

export const LAYOUT_OPTIONS = SCENE_LAYOUTS.map((l, i) => ({ index: i, label: l.label, category: l.category }));
export const getLayoutControls = (index: number): CustomControl[] =>
  SCENE_LAYOUTS[index]?.customControls ?? [];

/**
 * Resolve a scene's layout (number index OR string label) to a numeric index.
 * String labels are preferred in stored presets because they survive template reordering.
 */
export const resolveLayoutIndex = (layout: number | string | undefined, fallback: number): number => {
  if (typeof layout === "number") return layout;
  if (typeof layout === "string") {
    const idx = SCENE_LAYOUTS.findIndex((l) => l.label === layout);
    return idx >= 0 ? idx : fallback;
  }
  return fallback;
};

export const getLayoutLabel = (index: number): string | undefined => SCENE_LAYOUTS[index]?.label;
export const isBattleLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.battleOverlay === true;
export const isWeeklyTitleLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.weeklyTitle === true;
export const isKillstreakOverlayLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.killstreakOverlay === true;
export const isKingOverlayLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.kingOverlay === true;
export const isSlideLinesOverlayLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.slideLinesOverlay === true;
export const isSlideLinesDuelLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.slideLinesDuel === true;
export const isSlideLinesTourneyLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.slideLinesTourney === true;
export const isSlideLinesFixedLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.slideLinesFixed === true;
export const isTextBlockLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.textBlock === true;
export const isPrizesGridLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.prizesGrid === true;
export const isTop10Layout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.top10 === true;
export const isSubtitleEnabledLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.subtitleEnabled === true;
export const isHexRippleLayout = (index: number): boolean =>
  SCENE_LAYOUTS[index]?.hexRipple === true;
export const getLayoutDefaultDuration = (index: number): number | undefined =>
  SCENE_LAYOUTS[index]?.defaultDuration;
export const getLayoutDefaultFontSize = (index: number): number | undefined =>
  SCENE_LAYOUTS[index]?.textDefaults?.fontSize;

// Measure a video's duration in frames so a looping OffthreadVideo can be
// wrapped in <Loop durationInFrames>. Only engaged during frame-synced
// renders (pass null src otherwise — the hook is inert then). Metadata
// loads reliably even in Linux headless Chrome; it's per-frame seeking of
// <video> elements that hangs there, which is why looping media renders
// through OffthreadVideo (ffmpeg frame extraction) instead of Html5Video.
const useLoopedVideoFrames = (src: string | null, fps: number): number | null => {
  const [frames, setFrames] = React.useState<number | null>(null);
  // Handle created during render (not in the effect) so Remotion can never
  // capture a frame between mount and the effect running.
  const [handle] = React.useState(() => (src ? delayRender(`Measuring loop duration of ${src}`) : null));
  React.useEffect(() => {
    if (!src || handle === null) return;
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setFrames(Math.max(1, Math.round(v.duration * fps)));
      }
      continueRender(handle);
    };
    v.addEventListener("loadedmetadata", done, { once: true });
    v.addEventListener("error", done, { once: true });
    v.src = src;
    return () => {
      v.removeEventListener("loadedmetadata", done);
      v.removeEventListener("error", done);
      v.removeAttribute("src");
    };
  }, [src, fps, handle]);
  return frames;
};

export const resolveSceneMusic = (scene: Scene): { src: string; fadeIn?: number; fadeOut?: number; startFrom?: number } | undefined => {
  const layoutIndex = resolveLayoutIndex(scene.layout, 0);
  return SCENE_LAYOUTS[layoutIndex % SCENE_LAYOUTS.length].sceneMusic;
};

export const resolveBackgroundVideo = (scene: Scene): Scene["backgroundVideo"] | undefined => {
  const layoutIndex = resolveLayoutIndex(scene.layout, 0);
  const layout = SCENE_LAYOUTS[layoutIndex % SCENE_LAYOUTS.length];
  const merged = layout.backgroundVideo || scene.backgroundVideo
    ? { ...(layout.backgroundVideo ?? {}), ...(scene.backgroundVideo ?? {}) } as Scene["backgroundVideo"]
    : undefined;
  if (merged && !merged.src && layout.backgroundVideo?.src) {
    merged.src = layout.backgroundVideo.src;
  }
  return merged;
};

const FighterChar: React.FC<{
  placement: CharPlacement;
  frame: number;
  fps: number;
  charIndex: number;
  sceneDuration?: number;
  darkColor?: string;
}> = ({ placement, frame, fps, charIndex, sceneDuration = SCENE_DURATION, darkColor }) => {
  // Fade-only mode: no slide or bob, just opacity fade-in
  const fadeOnly = placement.fadeOnly ?? false;

  // Slide in from the side — simple interpolation instead of spring physics
  const slideFrames = 20;
  const delayFrames = charIndex * 10;
  const slideProgress = Math.min(Math.max((frame - delayFrames) / slideFrames, 0), 1);
  // Ease-out: decelerates into rest position
  const eased = 1 - (1 - slideProgress) * (1 - slideProgress);
  const offscreen = placement.side === "left" ? -600 : 600;
  const restX = placement.offsetX ?? 0;
  const driftX = fadeOnly ? interpolate(frame, [0, sceneDuration], [0, 80], { extrapolateRight: "clamp" }) : 0;
  const slideX = fadeOnly ? driftX : offscreen + (restX - offscreen) * eased;

  // Idle bob — fighting stance sway
  const bob = fadeOnly ? 0 : Math.sin(frame * 0.06 + charIndex * 2) * 6;
  // Subtle horizontal sway
  const sway = fadeOnly ? 0 : Math.sin(frame * 0.04 + charIndex * 3) * 4;

  // Exit: quick fade via GPU-accelerated filter (avoids expensive opacity compositing on large images)
  const exitStart = sceneDuration - 15;
  const exitProgress = frame > exitStart
    ? interpolate(frame, [exitStart, sceneDuration], [0, 1], { extrapolateRight: "clamp" })
    : 0;
  const baseOpacity = placement.opacity ?? 1;
  const fadeIn = fadeOnly ? interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const exitOpacity = baseOpacity * fadeIn * (1 - exitProgress);

  const isLeft = placement.side === "left";
  const flipX = placement.flip ? -1 : 1;
  const useWidth = placement.widthPct != null;

  if (useWidth) {
    // Column mode: fixed-width container clips a full-height image
    return (
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: `${placement.leftPct ?? 0}%`,
          width: `${placement.widthPct}%`,
          height: "100%",
          overflow: "hidden",
          opacity: exitOpacity,
          pointerEvents: "none" as const,
        }}
      >
        <Img
          src={placement.src}
          style={{
            height: "100%",
            width: "auto",
            display: "block",
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: `translateX(calc(-50% + ${slideX + sway}px)) translateY(${bob}px) scale(${placement.scale}) scaleX(${flipX})`,
            transformOrigin: "bottom center",
            willChange: "transform",
          }}
        />
        {fadeOnly && darkColor && (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            background: `linear-gradient(to top left, ${darkColor}, transparent 60%)`,
            pointerEvents: "none" as const,
          }} />
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: `${placement.bottomPct - 2}%`,
        left: isLeft ? "-5%" : undefined,
        right: isLeft ? undefined : "-5%",
        height: "100%",
        opacity: exitOpacity,
        // flipX is NOT applied here. This box has an auto/shrink-to-fit
        // width based on the image's intrinsic size; mirroring it directly
        // would scale around its own anchored edge and flip which
        // direction it extends, pushing the whole box fully off-canvas
        // (confirmed bug — see CharPlacement.flip usages). The image is
        // mirrored on its own below instead, which is a fixed-size box
        // and safe to flip in place.
        transform: `translateX(${slideX + sway}px) translateY(${bob}px) scale(${placement.scale})`,
        transformOrigin: isLeft ? "bottom left" : "bottom right",
        pointerEvents: "none" as const,
        willChange: "transform, opacity",
      }}
    >
      {placement.doubleShadow && (
        <>
          {/* Outer shadow: fainter, further offset. brightness(0) recolors
              the character's exact alpha shape to solid black without any
              actual image processing — it's a silhouette of the cutout. */}
          <Img
            src={placement.src}
            style={{
              position: "absolute", top: 0, left: 0, height: "100%", width: "auto",
              transform: `translate(60px, 60px) scaleX(${flipX})`,
              filter: "brightness(0)",
              opacity: 0.5,
            }}
          />
          {/* Inner shadow: solid black, closer offset. */}
          <Img
            src={placement.src}
            style={{
              position: "absolute", top: 0, left: 0, height: "100%", width: "auto",
              transform: `translate(30px, 30px) scaleX(${flipX})`,
              filter: "brightness(0)",
            }}
          />
        </>
      )}
      <Img
        src={placement.src}
        style={{ height: "100%", width: "auto", display: "block", transform: `scaleX(${flipX})` }}
      />
    </div>
  );
};

// Full-bleed background image that slowly pans horizontally across the
// scene's duration. Oversized to 130% width so the pan never exposes a
// canvas edge. "ltr" interpolates the visible window from the image's left
// portion to its right portion (image itself translates +X → -X); "rtl"
// reverses that.
const ArenaPanLayer: React.FC<{ src: string; direction: "ltr" | "rtl"; sceneDuration?: number }> = ({ src, direction, sceneDuration = SCENE_DURATION }) => {
  const frame = useCurrentFrame();
  const PAN_PX = 140;
  const range = direction === "ltr" ? [PAN_PX, -PAN_PX] : [-PAN_PX, PAN_PX];
  const x = interpolate(frame, [0, sceneDuration], range, { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          top: 0,
          left: "-15%",
          width: "130%",
          height: "100%",
          objectFit: "cover",
          transform: `translateX(${x}px)`,
        }}
      />
    </div>
  );
};

// Canvas dimensions from Root.tsx's <Composition width={1080} height={1920} .../>.
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
// Must match the inline <svg height> in SlideInGraphic — used elsewhere to
// lock lineSlide text to the stripe's vertical center.
const STRIPE_HEIGHT_PX = 295;

// One-shot decorative stripe graphic: slides in from off-canvas right,
// eases to rest with its left edge at stopAtLeftPx, then holds. Same
// ease-out timing as the character entrance slide (FighterChar) for
// consistency. Rendered as inline SVG (rather than an <Img> of a static
// pre-colored file) so the gradient can use the scene's actual
// colorScheme.highlight, darkening slightly toward the bottom.
const SlideInGraphic: React.FC<{ bottomPct: number; stopAtLeftPx: number; highlightColor: string }> = ({ bottomPct, stopAtLeftPx, highlightColor }) => {
  const frame = useCurrentFrame();
  const gradientId = React.useId();
  const slideFrames = 20;
  const progress = Math.min(Math.max(frame / slideFrames, 0), 1);
  const eased = 1 - (1 - progress) * (1 - progress);
  const left = CANVAS_WIDTH + (stopAtLeftPx - CANVAS_WIDTH) * eased;
  const darker = `color-mix(in srgb, ${highlightColor} 75%, black 25%)`;
  return (
    <div style={{ position: "absolute", bottom: `${bottomPct}%`, left: `${left}px`, pointerEvents: "none" as const }}>
      <svg xmlns="http://www.w3.org/2000/svg" width="2104" height="295" style={{ display: "block" }}>
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="0%" y1="100%" y2="0%">
            <stop offset="0%" stopColor={darker} />
            <stop offset="100%" stopColor={highlightColor} />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradientId})`}
          d="M2024.891,294.733 L349.515,294.733 L428.225,0.982 L2103.601,0.982 L2024.891,294.733 ZM187.703,294.733 L266.413,0.982 L394.867,0.982 L316.157,294.733 L187.703,294.733 ZM74.435,294.733 L153.145,0.982 L231.437,0.982 L152.727,294.733 L74.435,294.733 ZM0.001,294.733 L78.711,0.982 L119.787,0.982 L41.077,294.733 L0.001,294.733 Z"
        />
      </svg>
    </div>
  );
};

const CharacterLayer: React.FC<{ layoutIndex: number; sceneDuration?: number; darkColor?: string }> = ({ layoutIndex, sceneDuration, darkColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = SCENE_LAYOUTS[layoutIndex % SCENE_LAYOUTS.length];

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {layout.characters.map((placement, ci) => (
        <FighterChar
          key={ci}
          placement={placement}
          frame={frame}
          fps={fps}
          charIndex={ci}
          sceneDuration={sceneDuration}
          darkColor={darkColor}
        />
      ))}
    </div>
  );
};

const SoundWaveform: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.5 } });
  const BAR_COUNT = 48;
  const BAR_WIDTH = 1080 / BAR_COUNT;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "100%",
        height: 600,
        display: "flex",
        alignItems: "flex-end",
        gap: 0,
        opacity: enter * 0.7,
        mixBlendMode: "screen" as const,
        pointerEvents: "none" as const,
      }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        // Slower waves with strong per-bar variation via large phase offsets
        const seed = ((i * 137.5) % 17) + i * 0.3;
        const h1 = Math.sin(frame * 0.12 + seed * 2.5) * 0.5 + 0.5;
        const h2 = Math.sin(frame * 0.18 + seed * 4.1 + 3) * 0.5 + 0.5;
        const h3 = Math.cos(frame * 0.09 + seed * 1.7 + 7) * 0.5 + 0.5;
        // Mix so bars peak at very different times
        const raw = h1 * 0.4 + h2 * 0.35 + h3 * 0.25;
        const height = raw * raw * 500 * enter + 6;
        return (
          <div
            key={i}
            style={{
              width: BAR_WIDTH - 2,
              height,
              marginLeft: 1,
              marginRight: 1,
              backgroundColor: color,
              borderRadius: 3,
              opacity: 0.6 + h1 * 0.4,
            }}
          />
        );
      })}
    </div>
  );
};

// Battle of the Week waveform — animated rounded bars
const BattleWaveform: React.FC<{ centerY: number; color: string; glowColor: string }> = ({ centerY, color, glowColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const BAR_W = 7;
  const GAP = 8;
  const NUM_BARS = Math.floor((1080 + GAP) / (BAR_W + GAP));
  const MAX_H = 200;
  const MIN_H = 10;

  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: 1080, height: 1920, pointerEvents: "none" as const }}>
      {Array.from({ length: NUM_BARS }, (_, i) => {
        const phase = (i / NUM_BARS) * Math.PI * 6;
        const norm = 0.5
          + 0.40 * Math.sin(phase + t * 2.3)
          + 0.18 * Math.sin(phase * 1.9 + t * 3.7)
          + 0.09 * Math.sin(phase * 4.1 + t * 1.5)
          + 0.05 * Math.sin(phase * 2.7 + t * 5.1);
        const h = MIN_H + (MAX_H - MIN_H) * Math.max(0, Math.min(1, norm));
        const x = i * (BAR_W + GAP);
        const y = centerY - h / 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: BAR_W,
              height: h,
              borderRadius: BAR_W / 2,
              backgroundColor: color,
              opacity: 0.55,
              boxShadow: `0 0 18px ${glowColor}`,
            }}
          />
        );
      })}
    </div>
  );
};

// Battle of the Week overlay — vignette, waveform, VS, two usernames
const BOTW_OVERLAY = assetUrl("botw.webm");

const BotwVideo: React.FC = () => {
  const [exists, setExists] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    fetch(BOTW_OVERLAY, { method: "HEAD" })
      .then((r) => setExists(r.ok))
      .catch(() => setExists(false));
  }, []);
  if (!exists) return null;
  return (
    <AbsoluteFill style={{ zIndex: 20 }}>
      <Video
        src={BOTW_OVERLAY}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

const BattleOverlay: React.FC<{ text: string; sceneDuration: number; slide?: number; colors: ColorScheme }> = ({ text, sceneDuration, slide = 0, colors }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const opacity = enter * exit;

  // Split text on "|" for two usernames
  const parts = text.split("|").map((s) => s.trim());
  const userA = parts[0] || "";
  const userB = parts[1] || "";

  const exo2 = FONT_MAP["Exo 2"];
  const anton = FONT_MAP["Anton"];

  // Layout: VS at center (960), User A + waveform above, User B + waveform below
  const vsY = 960;
  const userAY = vsY - 320;  // 640
  const userBY = vsY + 220;  // 1180

  // Beat1: blue waveform behind A (active), Beat2: purple waveform behind B (active)
  const waveColor = slide === 0 ? "#24bdff" : "#ff38db";
  const waveGlow = slide === 0 ? "rgba(36,189,255,0.6)" : "rgba(255,56,219,0.6)";
  const waveCenterY = slide === 0 ? userAY : userBY;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {/* Overlay intro video — Beat1 only */}
      {slide === 0 && <BotwVideo />}

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: slide === 1
          ? `linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 40%, transparent 60%, ${colors.light} 100%)`
          : "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.78) 100%)",
        zIndex: 10,
      }} />

      {/* Waveform */}
      <div style={{ zIndex: 11 }}>
        <BattleWaveform centerY={waveCenterY} color={waveColor} glowColor={waveGlow} />
      </div>

      {/* User A */}
      {userA && (
        <div style={{
          position: "absolute", top: userAY - 50, left: 0, width: "100%",
          textAlign: "center", zIndex: 12,
        }}>
          {slide === 0 ? (
            <p style={{
              fontFamily: exo2.fontFamily, fontWeight: 800, fontStyle: "italic",
              fontSize: 95, color: "#38fff8",
              textShadow: "0 0 30px rgba(56,255,248,0.85), 0 0 15px rgba(56,255,248,0.85)",
              margin: 0, textTransform: "uppercase",
            }}>{userA}</p>
          ) : (
            <p style={{
              fontFamily: exo2.fontFamily, fontWeight: 700, fontStyle: "italic",
              fontSize: 70, color: "#FFFFFF", opacity: 0.5, letterSpacing: 20,
              margin: 0, textTransform: "uppercase",
            }}>{userA}</p>
          )}
        </div>
      )}

      {/* VS — Anton, white with yellow glow, centered */}
      <div style={{
        position: "absolute", top: vsY - 160, left: 0, width: "100%",
        textAlign: "center", zIndex: 12,
      }}>
        <p style={{
          fontFamily: anton.fontFamily, fontSize: 320, letterSpacing: -12,
          color: "#FFFFFF",
          textShadow: "0 0 40px rgba(255,240,160,0.9), 0 0 20px rgba(255,240,160,0.9)",
          margin: 0, lineHeight: 1,
        }}>VS</p>
      </div>

      {/* User B */}
      {userB && (
        <div style={{
          position: "absolute", top: userBY - 35, left: 0, width: "100%",
          textAlign: "center", zIndex: 12,
        }}>
          {slide === 1 ? (
            <p style={{
              fontFamily: exo2.fontFamily, fontWeight: 800, fontStyle: "italic",
              fontSize: 95, color: "#fc9990",
              textShadow: "0 0 30px rgba(252,153,144,0.85), 0 0 15px rgba(252,153,144,0.85)",
              margin: 0, textTransform: "uppercase",
            }}>{userB}</p>
          ) : (
            <p style={{
              fontFamily: exo2.fontFamily, fontWeight: 700, fontStyle: "italic",
              fontSize: 70, color: "#FFFFFF", opacity: 0.5, letterSpacing: 20,
              margin: 0, textTransform: "uppercase",
            }}>{userB}</p>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};

const BeltStompLayer: React.FC<{ src: string; sceneDuration: number; delayFrames?: number }> = ({ src, sceneDuration, delayFrames = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delayFrames);

  // Zoom in over ~20 frames with ease-in, then sudden hard stop
  const zoomFrames = 20;
  const progress = Math.min(f / zoomFrames, 1);
  const eased = progress * progress; // ease-in: accelerates into the stop
  const scale = interpolate(eased, [0, 1], [0.1, 2]);
  const opacity = interpolate(progress, [0, 0.05], [0, 1], { extrapolateRight: "clamp" });

  // Shake after stomp lands
  const afterStomp = f - zoomFrames;
  const shakeX = afterStomp > 0 && afterStomp < 15
    ? Math.sin(afterStomp * 2.5) * 8 * (1 - afterStomp / 15)
    : 0;
  const shakeY = afterStomp > 0 && afterStomp < 15
    ? Math.cos(afterStomp * 3.2) * 6 * (1 - afterStomp / 15)
    : 0;

  if (f <= 0) return null;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      paddingBottom: "15%",
      zIndex: 8,
      pointerEvents: "none" as const,
    }}>
      <Img
        src={src}
        style={{
          width: "80%",
          height: "auto",
          transform: `scale(${scale}) translate(${shakeX}px, ${shakeY}px)`,
          opacity,
          filter: `drop-shadow(0 0 30px rgba(0,0,0,0.5))`,
        }}
      />
    </div>
  );
};

const BracketsLayer: React.FC<{ src: string; sceneDuration: number }> = ({ src, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });

  // Movement keyframes as fraction of scene duration
  // Directions: down-right, pause, up-right, pause, down-left
  const t = frame / sceneDuration;
  const moveAmt = 500; // pixels of travel per segment

  // Straight directions: down, pause, right, pause, up, pause, right
  // 0.00-0.18: down
  // 0.18-0.25: pause
  // 0.25-0.43: right
  // 0.43-0.50: pause
  // 0.50-0.68: up
  // 0.68-0.75: pause
  // 0.75-0.93: right
  // 0.93-1.00: pause
  const moveX = 1000; // horizontal movement
  let dx = 0;
  let dy = 0;

  if (t < 0.18) {
    const p = t / 0.18;
    dy = p * moveAmt;
  } else if (t < 0.25) {
    dy = moveAmt;
  } else if (t < 0.43) {
    const p = (t - 0.25) / 0.18;
    dx = p * moveX;
    dy = moveAmt;
  } else if (t < 0.50) {
    dx = moveX;
    dy = moveAmt;
  } else if (t < 0.68) {
    const p = (t - 0.50) / 0.18;
    dx = moveX;
    dy = moveAmt - p * moveAmt;
  } else if (t < 0.75) {
    dx = moveX;
    dy = 0;
  } else if (t < 0.93) {
    const p = (t - 0.75) / 0.18;
    dx = moveX + p * moveX;
  } else {
    dx = moveX * 2;
  }

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      opacity: enter * 0.7,
      mixBlendMode: "screen" as const,
    }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "350%",
          height: "auto",
          transform: `translate(${-dx}px, ${-dy}px)`,
          willChange: "transform",
        }}
      />
    </div>
  );
};

// Weekly Title overlay — date range text near bottom, fades in like Videobox title slide
// Centered hexagon outline in the palette highlight color, with a faded
// hexagon ripple slowly expanding out from behind it. Pure frame-driven SVG
// (no wall-clock animation), so preview and server renders are identical.
// Also hosts the scene's center text pair (text2 big, text3 half-size below)
// and the bottom dark gradient the original Weekly Title got from its
// background-video path.
const HexRippleOverlay: React.FC<{
  colors: ColorScheme;
  sceneDuration: number;
  text2?: string;
  text3?: string;
  fontConfig: FontConfig;
  secondaryFontConfig?: FontConfig;
  fontSize?: number;
}> = ({ colors, sceneDuration, text2, text3, fontConfig, secondaryFontConfig, fontSize = 120 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pointy-top hexagon around the origin; scaled/translated via <g>.
  const R = 190;
  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const a = ((60 * i - 90) * Math.PI) / 180;
    return `${(R * Math.cos(a)).toFixed(2)},${(R * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

  // Entrance fade (matches the title text's timing family) + scene exit fade.
  const alpha = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;

  // Ripple: every loop a faded outline starts at the hexagon and slowly
  // grows outward while fading away. Two copies half a loop apart so a new
  // ring is always emerging as the previous one dissipates.
  const LOOP_SEC = 3;
  const loopFrames = fps * LOOP_SEC;
  const ripple = (phaseOffset: number) => {
    const t = ((frame + phaseOffset * loopFrames) % loopFrames) / loopFrames;
    return {
      scale: 1 + t * 1.1,
      opacity: (1 - t) * 0.45,
    };
  };
  const r1 = ripple(0);
  const r2 = ripple(0.5);

  // Hexagon vertical extent on the 1080x1920 canvas (center 960, radius R).
  // The first center text's top edge anchors at 2/3 of the hexagon's
  // height; the second text follows it in a flex column with a fixed gap,
  // so the gap never changes when the user resizes the text.
  const hexTop = 960 - R;
  const textAnchorY = hexTop + (2 * R * 2) / 3;
  const TEXT_GAP = 18;

  return (
    <AbsoluteFill style={{ zIndex: 11, opacity: alpha * exit, pointerEvents: "none" }}>
      {/* Bottom dark gradient — same one the original Weekly Title's
          background-video path draws (blendMode "normal" branch). */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "50%",
        background: `linear-gradient(to top, ${colors.dark}, transparent)`,
      }} />
      <svg
        viewBox="0 0 1080 1920"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        {/* Ripples render first so they sit behind the main outline */}
        <g transform={`translate(540 960) scale(${r1.scale})`} opacity={r1.opacity}>
          <polygon points={hexPoints} fill="none" stroke={colors.highlight} strokeWidth={6 / r1.scale} />
        </g>
        <g transform={`translate(540 960) scale(${r2.scale})`} opacity={r2.opacity}>
          <polygon points={hexPoints} fill="none" stroke={colors.highlight} strokeWidth={6 / r2.scale} />
        </g>
        <g transform="translate(540 960)">
          <polygon points={hexPoints} fill="none" stroke={colors.highlight} strokeWidth={10} strokeLinejoin="round" />
        </g>
      </svg>
      {/* Center text pair: big line + half-size line, constant gap */}
      {(text2 || text3) && (
        <div style={{
          position: "absolute",
          top: textAnchorY,
          left: 0,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: TEXT_GAP,
        }}>
          {text2 && (
            <p style={{
              fontFamily: fontConfig.fontFamily,
              fontWeight: 800,
              fontSize,
              lineHeight: 1,
              color: "#ffffff",
              margin: 0,
              textTransform: "uppercase",
              textAlign: "center",
            }}>{text2}</p>
          )}
          {text3 && (
            <p style={{
              fontFamily: (secondaryFontConfig ?? fontConfig).fontFamily,
              fontWeight: 700,
              fontSize: fontSize / 2,
              lineHeight: 1,
              color: "#ffffff",
              margin: 0,
              textTransform: "uppercase",
              textAlign: "center",
            }}>{text3}</p>
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};

const WeeklyTitleOverlay: React.FC<{ text: string; sceneDuration: number }> = ({ text, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const FADE_START = 2.0;
  const FADE_DUR = 0.5;
  const localT = t - FADE_START;
  const alpha = localT >= 0 ? Math.min(localT / FADE_DUR, 1.0) : 0;
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const exo2 = FONT_MAP["Exo 2"];

  if (!text) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: 300,
      left: 0,
      width: "100%",
      textAlign: "center",
      zIndex: 12,
      opacity: alpha * exit,
    }}>
      <p style={{
        fontFamily: exo2.fontFamily,
        fontWeight: 800,
        fontStyle: "italic",
        fontSize: 72,
        color: "#ffffff",
        margin: 0,
        textTransform: "uppercase",
      }}>{text}</p>
    </div>
  );
};

// Killstreak overlay — number + username fading in near the bottom, matches Videobox killstreak slide
const KillstreakOverlay: React.FC<{ text: string; sceneDuration: number }> = ({ text, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const FADE_START = 2.5;
  const FADE_DUR = 0.5;
  const localT = t - FADE_START;
  const alpha = localT >= 0 ? Math.min(localT / FADE_DUR, 1.0) : 0;
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const exo2 = FONT_MAP["Exo 2"];
  const anton = FONT_MAP["Anton"];

  // Text stored as "number|username"
  const parts = (text || "").split("|");
  const number = (parts[0] || "").trim();
  const username = (parts[1] || "").trim().slice(0, 20);

  if (!number && !username) return null;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 12,
      opacity: alpha * exit,
      pointerEvents: "none" as const,
    }}>
      {/* Number — Exo 2 Extra Bold, #F2AD41, 150px, drop shadow */}
      {number && (
        <p style={{
          position: "absolute",
          left: 0,
          width: "100%",
          bottom: 700,
          margin: 0,
          textAlign: "center",
          fontFamily: exo2.fontFamily,
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: 150,
          color: "#F2AD41",
          textShadow: "4px 4px 18px rgba(0,0,0,0.85)",
        }}>{number}</p>
      )}
      {/* Username — Anton, white, 70px */}
      {username && (
        <p style={{
          position: "absolute",
          left: 0,
          width: "100%",
          bottom: 500,
          margin: 0,
          textAlign: "center",
          fontFamily: anton.fontFamily,
          fontWeight: 400,
          fontSize: 70,
          color: "#ffffff",
          textTransform: "uppercase",
        }}>{username}</p>
      )}
    </div>
  );
};

// King overlay — username (top, gold) + "King of N Genres" (below, white), staggered fade-ins
const KingOverlay: React.FC<{ text: string; sceneDuration: number }> = ({ text, sceneDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const USER_FADE_START = 1.5;
  const NUM_FADE_START = 2.5;
  const FADE_DUR = 0.5;
  const userAlpha = Math.min(Math.max(t - USER_FADE_START, 0) / FADE_DUR, 1.0);
  const numAlpha = Math.min(Math.max(t - NUM_FADE_START, 0) / FADE_DUR, 1.0);
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const exo2 = FONT_MAP["Exo 2"];
  const anton = FONT_MAP["Anton"];

  // Text stored as "number|username"
  const parts = (text || "").split("|");
  const number = (parts[0] || "").trim();
  const username = (parts[1] || "").trim().slice(0, 20);
  const genreWord = number === "1" ? "Genre" : "Genres";
  const numberText = number ? `King of ${number} ${genreWord}` : "";

  if (!number && !username) return null;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      zIndex: 12,
      opacity: exit,
      pointerEvents: "none" as const,
    }}>
      {/* Username — Anton, gold (#F2AD41), 70px (on top) */}
      {username && (
        <p style={{
          position: "absolute",
          left: 0,
          width: "100%",
          bottom: 750,
          margin: 0,
          textAlign: "center",
          fontFamily: anton.fontFamily,
          fontWeight: 400,
          fontSize: 70,
          color: "#F2AD41",
          textTransform: "uppercase",
          opacity: userAlpha,
        }}>{username}</p>
      )}
      {/* "King of N Genres" — Exo 2 italic 800, white, 110px, drop shadow (below) */}
      {numberText && (
        <p style={{
          position: "absolute",
          left: 0,
          width: "100%",
          bottom: 550,
          margin: 0,
          textAlign: "center",
          fontFamily: exo2.fontFamily,
          fontWeight: 800,
          fontStyle: "italic",
          fontSize: 110,
          color: "#ffffff",
          textShadow: "4px 4px 18px rgba(0,0,0,0.85)",
          opacity: numAlpha,
        }}>{numberText}</p>
      )}
    </div>
  );
};

// Polka-dot overlay — a tiling dot pattern slowly sliding diagonally, multiplied over the background
const PolkaDotOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const PX_PER_SECOND = 15; // slow diagonal drift
  const offset = (frame / fps) * PX_PER_SECOND;
  // Two identical radial-gradient layers, one shifted half a tile → every other row offset by half
  const DOT = "rgba(0,0,0,0.375)";
  const TILE = 36;
  const HALF = TILE / 2;
  const R = 4;
  const FADE = 5;
  const gradient = `radial-gradient(circle at ${HALF}px ${HALF}px, ${DOT} ${R}px, transparent ${FADE}px)`;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `${gradient}, ${gradient}`,
        backgroundSize: `${TILE}px ${TILE}px, ${TILE}px ${TILE}px`,
        backgroundPosition: `${offset}px ${offset}px, ${offset + HALF}px ${offset + HALF}px`,
        mixBlendMode: "multiply",
        pointerEvents: "none" as const,
      }}
    />
  );
};

// Slide-lines overlay — static 3D-rotated plane with lines sliding in from the left
const SlideLinesOverlay: React.FC<{
  text: string;
  sceneDuration: number;
  colors: ColorScheme;
  fontConfig: FontConfig;
  fontSize: number;
  rotateZ: number;
  rotateX: number;
  perspective: number;
  y: number;
  textColor: string;
  textGlow: string;
  labels?: string[];
  offsetX?: number;
  duel?: boolean;
  tourney?: boolean;
  fixed?: boolean;
  frameSyncMedia?: boolean;
}> = ({ text, sceneDuration, colors, fontConfig, fontSize, rotateZ, rotateX, perspective, y, textColor, textGlow, labels, offsetX, duel, tourney, fixed, frameSyncMedia = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;

  const isStats = !duel && !tourney;
  const rowMultiplier = isStats ? 5.5 : fixed ? 6.0 : 4.0;

  // Phase 2 (fixed only): after slide-in settles, pan everything 100% left
  const slideInEnd = fixed ? Math.min(sceneDuration * 0.35, fps * 2.5) : 0;
  const panDuration = fixed ? Math.min(sceneDuration * 0.25, fps * 1.5) : 0;
  const panX = fixed
    ? interpolate(frame, [slideInEnd, slideInEnd + panDuration], [0, -1080], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  const rotateZSpring = spring({ frame, fps, config: { damping: 18, mass: 1.2 } });
  const animatedRotateZ = isStats ? rotateZ : tourney ? 0 : interpolate(rotateZSpring, [0, 1], [50, rotateZ]);

  const scrollY = (tourney && !fixed) ? interpolate(frame, [0, sceneDuration], [1920, -2400], { extrapolateRight: "clamp" }) : 0;
  const animatedRotateX = tourney ? 0 : rotateX;

  // Two layers separated by "\n". Pipe-separated items for normal/duel
  // and tourney (pipes preserve multi-word names). Older tourney scenes
  // stored names space-separated, so as a fallback split by whitespace
  // when no pipe is present. Fixed tourney adds a third line for toggle
  // state: "t1,t2" (0=left, 1=right).
  const maxLines = duel ? 1 : 3;
  const textParts = (text || "").split("\n");
  const [layer1Raw, layer2Raw = ""] = textParts;
  const tourneySplit = (raw: string) =>
    (raw.includes("|") ? raw.split("|") : raw.split(/\s+/))
      .map((s) => s.trim())
      .filter((s) => s);
  const lines = fixed
    ? layer1Raw.split("|").map((s) => s.trim()).filter((s) => s)
    : tourney
    ? tourneySplit(layer1Raw)
    : layer1Raw.split("|").map((s) => s.trim()).slice(0, maxLines);
  const lines2 = fixed
    ? layer2Raw.split("|").map((s) => s.trim()).filter((s) => s)
    : tourney
    ? tourneySplit(layer2Raw)
    : layer2Raw.split("|").map((s) => s.trim()).slice(0, maxLines);
  const toggleRaw = fixed ? (textParts[2] || "0,0").split(",") : [];
  const toggle1Right = toggleRaw[0] === "1";
  const toggle2Right = toggleRaw[1] === "1";
  const phase2L1 = fixed ? (toggle1Right ? (lines2[0] || "") : (lines[0] || "")) : (lines[0] || "");
  const phase2L2 = fixed ? (toggle2Right ? (lines2[1] || "") : (lines[1] || "")) : (lines2[0] || "");
  const LINE_STAGGER = 10; // frames between successive entrances (interleaved across layers)
  // Compress the animation timeline so all slide-ins finish 1s before the scene ends
  const slideFrame = sceneDuration > fps
    ? Math.min(frame * (sceneDuration / (sceneDuration - fps)), sceneDuration - fps)
    : frame;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 12,
        opacity: exit,
        pointerEvents: "none" as const,
        transform: panX !== 0 ? `translateX(${panX}px)` : undefined,
        willChange: fixed ? "transform" : undefined,
      }}
    >
      <div
        style={{
          // Shift the whole block 86px to the left of center (skip in tourney)
          transform: tourney ? "none" : `translateX(${offsetX ?? -86}px)`,
          ...(tourney ? { width: "100%", padding: "0 15%" } : {}),
        }}
      >
      <div
        style={{
          // Static 3D plane rotation (matches Video Cube angle)
          transform: tourney
            ? `translateY(${y + scrollY}px)`
            : `perspective(${perspective}px) rotateZ(${animatedRotateZ}deg) rotateX(${animatedRotateX}deg) translateY(${y + scrollY}px)`,
          position: "relative",
          padding: tourney ? 0 : "0 80px",
          // In duel mode, preserve 3D so per-layer rotateY composes with the parent rotateX
          ...(duel ? { transformStyle: "preserve-3d" as const } : {}),
        }}
      >
        {/* Layer 1: left-justified, slides in from the left */}
        <div style={{ textAlign: "left", position: "relative", zIndex: 1, ...(duel ? { transform: "rotateY(30deg)" } : {}) }}>
        {lines.map((line, li) => {
          // Interleave with layer 2: L1.i uses slot (i*2), L2.i uses slot (i*2 + 1)
          const lineSpring = spring({
            frame: slideFrame,
            fps,
            config: { damping: 14, mass: 0.8 },
            delay: (li * 2) * LINE_STAGGER,
          });
          // Slide in from the left: -1200px → 0
          const slideX = interpolate(lineSpring, [0, 1], [-1200, 0]);
          const opacity = interpolate(lineSpring, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          return (
            <p
              key={li}
              style={{
                fontSize: Math.round(fontSize * 0.6),
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight ?? 700,
                fontStyle: fontConfig.fontStyle ?? "normal",
                color: textColor,
                margin: 0,
                lineHeight: (fontConfig.lineHeight ?? 1.0) * rowMultiplier,
                letterSpacing: 8,
                textTransform: "uppercase",
                textShadow: textGlow,
                opacity,
                transform: `translateX(${slideX}px)`,
                willChange: "transform, opacity",
              }}
            >
              {line}
            </p>
          );
        })}
        </div>

        {/* Layer 3: static labels, half font size, sits 50px above layer 1 rows (0px in duel mode) */}
        <div style={{
          position: "absolute",
          top: duel ? 30 : tourney ? "calc(50% + 50px)" : -50,
          left: 0,
          right: 0,
          padding: tourney ? 0 : "0 80px",
          textAlign: "center",
          zIndex: 2,
          ...(isStats ? { width: 700 } : {}),
          ...(duel ? { transform: "translateX(5px) translateZ(400px)" } : {}),
          ...(tourney ? { transform: "translateY(-50%)" } : {}),
        }}>
        {(tourney
          ? Array.from({ length: lines.length }, () => "VS")
          : (labels ?? (duel ? ["Duel"] : ["Most Battles", "Most Wins", "Most Played Beats"])).slice(0, maxLines)
        ).map((label, li) => (
          <p
            key={li}
            style={{
              fontSize: Math.round(fontSize * (duel ? 0.165 : 0.33)),
              fontFamily: fontConfig.fontFamily,
              fontWeight: fontConfig.fontWeight ?? 700,
              fontStyle: fontConfig.fontStyle ?? "normal",
              color: colors.highlight,
              margin: 0,
              lineHeight: `${Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier)}px`,
              letterSpacing: 4,
              textTransform: "uppercase",
              textShadow: textGlow,
            }}
          >
            {label}
          </p>
        ))}
        </div>

        {/* Layer 2: right-justified, small black numbers, fades in interleaved with layer 1 */}
        <div style={{
          position: "absolute",
          top: duel ? 50 : tourney ? 80 : 85,
          left: 0,
          right: 0,
          padding: tourney ? 0 : "0 80px",
          textAlign: duel ? "center" : "right",
          transform: duel ? "rotateY(-30deg)" : tourney ? "none" : "translateX(50px)",
        }}>
        {lines2.map((line, li) => {
          const lineSpring = spring({
            frame: slideFrame,
            fps,
            config: { damping: 14, mass: 0.8 },
            delay: (li * 2 + 1) * LINE_STAGGER,
          });
          const opacity = interpolate(lineSpring, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          // In duel mode, slide in from the right: +1200px → 0
          const slideX = (duel || tourney) ? interpolate(lineSpring, [0, 1], [1200, 0]) : 0;
          return (
            <p
              key={li}
              style={{
                // Duel/Tourney mode: match layer 1's font size instead of the big 1.5x numeric style
                fontSize: Math.round(fontSize * (duel || tourney ? 0.6 : 1.5)),
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight ?? 700,
                fontStyle: fontConfig.fontStyle ?? "normal",
                color: "#000000",
                margin: 0,
                // Match layer 1 row height so the numbers sit on the same rows as the big lines
                lineHeight: `${Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier)}px`,
                letterSpacing: 4,
                textTransform: "uppercase",
                opacity,
                transform: `translateX(${slideX}px)`,
                willChange: "transform, opacity",
              }}
            >
              {line}
            </p>
          );
        })}
        </div>

        {/* Layer 4 (tourney only): firedash animated webp per line pair, plays once */}
        {tourney && (() => {
          const rowH = Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier);
          const fireCount = Math.max(lines.length, lines2.length);
          const fireDuration = 60;
          const hex = colors.highlight.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          let hue = 0;
          if (max !== min) {
            const d = max - min;
            hue = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60
              : max === g ? ((b - r) / d + 2) * 60
              : ((r - g) / d + 4) * 60;
          }
          const fireBaseHue = 20;
          const hueShift = hue - fireBaseHue;
          return Array.from({ length: fireCount }, (_, li) => {
            const triggerFrame = li * 2 * LINE_STAGGER;
            const elapsed = slideFrame - triggerFrame;
            const visible = elapsed >= 0 && elapsed < fireDuration;
            if (!visible) return null;
            const fireStyle: React.CSSProperties = {
              position: "absolute",
              left: "50%",
              top: `${50 + li * rowH}px`,
              transform: "translateX(-50%) scale(1.3)",
              height: rowH,
              objectFit: "contain",
              pointerEvents: "none",
              zIndex: -1,
              filter: `hue-rotate(${hueShift}deg)`,
            };
            if (frameSyncMedia && getRemotionEnvironment().isRendering) {
              // An animated webp in a plain <img> plays on wall clock, which
              // is meaningless during a server render (frames aren't captured
              // in real time) — the flames raced through the whole animation
              // in a couple of output frames. AnimatedImage decodes the webp
              // and shows the exact frame for the current timeline position.
              // slideFrame runs faster than the real clock (compressed so all
              // entrances finish 1s early), so convert the trigger back to
              // real frames for the Sequence start.
              const slideRate = sceneDuration > fps ? sceneDuration / (sceneDuration - fps) : 1;
              const realTrigger = Math.round(triggerFrame / slideRate);
              return (
                <Sequence key={`fire-${li}-${triggerFrame}`} from={realTrigger} layout="none">
                  <AnimatedImage
                    src={assetUrl(`firedash.webp?i=${li}`)}
                    loopBehavior="pause-after-finish"
                    style={fireStyle}
                  />
                </Sequence>
              );
            }
            return (
              <img
                key={`fire-${li}-${triggerFrame}`}
                src={assetUrl(`firedash.webp?i=${li}`)}
                style={fireStyle}
              />
            );
          });
        })()}

        {/* Layer 4 (stats only): horizontal gradient stripes behind each group */}
        {isStats && (() => {
          const rowH = Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * 5.5);
          const stripeTop = 192;
          const stripeH = rowH * 0.56;
          const stripeWidth = 1800;
          return (
            <div style={{
              position: "absolute",
              top: 0,
              left: -600,
              right: -600,
              bottom: -600,
              zIndex: -1,
            }}>
              {Array.from({ length: maxLines }, (_, li) => {
                const stripeSpring = spring({
                  frame: slideFrame,
                  fps,
                  config: { damping: 16, mass: 1.0 },
                  delay: li * LINE_STAGGER * 2,
                });
                const slideX = interpolate(stripeSpring, [0, 1], [-stripeWidth * 1.3, 300]);
                return (
                  <div
                    key={li}
                    style={{
                      position: "absolute",
                      top: stripeTop + li * rowH,
                      left: 0,
                      width: stripeWidth,
                      height: stripeH,
                      background: `linear-gradient(90deg, ${colors.light}cc, ${colors.highlight}cc)`,
                      borderRadius: 4,
                      transform: `translateX(${slideX}px)`,
                      willChange: "transform",
                    }}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>
      </div>

      {/* Phase 2 duplicate layers (fixed tourney only) — positioned 1080px right, shows first line only, no slide-in */}
      {fixed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            pointerEvents: "none" as const,
            transform: "translateX(1080px)",
          }}
        >
          <div style={{ width: "100%", padding: "0 15%" }}>
            <div style={{ position: "relative" }}>
              {/* Layer 1 duplicate — winner from toggle 1 */}
              <div style={{ textAlign: "left", position: "relative", zIndex: 1 }}>
                {phase2L1 && (
                  <p style={{
                    fontSize: Math.round(fontSize * 0.6),
                    fontFamily: fontConfig.fontFamily,
                    fontWeight: fontConfig.fontWeight ?? 700,
                    fontStyle: fontConfig.fontStyle ?? "normal",
                    color: textColor,
                    margin: 0,
                    lineHeight: (fontConfig.lineHeight ?? 1.0) * rowMultiplier,
                    letterSpacing: 8,
                    textTransform: "uppercase",
                    textShadow: textGlow,
                  }}>
                    {phase2L1}
                  </p>
                )}
              </div>

              {/* Layer 3 duplicate — first label only */}
              <div style={{
                position: "absolute",
                top: "calc(50% + 50px)",
                left: 0,
                right: 0,
                textAlign: "center",
                zIndex: 2,
                transform: "translateY(-50%)",
              }}>
                <p style={{
                  fontSize: Math.round(fontSize * 0.33),
                  fontFamily: fontConfig.fontFamily,
                  fontWeight: fontConfig.fontWeight ?? 700,
                  fontStyle: fontConfig.fontStyle ?? "normal",
                  color: colors.highlight,
                  margin: 0,
                  lineHeight: `${Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier)}px`,
                  letterSpacing: 4,
                  textTransform: "uppercase",
                  textShadow: textGlow,
                }}>
                  VS
                </p>
              </div>

              {/* Layer 2 duplicate — first line only */}
              <div style={{
                position: "absolute",
                top: 80,
                left: 0,
                right: 0,
                textAlign: "right",
                transform: "none",
              }}>
                {phase2L2 && (
                  <p style={{
                    fontSize: Math.round(fontSize * 0.6),
                    fontFamily: fontConfig.fontFamily,
                    fontWeight: fontConfig.fontWeight ?? 700,
                    fontStyle: fontConfig.fontStyle ?? "normal",
                    color: "#000000",
                    margin: 0,
                    lineHeight: `${Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier)}px`,
                    letterSpacing: 4,
                    textTransform: "uppercase",
                  }}>
                    {phase2L2}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {fixed && (() => {
        const forkSpring = spring({ frame, fps, config: { damping: 14, mass: 1.0 } });
        const forkOpacity = interpolate(forkSpring, [0, 0.4], [0, 0.6], { extrapolateRight: "clamp" });
        const rowH = Math.round(fontSize * 0.6) * ((fontConfig.lineHeight ?? 1.0) * rowMultiplier);
        const forkH = rowH * lines.length;
        const midY = forkH / 2;
        const topY = rowH * 0.5;
        const botY = forkH - rowH * 0.5;
        const midX = 540;
        const strokeW = 10;
        return (
          <div style={{
            position: "absolute",
            inset: 0,
            zIndex: -1,
            opacity: forkOpacity,
            pointerEvents: "none" as const,
          }}>
            <div style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: 1080,
              height: forkH,
              transform: `translateX(50%) translateY(calc(-50% + 55px))`,
            }}>
              <svg
                viewBox={`0 0 1080 ${forkH}`}
                width="1080"
                height={forkH}
                style={{ display: "block" }}
              >
                <path
                  d={`M 0,${topY} L ${midX - 20},${topY} Q ${midX},${topY} ${midX},${topY + 20} L ${midX},${midY}`}
                  fill="none"
                  stroke={colors.highlight}
                  strokeWidth={strokeW}
                />
                <path
                  d={`M 0,${botY} L ${midX - 20},${botY} Q ${midX},${botY} ${midX},${botY - 20} L ${midX},${midY}`}
                  fill="none"
                  stroke={colors.highlight}
                  strokeWidth={strokeW}
                />
                <line
                  x1={midX}
                  y1={midY}
                  x2={1080}
                  y2={midY}
                  stroke={colors.highlight}
                  strokeWidth={strokeW}
                />
              </svg>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

const Top10Overlay: React.FC<{
  text: string;
  sceneDuration: number;
  colors: ColorScheme;
  fontConfig: FontConfig;
  fontSize: number;
  textColor: string;
  textGlow: string;
}> = ({ text, sceneDuration, colors, fontConfig, fontSize, textColor, textGlow }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = (text || "").split("|").map((s) => s.trim());
  const lines: { username: string; points: string }[] = [];
  for (let j = 0; j < parts.length - 1; j += 2) {
    if (parts[j]) lines.push({ username: parts[j], points: parts[j + 1] || "" });
  }
  while (lines.length < 10) lines.push({ username: "", points: "" });
  const LINE_DELAY = 8;
  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", zIndex: 12, opacity: exit, pointerEvents: "none" as const }}>
      <div style={{ width: "85%", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          fontSize: fontSize * 2.5,
          fontFamily: fontConfig.fontFamily,
          fontWeight: fontConfig.fontWeight ?? 700,
          color: colors.highlight,
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: 8,
          marginBottom: 16,
          textShadow: textGlow,
        }}>
          TOP TEN
        </div>
        {lines.map((entry, li) => {
          const { username, points } = entry;
          const rank = li + 1;
          const lineSpring = spring({
            frame,
            fps,
            config: { damping: 14, mass: 0.8 },
            delay: li * LINE_DELAY,
          });
          const slideX = interpolate(lineSpring, [0, 1], [-800, 0]);
          const opacity = interpolate(lineSpring, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={li}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "8px 20px",
                borderRadius: 6,
                background: li % 2 === 0 ? `${colors.dark}40` : "transparent",
                transform: `translateX(${slideX}px)`,
                opacity,
                willChange: "transform, opacity",
              }}
            >
              <span style={{
                fontSize: fontSize * 1.2,
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight ?? 700,
                color: colors.highlight,
                minWidth: 60,
                textAlign: "right",
                textShadow: textGlow,
              }}>
                {username ? `#${rank}` : ""}
              </span>
              <span style={{
                fontSize,
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight ?? 700,
                color: textColor,
                flex: 1,
                textTransform: "uppercase",
                letterSpacing: 2,
                textShadow: textGlow,
              }}>
                {username}
              </span>
              <span style={{
                fontSize: fontSize * 0.8,
                fontFamily: fontConfig.fontFamily,
                fontWeight: fontConfig.fontWeight ?? 700,
                color: colors.light,
                textShadow: textGlow,
              }}>
                {points}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const SceneCard: React.FC<{ text: string; subtitle?: string; text2?: string; text3?: string; index: number; layoutIndex: number; colors: ColorScheme; fontConfig: FontConfig; secondaryFontConfig?: FontConfig; fontSize?: number; y?: number; x?: number; rotateZ?: number; rotateX?: number; perspective?: number; backgroundVideo?: Scene["backgroundVideo"]; sceneDuration?: number; overlayVideo?: string; portrait?: string; frameSyncMedia?: boolean }> = ({
  text,
  subtitle,
  text2,
  text3,
  index,
  layoutIndex,
  colors,
  fontConfig,
  secondaryFontConfig,
  fontSize = 150,
  y: yOffset = 0,
  x: xOffset = 0,
  rotateZ: rZ,
  rotateX: rX,
  perspective: persp,
  backgroundVideo: backgroundVideoProp,
  sceneDuration: dur = SCENE_DURATION,
  overlayVideo = "none",
  portrait,
  frameSyncMedia = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const resolvedLayout = SCENE_LAYOUTS[layoutIndex % SCENE_LAYOUTS.length];
  const td = resolvedLayout.textDefaults;
  // Merge scene-level backgroundVideo over layout default so partial overrides
  // (e.g. toggling `muted` only) don't wipe out the layout's `src`.
  const backgroundVideo = resolvedLayout.backgroundVideo || backgroundVideoProp
    ? { ...(resolvedLayout.backgroundVideo ?? {}), ...(backgroundVideoProp ?? {}) } as Scene["backgroundVideo"]
    : undefined;
  // If the scene-level override has an empty src, fall back to the layout default src
  if (backgroundVideo && !backgroundVideo.src && resolvedLayout.backgroundVideo?.src) {
    backgroundVideo.src = resolvedLayout.backgroundVideo.src;
  }
  // Loop length for loopVideo layouts, measured only during frame-synced
  // renders (null src keeps the hook inert otherwise).
  const loopVideoSrc =
    frameSyncMedia && getRemotionEnvironment().isRendering && resolvedLayout.loopVideo && backgroundVideo?.src
      ? assetUrl(backgroundVideo.src)
      : null;
  const loopVideoFrames = useLoopedVideoFrames(loopVideoSrc, fps);
  const resolvedFontSize = fontSize ?? td?.fontSize ?? 150;
  const resolvedX = xOffset || td?.x || 0;
  const resolvedY = yOffset || td?.y || 0;

  // Delay text entrance if belt stomp is present (wait for belt to land)
  const textDelay = resolvedLayout.beltStomp ? (resolvedLayout.spotlight ? fps + 25 : 25) : 0;
  const textFrame = Math.max(0, frame - textDelay);
  const enter = spring({ frame: textFrame, fps, config: { damping: 200 } });
  const exitStart = dur - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, dur], [1, 0], { extrapolateRight: "clamp" }) : 1;
  const opacity = enter * exit;
  const y = interpolate(enter, [0, 1], [40, 0]) + resolvedY;

  // Scene style — use customStyle from layout if available, otherwise cycle variants
  const custom = resolvedLayout.customStyle?.(colors);
  const variant = layoutIndex % 4;
  let background: string;
  let textColor: string;
  let textGlow = "0 4px 20px rgba(0,0,0,0.7)";

  if (custom) {
    background = custom.background;
    textColor = custom.textColor;
    if (custom.textGlow) textGlow = custom.textGlow;
  } else {
    switch (variant) {
      case 0:
        background = `linear-gradient(135deg, ${colors.dark}, #000000)`;
        textColor = colors.highlight;
        break;
      case 1:
        background = `linear-gradient(135deg, ${colors.dark}, ${colors.light}, ${colors.highlight})`;
        textColor = "#000000";
        textGlow = `0 0 30px color-mix(in srgb, ${colors.light} 60%, transparent)`;
        break;
      case 2:
        background = `linear-gradient(135deg, ${colors.light}, #ffffff)`;
        textColor = colors.dark;
        textGlow = `0 0 30px color-mix(in srgb, ${colors.light} 60%, transparent)`;
        break;
      case 3:
      default:
        background = `linear-gradient(135deg, #000000, ${colors.dark})`;
        textColor = "#ffffff";
        break;
    }
  }

  const pan = resolvedLayout.backgroundPan;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        // Same rule as TitleCard: a backgroundPan image moves the computed
        // gradient to a translucent overlay below it. No pan set → the
        // gradient stays opaque exactly as before.
        background: pan ? "#000000" : background,
      }}
    >
      {pan && <ArenaPanLayer src={pan.src} direction={pan.direction} sceneDuration={dur} />}
      {pan && <AbsoluteFill style={{ background, opacity: 0.6 }} />}

      {/* Background video layer — rendered before SlideInGraphic (below
          it in the stack), same as the pan/image layer above. Gate on
          .src specifically, not just the object's truthiness — { src: "",
          muted } is the normal "no video" shape left behind once a blob:
          URL gets stripped on save (see Editor.tsx's prop-persist effect),
          and an empty src here used to make <Video>/<video> try to load
          the bare CDN root as a video on every single frame, which is
          just slow enough per-frame to make the whole render crawl (and
          likely caused the "Failed to fetch" reports on Battle of the
          Week, which carries this exact shape). */}
      {backgroundVideo?.src && (
        <AbsoluteFill
          style={{
            overflow: "hidden",
            mixBlendMode: (backgroundVideo.blendMode as React.CSSProperties["mixBlendMode"]) ?? "normal",
            display: resolvedLayout.videoFit === "contain" ? "flex" : undefined,
            justifyContent: resolvedLayout.videoFit === "contain" ? "center" : undefined,
            alignItems: resolvedLayout.videoFit === "contain" ? "center" : undefined,
          }}
        >
          {resolvedLayout.loopVideo ? (
            frameSyncMedia && getRemotionEnvironment().isRendering ? (
              loopVideoFrames != null && (
                <Loop durationInFrames={loopVideoFrames} layout="none">
                  <Video
                    src={assetUrl(backgroundVideo.src)}
                    muted
                    style={
                      resolvedLayout.videoFit === "contain"
                        ? {
                            height: "100%",
                            width: "auto",
                            transform: `scale(${backgroundVideo.scale ?? 1})`,
                          }
                        : {
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            transform: `scale(${backgroundVideo.scale ?? 1})`,
                          }
                    }
                  />
                </Loop>
              )
            ) : (
              <video
                src={assetUrl(backgroundVideo.src)}
                autoPlay
                loop
                muted
                playsInline
                style={
                  resolvedLayout.videoFit === "contain"
                    ? {
                        height: "100%",
                        width: "auto",
                        transform: `scale(${backgroundVideo.scale ?? 1})`,
                      }
                    : {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        transform: `scale(${backgroundVideo.scale ?? 1})`,
                      }
                }
              />
            )
          ) : (
            <Video
              src={assetUrl(backgroundVideo.src)}
              muted={backgroundVideo.muted !== false}
              volume={resolvedLayout.battleOverlay
                ? interpolate(frame, [0, fps * 2], [0, 1], { extrapolateRight: "clamp" })
                : 1}
              startFrom={backgroundVideo.startFrom ?? 0}
              style={
                resolvedLayout.videoFit === "contain"
                  ? {
                      height: "100%",
                      width: "auto",
                      transform: `scale(${backgroundVideo.scale ?? 1})`,
                    }
                  : {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: `scale(${backgroundVideo.scale ?? 1})`,
                    }
              }
            />
          )}
          {backgroundVideo.blendMode === "normal" && (
            <div style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "50%",
              background: `linear-gradient(to top, ${colors.dark}, transparent)`,
              pointerEvents: "none" as const,
            }} />
          )}
        </AbsoluteFill>
      )}

      {resolvedLayout.slideInGraphic && (
        <SlideInGraphic
          bottomPct={resolvedLayout.slideInGraphic.bottomPct}
          stopAtLeftPx={resolvedLayout.slideInGraphic.stopAtLeftPx}
          highlightColor={colors.highlight}
        />
      )}

      {/* Polka-dot multiply overlay — sits over the gradient/grunge background */}
      {resolvedLayout.polkaDotOverlay && <PolkaDotOverlay />}

      {/* Sound waveform for scroll-mode scenes — behind characters. Uses
          highlight (not light) so it stays visible with mixBlendMode:
          "screen" against a light-focused background — light-on-light
          washed out to invisible once Scene4 switched to a light gradient. */}
      {td?.mode === "scroll" && <SoundWaveform color={colors.highlight} />}

      {/* Static background image layer (e.g. arena) */}
      {resolvedLayout.backgroundImageStatic && (
        <>
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <Img
              src={resolvedLayout.backgroundImageStatic.src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: resolvedLayout.backgroundImageStatic.filter,
              }}
            />
          </AbsoluteFill>
          <AbsoluteFill style={{ background: `${colors.dark}80` }} />
        </>
      )}

      {/* Spotlight cones */}
      {resolvedLayout.spotlight && (() => {
        const baseDelay = Math.round(fps * 0.5);
        const duration = fps;
        const ease = (delayMs: number) => {
          const d = baseDelay + Math.round(delayMs / 1000 * fps);
          const p = frame <= d ? 0 : frame >= d + duration ? 1 : (frame - d) / duration;
          return 1 - Math.pow(1 - p, 3);
        };
        const r1 = 10 + ease(0) * (-60 - 10);
        const r2 = 15 + ease(20) * (-30 - 15);
        const r3 = -10 + ease(20) * (55 - -10);
        const r4 = -20 + ease(30) * (38 - -20);
        const coneStyle: React.CSSProperties = {
          position: "absolute",
          top: "-5vh",
          left: "-2vw",
          width: "300vmax",
          height: "300vmax",
          transformOrigin: "center",
          background: "conic-gradient(from 170deg, transparent 0deg, rgba(255,255,255,0.4) 3deg, rgba(255,255,255,0.7) 10deg, rgba(255,255,255,0.4) 17deg, transparent 20deg)",
          maskImage: "radial-gradient(circle, white 0%, transparent 50%)",
          WebkitMaskImage: "radial-gradient(circle, white 0%, transparent 50%)",
          pointerEvents: "none",
        };
        const coneStyleR: React.CSSProperties = { ...coneStyle, left: "auto", right: "-2vw" };
        return (
          <>
            <div style={{ ...coneStyle, transform: `translate(-50%, -50%) rotate(${r1}deg)` }} />
            <div style={{ ...coneStyle, transform: `translate(-50%, -50%) rotate(${r2}deg)` }} />
            <div style={{ ...coneStyleR, transform: `translate(50%, -50%) rotate(${r3}deg)` }} />
            <div style={{ ...coneStyleR, transform: `translate(50%, -50%) rotate(${r4}deg)` }} />
          </>
        );
      })()}

      {/* Background image layer (e.g. brackets) */}
      {resolvedLayout.backgroundImageSrc && (
        <BracketsLayer src={resolvedLayout.backgroundImageSrc} sceneDuration={dur} />
      )}

      {/* Winner content group: belt, rays, banner, text — shifted down */}
      {resolvedLayout.spotlight && (() => {
        const winnerShift = "80vh";
        return (
          <div style={{ position: "absolute", inset: 0, top: winnerShift, pointerEvents: "none" }}>
            {resolvedLayout.beltStomp && (
              <div style={{ position: "relative", top: 100, width: "100%", height: "100%", zIndex: 2 }}>
                <BeltStompLayer src={resolvedLayout.beltStomp.src} sceneDuration={dur} delayFrames={fps} />
              </div>
            )}

            {/* Sequenced layers: boxes → text → portrait → rays */}
            {(() => {
              const spotlightsEnd = Math.round(1.5 * fps);
              const step = Math.round(0.1 * fps) || 1;
              const boxesStart = spotlightsEnd;
              const boxesDone = boxesStart + step * 7;
              const textStart = boxesDone + Math.round(0.05 * fps);
              const lineDelay = Math.round(0.3 * fps);
              const slideDur = Math.round(0.4 * fps);
              const textDone = textStart + lineDelay * 2 + slideDur;
              const portraitStart = textDone;
              const portraitFadeDur = Math.round(0.5 * fps);
              const portraitDone = portraitStart + portraitFadeDur;
              const raysStart = portraitDone;
              const raysDuration = Math.round(1.2 * fps);

              const hx = colors.highlight.replace("#", "");
              const rr = parseInt(hx.substring(0, 2), 16) / 255;
              const gg = parseInt(hx.substring(2, 4), 16) / 255;
              const bb = parseInt(hx.substring(4, 6), 16) / 255;
              const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
              let hue = 0;
              if (max !== min) {
                const d = max - min;
                hue = max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60
                     : max === gg ? ((bb - rr) / d + 2) * 60
                     : ((rr - gg) / d + 4) * 60;
              }
              const hueShift = hue - 40;

              return (
                <>
                  {/* Rays — behind portrait (zIndex 0) */}
                  {resolvedLayout.spotlight && (() => {
                    const show = frame >= raysStart && frame < raysStart + raysDuration;
                    return show ? (
                      <div style={{
                        position: "absolute",
                        inset: 0,
                        top: 80,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        zIndex: 0,
                        pointerEvents: "none",
                      }}>
                        <Img
                          src={assetUrl("rays.webp")}
                          style={{
                            width: "300%",
                            height: "300%",
                            objectFit: "cover",
                            filter: `hue-rotate(${hueShift}deg)`,
                          }}
                        />
                      </div>
                    ) : null;
                  })()}

                  {/* Portrait — after text (zIndex 1) */}
                  {portrait && (() => {
                    if (frame < portraitStart) return null;
                    const p = Math.min((frame - portraitStart) / portraitFadeDur, 1);
                    return (
                      <div style={{ position: "absolute", left: 0, right: 0, top: "-80vh", bottom: "calc(50% - 100px)", display: "flex", justifyContent: "center", alignItems: "flex-end", zIndex: 1, pointerEvents: "none", opacity: p, overflow: "hidden" }}>
                        <Img src={assetUrl(`picker/Portraits/${portrait}`)} style={{ height: "100%", width: "auto", objectFit: "contain" }} />
                      </div>
                    );
                  })()}

                  {/* Boxes — right after spotlights (zIndex 10) */}
                  {resolvedLayout.spotlight && (() => {
                    if (frame < boxesStart) return null;
                    const f = frame - boxesStart;
                    const showOrange = f < step;
                    const showWhite = f >= step && f < step * 2;
                    const showLogoBig = f >= step * 2 && f < step * 3;
                    const showLogoNormal = f >= step * 3 && f < step * 4;
                    const showLogoStay = f >= step * 5;
                    const showBlack = f >= step * 6;
                    const moveStart = step * 5;
                    const logoY = f >= moveStart ? -10 : 0;
                    const centerStyle: React.CSSProperties = {
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                    };
                    return (
                      <div style={{ position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none" }}>
                        {showOrange && (
                          <svg viewBox="0 0 482 256" style={{ ...centerStyle, width: "70%", height: "auto" }}>
                            <path fillRule="evenodd" fill={colors.highlight} d="M0.386,68.358 L481.787,0.702 L481.787,187.763 L0.386,255.419 Z" />
                          </svg>
                        )}
                        {showWhite && (
                          <svg viewBox="0 0 482 117" style={{ ...centerStyle, width: "70%", height: "auto" }}>
                            <path fillRule="evenodd" fill="rgb(255, 255, 255)" d="M0.386,68.358 L481.787,0.702 L481.787,48.763 L0.386,116.419 Z" />
                          </svg>
                        )}
                        {showLogoBig && (
                          <Img src={assetUrl("Audeobox_text.png")} style={{ ...centerStyle, width: "39%", height: "auto" }} />
                        )}
                        {showLogoNormal && (
                          <Img src={assetUrl("Audeobox_text.png")} style={{ ...centerStyle, width: "30%", height: "auto" }} />
                        )}
                        {showBlack && (
                          <svg viewBox="0 0 482 320" style={{ ...centerStyle, width: "70%", height: "auto", top: "calc(50% + 5vh)" }}>
                            <path fillRule="evenodd" fill="rgb(8, 8, 8)" opacity="0.949" d="M0.386,68.358 L481.787,0.702 L481.787,251.763 L0.386,319.419 Z" />
                          </svg>
                        )}
                        {showLogoStay && (
                          <Img src={assetUrl("Audeobox_text.png")} style={{ ...centerStyle, width: "30%", height: "auto", top: `calc(50% + ${logoY}vh)` }} />
                        )}
                      </div>
                    );
                  })()}

                  {/* Text — after boxes (zIndex 12) */}
                  {resolvedLayout.textBlock && (() => {
                    if (frame < textStart) return null;
                    const tf = frame - textStart;
                    const lines = (text || "").split("\n");
                    const sizeScale = [1, 1.3, 0.5];
                    const a = { z: rZ ?? td?.rotateZ ?? 0, x: rX ?? td?.rotateX ?? 0 };

                    const lineStyles = lines.map((_, li) => {
                      const ld = li * lineDelay;
                      const p = tf <= ld ? 0 : tf >= ld + slideDur ? 1 : (tf - ld) / slideDur;
                      const ease = 1 - Math.pow(1 - p, 3);

                      if (li === 0) {
                        return { opacity: ease, transform: `translateX(${(1 - ease) * -60}%)`, textShadow: textGlow };
                      } else if (li === 1) {
                        return { opacity: ease, transform: `translateX(${(1 - ease) * 60}%)`, textShadow: textGlow };
                      } else {
                        const flicker = ease < 0.3 ? (Math.sin(tf * 2) > 0 ? 0.3 : 0.8) : 1;
                        return {
                          opacity: ease * flicker,
                          transform: "translateX(0)",
                          textShadow: textGlow,
                        };
                      }
                    });

              return (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    opacity: exit,
                    transform: `rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${resolvedY}px)`,
                    textAlign: "center",
                    width: "100%",
                    zIndex: 12,
                    pointerEvents: "none",
                  }}
                >
                  <div style={{ width: "90%", overflow: "hidden" }}>
                    {lines.map((line, li) => (
                      <p
                        key={li}
                        style={{
                          fontSize: resolvedFontSize * (sizeScale[li] ?? 1),
                          fontFamily: fontConfig.fontFamily,
                          fontWeight: fontConfig.fontWeight ?? 700,
                          fontStyle: fontConfig.fontStyle ?? "normal",
                          color: textColor,
                          margin: 0,
                          marginTop: li === 0 ? "10vh" : "-0.2em",
                          lineHeight: 1.1,
                          letterSpacing: 8,
                          textTransform: "uppercase",
                          textShadow: lineStyles[li]?.textShadow ?? textGlow,
                          opacity: lineStyles[li]?.opacity ?? 0,
                          transform: lineStyles[li]?.transform ?? "",
                        }}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })()}
                </>
              );
            })()}
          </div>
        );
      })()}

      {/* Belt stomp layer (non-spotlight scenes) */}
      {resolvedLayout.beltStomp && !resolvedLayout.spotlight && (
        <BeltStompLayer src={resolvedLayout.beltStomp.src} sceneDuration={dur} delayFrames={0} />
      )}

      {/* Character layer */}
      <CharacterLayer layoutIndex={layoutIndex} sceneDuration={dur} darkColor={colors.dark} />

      {/* Battle of the Week overlay */}
      {resolvedLayout.battleOverlay && (
        <BattleOverlay text={text} sceneDuration={dur} slide={resolvedLayout.battleSlide ?? 0} colors={colors} />
      )}

      {/* Weekly Title overlay — date range text */}
      {resolvedLayout.weeklyTitle && (
        <WeeklyTitleOverlay text={text} sceneDuration={dur} />
      )}

      {/* Centered hexagon + expanding ripple (Weekly Title 2) */}
      {resolvedLayout.hexRipple && (
        <HexRippleOverlay
          colors={colors}
          sceneDuration={dur}
          text2={text2}
          text3={text3}
          fontConfig={fontConfig}
          secondaryFontConfig={secondaryFontConfig}
          fontSize={resolvedFontSize}
        />
      )}

      {/* Killstreak overlay — number + username */}
      {resolvedLayout.killstreakOverlay && (
        <KillstreakOverlay text={text} sceneDuration={dur} />
      )}

      {/* King overlay — username + "King of N Genres" */}
      {resolvedLayout.kingOverlay && (
        <KingOverlay text={text} sceneDuration={dur} />
      )}

      {/* Slide-lines overlay — static 3D plane with lines sliding in from left */}
      {resolvedLayout.slideLinesOverlay && (
        <SlideLinesOverlay
          text={text}
          sceneDuration={dur}
          colors={colors}
          fontConfig={fontConfig}
          fontSize={resolvedFontSize}
          rotateZ={rZ ?? td?.rotateZ ?? 0}
          rotateX={rX ?? td?.rotateX ?? 0}
          perspective={persp ?? td?.perspective ?? 800}
          y={resolvedY}
          textColor={textColor}
          textGlow={textGlow}
          labels={resolvedLayout.slideLinesLabels}
          offsetX={resolvedLayout.slideLinesOffsetX}
          duel={resolvedLayout.slideLinesDuel}
          tourney={resolvedLayout.slideLinesTourney}
          fixed={resolvedLayout.slideLinesFixed}
          frameSyncMedia={frameSyncMedia}
        />
      )}

      {resolvedLayout.top10 && (
        <Top10Overlay
          text={text}
          sceneDuration={dur}
          colors={colors}
          fontConfig={fontConfig}
          fontSize={resolvedFontSize}
          textColor={textColor}
          textGlow={textGlow}
        />
      )}

      {/* Text overlay (skip for overlay scenes) */}
      {!resolvedLayout.battleOverlay && !resolvedLayout.weeklyTitle && !resolvedLayout.killstreakOverlay && !resolvedLayout.kingOverlay && !resolvedLayout.slideLinesOverlay && !resolvedLayout.top10 && (() => {
        const textMode: TextMode = td?.mode ?? "normal";
        const isFlat = textMode === "flat";
        const isScroll = textMode === "scroll";
        const a = { z: rZ ?? td?.rotateZ ?? 0, x: rX ?? td?.rotateX ?? 0 };
        const perspectiveVal = isFlat ? 0 : (persp ?? td?.perspective ?? 400);

        if (resolvedLayout.textBlock) {
          if (resolvedLayout.spotlight) return null;
          const blockOpacity = interpolate(enter, [0, 1], [0, 1], { extrapolateRight: "clamp" });
          const lines = (text || "").split("\n");
          const sizeScale = [1, 1.3, 0.5];
          return (
            <div
              style={{
                opacity: exit,
                transform: `rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${resolvedY}px)`,
                textAlign: "center",
                width: "90%",
                zIndex: 12,
              }}
            >
              {lines.map((line, li) => (
                <p
                  key={li}
                  style={{
                    fontSize: resolvedFontSize * (sizeScale[li] ?? 1),
                    fontFamily: fontConfig.fontFamily,
                    fontWeight: fontConfig.fontWeight ?? 700,
                    fontStyle: fontConfig.fontStyle ?? "normal",
                    color: textColor,
                    margin: 0,
                    marginTop: li === 0 ? "10vh" : "-0.2em",
                    lineHeight: 1.1,
                    letterSpacing: 8,
                    textTransform: "uppercase",
                    textShadow: textGlow,
                    opacity: blockOpacity,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          );
        }

        if (textMode === "lineSlide") {
          // Text is NOT split into one-word-per-line here — it wraps
          // normally inside the 80%-width box. Only \n in the source text
          // creates a new line; each line slides in from the right with a
          // per-line stagger, independent of the word-by-word reveal used
          // by every other mode.
          const rawLines = (text || "").split("\n");
          const lineDelayFrames = 8;
          const slideFrames = 20;
          // Lock the block's vertical CENTER (not its top edge) to the
          // slide-in stripe's center — translateY(-50%) shifts by half of
          // the box's own (content-dependent) height, so however many
          // lines render, the middle line of text always lands on the
          // stripe's middle. Falls back to screen-center if this layout
          // has no stripe.
          const stripeBottomPct = resolvedLayout.slideInGraphic?.bottomPct;
          const anchorTopPx = stripeBottomPct != null
            ? CANVAS_HEIGHT * (1 - stripeBottomPct / 100) - STRIPE_HEIGHT_PX / 2
            : CANVAS_HEIGHT / 2;
          // Bottom edge of the stripe (or, with no stripe, half a stripe-
          // height below the fallback center) — secondaryCaption sits a
          // fixed gap below this.
          const stripeBottomEdgePx = anchorTopPx + STRIPE_HEIGHT_PX / 2;
          return (
            <>
              <div
                style={{
                  position: "absolute",
                  left: "10%",
                  width: "80%",
                  top: `${anchorTopPx}px`,
                  transform: `translateY(calc(-50% + ${y}px)) translateX(${resolvedX}px)`,
                  textAlign: "right",
                  opacity: exit,
                  zIndex: 12,
                }}
              >
                {rawLines.map((line, li) => {
                  const lineFrame = Math.max(0, frame - li * lineDelayFrames);
                  const progress = Math.min(lineFrame / slideFrames, 1);
                  const eased = 1 - (1 - progress) * (1 - progress);
                  const slideX = (1 - eased) * 600;
                  const lineOpacity = interpolate(progress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
                  return (
                    <p
                      key={li}
                      style={{
                        fontSize: resolvedFontSize,
                        fontFamily: fontConfig.fontFamily,
                        fontWeight: fontConfig.fontWeight ?? 700,
                        fontStyle: fontConfig.fontStyle ?? "normal",
                        color: textColor,
                        margin: 0,
                        lineHeight: fontConfig.lineHeight ?? 1.1,
                        textTransform: "uppercase",
                        textShadow: textGlow,
                        opacity: lineOpacity,
                        transform: `translateX(${slideX}px)`,
                      }}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>
              {resolvedLayout.subtitleEnabled && subtitle && (() => {
                const subFont = secondaryFontConfig ?? fontConfig;
                return (
                  <div
                    style={{
                      position: "absolute",
                      top: `${stripeBottomEdgePx + 160}px`,
                      // % of the composition frame, not vw/vh — those units
                      // resolve against the real browser viewport, which in
                      // the editor's <Player> preview is NOT the same as the
                      // 1080x1920 composition canvas (only coincidentally
                      // matches during a server-side renderStill, where the
                      // headless viewport is set to the composition size).
                      left: "15%",
                      width: "70%",
                      textAlign: "center",
                      opacity: enter * exit,
                      zIndex: 12,
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        // 50pt smaller than the main caption text, but still
                        // tracks the scene's fontSize input since it's
                        // computed FROM resolvedFontSize, not a literal.
                        fontSize: resolvedFontSize - 50,
                        fontFamily: subFont.fontFamily,
                        fontWeight: subFont.fontWeight ?? 700,
                        fontStyle: subFont.fontStyle ?? "normal",
                        // colorScheme.dark, hue rotated -36deg (10% of
                        // 360deg) and slightly brighter (+10% lightness).
                        color: shiftHue(colors.dark, -36, 10),
                        lineHeight: subFont.lineHeight ?? 1.1,
                        textTransform: "uppercase",
                        // Fixed, independent of textGlow — the main
                        // caption's shadow (textGlow, set per-scene via
                        // customStyle) is tuned separately and shouldn't
                        // drag this along with it.
                        textShadow: "5px 5px 2px rgba(0,0,0,0.85)",
                      }}
                    >
                      {subtitle}
                    </p>
                  </div>
                );
              })()}
            </>
          );
        }

        if (textMode === "marquee") {
          // Single continuous line, scrolling right-to-left across the
          // whole scene duration. No word-by-word reveal, no "shift up to
          // keep newest word visible" — the entire string is always fully
          // rendered, just panning across the frame.
          const marqueeText = (text || "").replace(/\n/g, " ");
          // Generous off-screen overshoot on both ends — we don't measure
          // the rendered text width, so this just needs to comfortably
          // clear the canvas for any reasonably-sized scene text.
          const marqueeX = interpolate(frame, [0, dur], [CANVAS_WIDTH + 100, -4000]);
          return (
            <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 12 }}>
              <p
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  margin: 0,
                  whiteSpace: "nowrap",
                  fontSize: resolvedFontSize,
                  fontFamily: fontConfig.fontFamily,
                  fontWeight: fontConfig.fontWeight ?? 700,
                  fontStyle: fontConfig.fontStyle ?? "normal",
                  color: textColor,
                  lineHeight: fontConfig.lineHeight ?? 1.0,
                  letterSpacing: 8,
                  textTransform: "uppercase",
                  textShadow: textGlow,
                  opacity: exit,
                  transform: `translateY(calc(-50% + ${resolvedY}px)) translateX(${marqueeX}px)`,
                }}
              >
                {marqueeText}
              </p>
            </div>
          );
        }

        const words = text.split(" ");
        const totalWords = words.length;
        const revealWindow = dur - 50;
        const lineHeight = resolvedFontSize * 1.1;

        // Batch springs: compute a fixed number of keyframe springs and lerp per word
        const SPRING_KEYS = Math.min(totalWords, 6);
        const keySprings = Array.from({ length: SPRING_KEYS }, (_, ki) => {
          const keyDelay = SPRING_KEYS > 1 ? (ki / (SPRING_KEYS - 1)) * revealWindow * 0.6 : 0;
          return spring({ frame, fps, config: { damping: 14, mass: 0.6 }, delay: keyDelay });
        });
        const wordSprings = words.map((_, wi) => {
          if (totalWords <= 1) return keySprings[0];
          const t = (wi / (totalWords - 1)) * (SPRING_KEYS - 1);
          const lo = Math.floor(t);
          const hi = Math.min(lo + 1, SPRING_KEYS - 1);
          const frac = t - lo;
          return keySprings[lo] * (1 - frac) + keySprings[hi] * frac;
        });

        // Shift container up so the newest word stays at screen center
        const visibleProgress = wordSprings.reduce((sum, s) => sum + s, 0);
        // Scroll mode: linear scroll from bottom to top
        const scrollOffset = isScroll
          ? interpolate(frame, [0, dur], [500, -totalWords * lineHeight * 0.6])
          : 0;
        const shiftUp = isFlat ? 0 : isScroll ? -scrollOffset : Math.max(0, visibleProgress - 1) * lineHeight;
        // Left-aligned word stacks anchor to an explicit screen-edge offset
        // instead of the default shrink-to-fit-then-center layout (which
        // sizes the container to the widest word and centers THAT on
        // screen — "left align" within it wouldn't reach the actual edge).
        const isLeftAligned = td?.align === "left";

        return (
          <div
            style={
              isLeftAligned
                ? {
                    position: "absolute",
                    left: `${td?.leftAnchorPx ?? 30}px`,
                    opacity: isScroll ? 1 : exit,
                    transform: isFlat
                      ? `rotateZ(${a.z}deg) rotateX(${a.x}deg) translateY(${resolvedY}px)`
                      : `perspective(${perspectiveVal}px) rotateZ(${a.z}deg) rotateX(${a.x}deg) translateY(${y}px)`,
                    textAlign: "left",
                    zIndex: 12,
                  }
                : {
                    opacity: isScroll ? 1 : exit,
                    transform: isFlat
                      ? `rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${resolvedY}px)`
                      : `perspective(${perspectiveVal}px) rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${y}px)`,
                    textAlign: td?.align ?? "center",
                    padding: "0 80px",
                    zIndex: 12,
                  }
            }
          >
            <div
              style={{
                transform: `translateY(${-shiftUp}px)`,
              }}
            >
            {words.map((word, wi) => {
              const wordY = (isFlat || isScroll) ? 0 : interpolate(wordSprings[wi], [0, 1], [30, 0]);
              const wordOpacity = isFlat
                ? interpolate(wordSprings[wi], [0, 0.5], [0, 1], { extrapolateRight: "clamp" })
                : isScroll ? enter : wordSprings[wi];
              return (
                <p
                  key={wi}
                  style={{
                    fontSize: resolvedFontSize,
                    fontFamily: fontConfig.fontFamily,
                    fontWeight: fontConfig.fontWeight ?? 700,
                    fontStyle: fontConfig.fontStyle ?? "normal",
                    color: textColor,
                    margin: 0,
                    lineHeight: fontConfig.lineHeight ?? 1.0,
                    letterSpacing: 8,
                    textTransform: "uppercase",
                    textShadow: textGlow,
                    mixBlendMode: custom ? "normal" : (variant === 1 || variant === 2 ? "overlay" : "screen"),
                    opacity: wordOpacity,
                    transform: isFlat ? "none" : `translateY(${wordY}px)`,
                  }}
                >
                  {word}
                </p>
              );
            })}
            </div>
          </div>
        );
      })()}
    </AbsoluteFill>
  );
};

export const PRIZE_LOGOS = [
  "Apogee.png", "Arturia.png", "Baby Audio.png", "ImageLine.png",
  "Landr.png", "Maor Appelbaum Mastering.png", "McDSP.png", "Melda.png",
  "Native Insturments.png", "Splice.png", "UnitedPlugins.png", "WA.png",
  "XLN Audio.png", "iZotope.png", "Safari Audio.png",
];

const PrizesCard: React.FC<{ colorScheme: VideoProps["colorScheme"]; sceneDuration: number; text?: string }> = ({ colorScheme, sceneDuration, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = colorScheme;
  const custom = SCENE_LAYOUTS.find((l) => l.prizesGrid)?.customStyle?.(colors);

  // Filter to selected logos; if none stored, show all
  const selected = text?.trim()
    ? text.split(",").map((s) => s.trim()).filter((s) => PRIZE_LOGOS.includes(s))
    : PRIZE_LOGOS;
  const logos = selected.length > 0 ? selected : PRIZE_LOGOS;

  // Auto-size columns to keep tiles roughly square
  const cols = logos.length <= 2 ? logos.length : 3;

  const exitStart = sceneDuration - 30;
  const exit = frame > exitStart ? interpolate(frame, [exitStart, sceneDuration], [1, 0], { extrapolateRight: "clamp" }) : 1;

  return (
    <AbsoluteFill
      style={{
        background: custom?.background ?? `linear-gradient(135deg, ${colors.dark}, #000000)`,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        opacity: exit,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap" as const,
          justifyContent: "center",
          alignContent: "center",
          gap: 40,
          padding: 80,
          maxWidth: 1600,
        }}
      >
        {logos.map((logo, i) => {
          const tileSpring = spring({
            frame,
            fps,
            config: { damping: 16, mass: 0.6 },
            delay: i * 4,
          });
          const scale = interpolate(tileSpring, [0, 1], [0.3, 1]);
          const opacity = interpolate(tileSpring, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
          return (
            <div
              key={logo}
              style={{
                width: `calc(${100 / cols}% - ${40 * (cols - 1) / cols}px)`,
                aspectRatio: "3 / 2",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                opacity,
                transform: `scale(${scale})`,
                willChange: "transform, opacity",
              }}
            >
              <Img
                src={assetUrl(`picker/Friends/${logo}`)}
                style={{
                  maxWidth: "80%",
                  maxHeight: "80%",
                  objectFit: "contain",
                  filter: "drop-shadow(0 4px 20px rgba(255,255,255,0.15))",
                }}
              />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC<{ colorScheme: VideoProps["colorScheme"]; layoutIndex: number; fontConfig: FontConfig; text?: string; fontSize?: number }> = ({ colorScheme, layoutIndex, fontConfig, text, fontSize = 100 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolvedLayout = SCENE_LAYOUTS[layoutIndex % SCENE_LAYOUTS.length];
  const pan = resolvedLayout.backgroundPan;
  const gradient = `linear-gradient(135deg, #000000, ${colorScheme.dark})`;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        // When a backgroundPan image is set, it becomes the base layer and
        // the gradient renders as a translucent overlay below (see the
        // div right after); otherwise the gradient stays opaque exactly
        // as it always has, so non-panning title cards are unaffected.
        background: pan ? "#000000" : gradient,
      }}
    >
      {pan && <ArenaPanLayer src={pan.src} direction={pan.direction} />}
      {pan && <AbsoluteFill style={{ background: gradient, opacity: 0.6 }} />}

      <CharacterLayer layoutIndex={layoutIndex} darkColor={colorScheme.dark} />

      {/* Explosion burst on logo impact */}
      {(() => {
        const stomp = spring({ frame, fps, config: { damping: 12, stiffness: 200, mass: 1.2 } });
        const burstProgress = interpolate(stomp, [0.7, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        // Radial rays
        const rayCount = 12;
        const rays = Array.from({ length: rayCount }, (_, i) => {
          const angle = (i / rayCount) * 360;
          const rayLength = interpolate(burstProgress, [0, 1], [0, 600 + (i % 3) * 200]);
          const rayOpacity = interpolate(burstProgress, [0, 0.1, 0.6, 1], [0, 0.8, 0.3, 0]);
          return { angle, rayLength, rayOpacity };
        });

        return (
          <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" as const, overflow: "hidden" }}>
            {/* Radial light rays */}
            {rays.map((ray, i) => (
              <div key={i} style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 3,
                height: ray.rayLength,
                background: `linear-gradient(to bottom, ${colorScheme.highlight}, transparent)`,
                transformOrigin: "top center",
                transform: `rotate(${ray.angle}deg)`,
                opacity: ray.rayOpacity,
              }} />
            ))}
            {/* Center flash */}
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 200,
              height: 200,
              marginLeft: -100,
              marginTop: -100,
              borderRadius: "50%",
              background: `radial-gradient(circle, rgba(255,255,255,0.9) 0%, ${colorScheme.highlight}80 40%, transparent 70%)`,
              transform: `scale(${interpolate(burstProgress, [0, 0.3, 1], [0, 2, 3])})`,
              opacity: interpolate(burstProgress, [0, 0.1, 0.4, 1], [0, 1, 0.4, 0]),
            }} />
          </div>
        );
      })()}

      {/* Logo stomp */}
      {(() => {
        // Heavy stomp: starts overscaled, slams down with high stiffness
        const stomp = spring({ frame, fps, config: { damping: 12, stiffness: 200, mass: 1.2 } });
        const logoScale = interpolate(stomp, [0, 1], [2.5, 1]);
        const logoOpacity = interpolate(stomp, [0, 0.15], [0, 1], { extrapolateRight: "clamp" });
        // Subtle breathe after landing — very minimal
        const breathe = stomp >= 0.95 ? Math.sin((frame - 20) * 0.03) * 0.015 : 0;
        const glowIntensity = interpolate(stomp, [0, 0.3, 1], [80, 50, 20]);
        const logoOffsetY = resolvedLayout.logoOffsetY ?? 0;
        return (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) translateY(${logoOffsetY}px) scale(${logoScale + breathe})`,
              opacity: logoOpacity,
              zIndex: 20,
              filter: `drop-shadow(0 0 ${glowIntensity}px rgba(255,255,255,0.8)) drop-shadow(0 0 ${glowIntensity * 2}px ${colorScheme.highlight})`,
            }}
          >
            <Img
              src={SCENE_LAYOUTS[layoutIndex]?.logoSrc ?? LOGO}
              style={{ width: 1000, height: "auto" }}
            />
          </div>
        );
      })()}

      {/* Optional text in bottom quarter */}
      {text && (() => {
        const textDelay = 15;
        const textIn = spring({ frame: Math.max(0, frame - textDelay), fps, config: { damping: 14, stiffness: 120 } });
        const textOpacity = interpolate(textIn, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
        const textY = interpolate(textIn, [0, 1], [40, 0]);
        return (
          <div style={{
            position: "absolute",
            bottom: "18%",
            left: 0,
            right: 0,
            zIndex: 15,
            display: "flex",
            justifyContent: "center",
            opacity: textOpacity,
            transform: `translateY(${textY}px)`,
          }}>
            <div style={{
              fontFamily: fontConfig.fontFamily,
              fontWeight: fontConfig.fontWeight,
              fontSize,
              color: colorScheme.highlight,
              textAlign: "center",
              textTransform: "uppercase",
              lineHeight: 1.1,
              textShadow: `0 4px 20px rgba(0,0,0,0.8), 0 0 40px ${colorScheme.dark}`,
              maxWidth: "80%",
            }}>
              {text}
            </div>
          </div>
        );
      })()}

    </AbsoluteFill>
  );
};

// The render server injects `transitions` (a map of pre-parsed Lottie JSONs
// keyed by filename) into inputProps before render — see prewarmAssets() in
// server/server.mjs. The schema doesn't include it because it's an
// implementation detail of the rendering pipeline, not part of the editor's
// data model. The shape is intentionally loose so the editor's <Player>
// preview (which doesn't ship this prop) still typechecks.
type HelloWorldProps = VideoProps & { transitions?: Record<string, unknown> };
export const HelloWorld: React.FC<HelloWorldProps> = ({ colorScheme, scenes, music = "Tournament.mp3", transition = "flash.json", font = "Dela Gothic One", secondaryFont, overlayVideo = "none", frameSyncMedia = false, transitions }) => {
  const fontConfig = FONT_MAP[font] || FONT_MAP["Dela Gothic One"];
  // Falls back to the primary font when unset — currently used for the
  // Subtitle text in S13 Caption 1-4, but generic enough to reuse for any
  // future secondary text element.
  const secondaryFontConfig = FONT_MAP[secondaryFont || ""] || fontConfig;

  // Loop length of the global overlay video, measured only during
  // frame-synced renders (null src keeps the hook inert in preview and on
  // deployments without the flag). 60 = composition fps (hardcoded across
  // this file).
  const overlayLoopSrc =
    frameSyncMedia && getRemotionEnvironment().isRendering && overlayVideo && overlayVideo !== "none"
      ? assetUrl(overlayVideo)
      : null;
  const overlayLoopFrames = useLoopedVideoFrames(overlayLoopSrc, 60);

  // Compute cumulative start positions for variable-duration scenes
  const sceneStarts: number[] = [];
  let offset = 0;
  for (const scene of scenes) {
    sceneStarts.push(offset);
    offset += getSceneFrames(scene);
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* Background music */}
      {music !== "none" && <Audio src={assetUrl(`picker/music/${music}`)} volume={1} />}

      {/* Global screen-blended video overlay across entire composition */}
      {overlayVideo && overlayVideo !== "none" && (
        <AbsoluteFill style={{ mixBlendMode: "screen", zIndex: 100, pointerEvents: "none" as const }}>
          {frameSyncMedia && getRemotionEnvironment().isRendering ? (
            overlayLoopFrames != null && (
              <Loop durationInFrames={overlayLoopFrames} layout="none">
                <Video
                  src={assetUrl(overlayVideo)}
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </Loop>
            )
          ) : (
            <video
              src={assetUrl(overlayVideo)}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </AbsoluteFill>
      )}

      {/* Scene cards with Lottie transitions overlaid at scene start */}
      {scenes.map((scene, i) => {
        const sceneStart = sceneStarts[i];
        const sceneFrames = getSceneFrames(scene);
        // Per-transition profile drives both how far before the scene the
        // overlay cuts in (offset) and how long it plays (durationInFrames).
        const transitionProfile = getTransitionProfile(transition);
        const transitionOffset = transitionProfile.offset;
        const transitionDuration = transitionProfile.durationInFrames;
        const sceneLayoutIndex = resolveLayoutIndex(scene.layout, i);
        const sceneLayout = SCENE_LAYOUTS[sceneLayoutIndex % SCENE_LAYOUTS.length];
        return (
          <React.Fragment key={i}>
            {/* Scene card or title card */}
            <Sequence
              from={sceneStart}
              durationInFrames={sceneFrames}
            >
              {sceneLayout.sceneMusic && scene.sceneMusicMuted !== true && (() => {
                const sm = sceneLayout.sceneMusic;
                const fadeInFrames = Math.round((sm.fadeIn ?? 0.3) * 60);
                const fadeOutFrames = Math.round((sm.fadeOut ?? 0.5) * 60);
                const startFromFrames = Math.round((sm.startFrom ?? 0) * 60);
                return (
                  <Audio
                    src={assetUrl(sm.src)}
                    startFrom={startFromFrames}
                    volume={(f) =>
                      interpolate(f, [0, fadeInFrames, sceneFrames - fadeOutFrames, sceneFrames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                    }
                  />
                );
              })()}
              {sceneLayout.prizesGrid ? (
                <PrizesCard colorScheme={colorScheme} sceneDuration={sceneFrames} text={scene.text} />
              ) : sceneLayout.titleCard ? (
                <TitleCard colorScheme={colorScheme} fontConfig={fontConfig} layoutIndex={sceneLayoutIndex} text={scene.text} fontSize={scene.fontSize} />
              ) : (
                <SceneCard text={scene.text} subtitle={scene.subtitle} text2={scene.text2} text3={scene.text3} index={i} layoutIndex={sceneLayoutIndex} colors={colorScheme} fontConfig={fontConfig} secondaryFontConfig={secondaryFontConfig} fontSize={scene.fontSize} y={scene.y} x={scene.x} rotateZ={scene.rotateZ} rotateX={scene.rotateX} perspective={scene.perspective} backgroundVideo={scene.backgroundVideo} sceneDuration={sceneFrames} overlayVideo={overlayVideo} portrait={scene.portrait} frameSyncMedia={frameSyncMedia} />
              )}
            </Sequence>
            {/* Transition overlay */}
            {transition !== "none" && (
              <Sequence
                from={sceneStart - transitionOffset}
                durationInFrames={transitionDuration}
              >
                <LottieTransition
                  src={assetUrl(`picker/transitions/${transition}`)}
                  data={transitions?.[transition] as never}
                />
              </Sequence>
            )}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
