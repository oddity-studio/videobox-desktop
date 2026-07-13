import type { SceneLayout } from "../sceneUtils";
import { S13_MAXX, S13_HAMMER, S13_ARENA } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Cover",
  category: "Season 13",
  // Hammer listed first / Maxx second: characters paint in array order, so
  // Maxx (listed last) renders in front of Hammer.
  characters: [
    { src: S13_HAMMER, side: "right", scale: 1.1, bottomPct: -15.63, flip: true, offsetX: 400, doubleShadow: true },
    { src: S13_MAXX, side: "left", scale: 0.9, bottomPct: 15.63, flip: true, offsetX: -400, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "rtl" },
  // Same gradient Cover already got from the layoutIndex%4 variant cycle
  // (made explicit here so we can override just the text color to the
  // project's highlight color without touching the background).
  customStyle: (c) => ({
    background: `linear-gradient(135deg, ${c.dark}, ${c.light}, ${c.highlight})`,
    textColor: c.highlight,
    textGlow: `0 0 30px color-mix(in srgb, ${c.light} 60%, transparent)`,
  }),
  // y was 0 (unset); 30vh on the 1920px canvas ≈ 576px, added straight on.
  textDefaults: { y: 576, rotateX: 8 },
};

export default layout;
