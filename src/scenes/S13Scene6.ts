import type { SceneLayout } from "../sceneUtils";
import { S13_NOVA, S13_ARENA, lightFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Marquee",
  category: "Season 13",
  characters: [
    { src: S13_NOVA, side: "left", scale: 1.125, bottomPct: 0, offsetX: -400, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "ltr" },
  customStyle: (c) => ({ ...lightFocusedStyle(c), textColor: c.highlight }),
  textDefaults: { y: 600, mode: "marquee" },
};

export default layout;
