import { AbsoluteFill, Video, useCurrentFrame } from "remotion";
import { Lottie } from "@remotion/lottie";
import type { LottieAnimationData } from "@remotion/lottie";
import { assetUrl } from "./config";
import { useEffect, useState } from "react";

// Per-transition profile. Keyed by the filename the editor sends as
// `props.transition` (e.g. "Arrow.json"). Each entry controls:
//   durationInFrames - how long the outer <Sequence> renders (60fps)
//   offset           - frames before the next scene that the transition
//                      cuts in (i.e. overlap with the tail of the prior
//                      scene)
//   blendMode        - CSS mixBlendMode applied to the transition layer
//   playbackRate     - Lottie playback rate (1 = native fps)
// "DEFAULT" is used when an unknown filename comes in.
type TransitionProfile = {
  durationInFrames: number;
  offset: number;
  blendMode: React.CSSProperties["mixBlendMode"];
  playbackRate?: number;
};

export const TRANSITION_PROFILES: Record<string, TransitionProfile> = {
  DEFAULT:      { durationInFrames: 30, offset: 18, blendMode: "screen", playbackRate: 1 },
  "flash.json": { durationInFrames: 30, offset: 12, blendMode: "screen", playbackRate: 1 },
  "flash.webm": { durationInFrames: 30, offset: 12, blendMode: "screen" },
  "Arrow.json": { durationInFrames: 60, offset: 24, blendMode: "screen", playbackRate: 1 },
  "Box1.json":  { durationInFrames: 60, offset: 24, blendMode: "screen", playbackRate: 1 },
  "Box2.json":  { durationInFrames: 60, offset: 24, blendMode: "screen", playbackRate: 1 },
  "Arrow.webm": { durationInFrames: 60, offset: 24, blendMode: "screen" },
  "Box1.webm":  { durationInFrames: 60, offset: 24, blendMode: "screen" },
  "Box2.webm":  { durationInFrames: 60, offset: 24, blendMode: "screen" },
};

export const getTransitionProfile = (name?: string): TransitionProfile =>
  (name && TRANSITION_PROFILES[name]) || TRANSITION_PROFILES.DEFAULT;

// Backwards-compatible export: HelloWorld imports this constant for the
// outer Sequence duration when no per-transition profile is in scope.
const TRANSITION_DURATION = TRANSITION_PROFILES.DEFAULT.durationInFrames;

// Per-URL cache so each transition JSON is fetched once and reused
const cache = new Map<string, LottieAnimationData>();
const pending = new Map<string, Promise<LottieAnimationData>>();

function preloadTransition(url: string): Promise<LottieAnimationData> {
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => res.json())
      .then((data: LottieAnimationData) => {
        cache.set(url, data);
        pending.delete(url);
        return data;
      });
    pending.set(url, p);
  }
  return p;
}

// Animation is 1920x1080 (landscape), video is 1080x1920 (portrait).
// Rotate 90° so the landscape animation fills the portrait frame exactly.
const rotatedStyle: React.CSSProperties = {
  width: 1920,
  height: 1080,
  transform: "rotate(90deg)",
};

const Transition: React.FC<{ src?: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const filePath = assetUrl(src || "picker/transitions/flash.json");
  const isVideo = filePath.endsWith(".webm") || filePath.endsWith(".mp4");

  // Look up the per-transition profile by the bare filename (the trailing
  // segment of `filePath`). Falls back to DEFAULT for anything unknown.
  const profile = getTransitionProfile(filePath.split("/").pop());
  const blendMode = profile.blendMode;
  const playbackRate = profile.playbackRate ?? 1;

  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(
    !isVideo ? (cache.get(filePath) ?? null) : null
  );

  useEffect(() => {
    if (isVideo) return;
    const cached = cache.get(filePath);
    if (cached) {
      setAnimationData(cached);
      return;
    }
    setAnimationData(null);
    preloadTransition(filePath).then((data) => setAnimationData(data));
  }, [filePath, isVideo]);

  if (isVideo) {
    return (
      <AbsoluteFill style={{ overflow: "hidden", justifyContent: "center", alignItems: "center", mixBlendMode: blendMode }}>
        <Video src={filePath} muted style={rotatedStyle} />
      </AbsoluteFill>
    );
  }

  if (!animationData) {
    // Cheap black-flash fallback while the JSON is still being fetched.
    const fadeFrames = profile.durationInFrames / 2;
    const opacity = frame < fadeFrames
      ? frame / fadeFrames
      : 1 - (frame - fadeFrames) / fadeFrames;
    return (
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: Math.max(0, Math.min(1, opacity)), mixBlendMode: blendMode }} />
    );
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", justifyContent: "center", alignItems: "center", mixBlendMode: blendMode }}>
      <Lottie animationData={animationData} playbackRate={playbackRate} style={rotatedStyle} />
    </AbsoluteFill>
  );
};

export { Transition as LottieTransition, TRANSITION_DURATION };
