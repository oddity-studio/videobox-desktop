import type { SceneLayout } from "../sceneUtils";
import { S13_GLITCH, S13_ARENA, lightFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Head On",
  category: "Season 13",
  characters: [
    { src: S13_GLITCH, side: "left", scale: 1.25, bottomPct: -5.21, offsetX: -200, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "ltr" },
  customStyle: (c) => ({ ...lightFocusedStyle(c), textColor: c.highlight }),
  textDefaults: { y: 100, fontSize: 400, perspective: 0, rotateX: 10, mode: "flat" },
};

export default layout;
