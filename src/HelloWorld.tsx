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
  Audio,
} from "remotion";
import type { VideoProps, Scene } from "./types";
import { getSceneFrames } from "./types";
import { LottieTransition, getTransitionProfile } from "./LottieTransition";
import {
  FONT_MAP,
  SCENE_DURATION,
  LOGO,
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
export const getLayoutDefaultDuration = (index: number): number | undefined =>
  SCENE_LAYOUTS[index]?.defaultDuration;
export const getLayoutDefaultFontSize = (index: number): number | undefined =>
  SCENE_LAYOUTS[index]?.textDefaults?.fontSize;

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
        transform: `translateX(${slideX + sway}px) translateY(${bob}px) scale(${placement.scale}) scaleX(${flipX})`,
        transformOrigin: isLeft ? "bottom left" : "bottom right",
        pointerEvents: "none" as const,
        willChange: "transform, opacity",
      }}
    >
      <Img
        src={placement.src}
        style={{ height: "100%", width: "auto", display: "block" }}
      />
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
}> = ({ text, sceneDuration, colors, fontConfig, fontSize, rotateZ, rotateX, perspective, y, textColor, textGlow, labels, offsetX, duel, tourney, fixed }) => {
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
            return (
              <img
                key={`fire-${li}-${triggerFrame}`}
                src={assetUrl(`firedash.webp?i=${li}`)}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: `${50 + li * rowH}px`,
                  transform: "translateX(-50%) scale(1.3)",
                  height: rowH,
                  objectFit: "contain",
                  pointerEvents: "none",
                  zIndex: -1,
                  filter: `hue-rotate(${hueShift}deg)`,
                }}
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

const SceneCard: React.FC<{ text: string; index: number; layoutIndex: number; colors: ColorScheme; fontConfig: FontConfig; fontSize?: number; y?: number; x?: number; rotateZ?: number; rotateX?: number; perspective?: number; backgroundVideo?: Scene["backgroundVideo"]; sceneDuration?: number; overlayVideo?: string; portrait?: string }> = ({
  text,
  index,
  layoutIndex,
  colors,
  fontConfig,
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

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background,
      }}
    >
      {/* Background video layer */}
      {backgroundVideo && (
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

      {/* Polka-dot multiply overlay — sits over the gradient/grunge background */}
      {resolvedLayout.polkaDotOverlay && <PolkaDotOverlay />}

      {/* Sound waveform for scroll-mode scenes — behind characters */}
      {td?.mode === "scroll" && <SoundWaveform color={colors.light} />}

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

        return (
          <div
            style={{
              opacity: isScroll ? 1 : exit,
              transform: isFlat
                ? `rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${resolvedY}px)`
                : `perspective(${perspectiveVal}px) rotateZ(${a.z}deg) rotateX(${a.x}deg) translateX(${resolvedX}px) translateY(${y}px)`,
              textAlign: "center",
              padding: "0 80px",
              zIndex: 12,
            }}
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

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        background: `linear-gradient(135deg, #000000, ${colorScheme.dark})`,
      }}
    >
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
        return (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: `translate(-50%, -50%) scale(${logoScale + breathe})`,
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

export const HelloWorld: React.FC<VideoProps> = ({ colorScheme, scenes, music = "Tournament.mp3", transition = "flash.json", font = "Dela Gothic One", overlayVideo = "none" }) => {
  const fontConfig = FONT_MAP[font] || FONT_MAP["Dela Gothic One"];

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
          <video
            src={assetUrl(overlayVideo)}
            autoPlay
            loop
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
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
                <SceneCard text={scene.text} index={i} layoutIndex={sceneLayoutIndex} colors={colorScheme} fontConfig={fontConfig} fontSize={scene.fontSize} y={scene.y} x={scene.x} rotateZ={scene.rotateZ} rotateX={scene.rotateX} perspective={scene.perspective} backgroundVideo={scene.backgroundVideo} sceneDuration={sceneFrames} overlayVideo={overlayVideo} portrait={scene.portrait} />
              )}
            </Sequence>
            {/* Transition overlay */}
            {transition !== "none" && (
              <Sequence
                from={sceneStart - transitionOffset}
                durationInFrames={transitionDuration}
              >
                <LottieTransition src={assetUrl(`picker/transitions/${transition}`)} />
              </Sequence>
            )}
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
