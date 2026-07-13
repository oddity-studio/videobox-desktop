import type { SceneLayout } from "../sceneUtils";
import { S13_ZEPH, S13_ARENA, lightFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Caption 3",
  category: "Season 13",
  characters: [
    { src: S13_ZEPH, side: "left", scale: 1.2, bottomPct: -10.42, offsetX: -100, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "ltr" },
  slideInGraphic: { bottomPct: 25, stopAtLeftPx: 30 },
  subtitleEnabled: true,
  // Keep the light-focused background gradient but override the text to
  // plain white with a hard-edged (zero-blur), close-offset shadow — the subtitle below has its own fixed, independent shadow, see HelloWorld.tsx
  // instead of the usual soft glow.
  customStyle: (c) => ({
    ...lightFocusedStyle(c),
    textColor: "#ffffff",
    textGlow: "16px 16px 0px rgba(0,0,0,0.85)",
  }),
  // No y override needed — lineSlide mode auto-centers on the stripe's
  // own vertical middle (computed from slideInGraphic.bottomPct above).
  textDefaults: { mode: "lineSlide" },
};

export default layout;
