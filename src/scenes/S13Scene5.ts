import type { SceneLayout } from "../sceneUtils";
import { S13_CYGNUS, S13_ARENA, darkFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Caption 2",
  category: "Season 13",
  characters: [
    { src: S13_CYGNUS, side: "left", scale: 1.2, bottomPct: 0, offsetX: -500, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "rtl" },
  slideInGraphic: { bottomPct: 25, stopAtLeftPx: 30 },
  subtitleEnabled: true,
  // Keep the dark-focused background gradient but override the text to
  // plain white with a hard-edged (zero-blur), close-offset shadow — the subtitle below has its own fixed, independent shadow, see HelloWorld.tsx
  // instead of the usual soft glow.
  customStyle: (c) => ({
    ...darkFocusedStyle(c),
    textColor: "#ffffff",
    textGlow: "16px 16px 0px rgba(0,0,0,0.85)",
  }),
  // No y override needed — lineSlide mode auto-centers on the stripe's
  // own vertical middle (computed from slideInGraphic.bottomPct above).
  textDefaults: { mode: "lineSlide" },
};

export default layout;
