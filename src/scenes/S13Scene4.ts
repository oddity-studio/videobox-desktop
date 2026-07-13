import type { SceneLayout } from "../sceneUtils";
import { S13_PYRON, S13_ARENA, lightFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Scroll",
  category: "Season 13",
  characters: [
    { src: S13_PYRON, side: "left", scale: 1.15, bottomPct: 0, offsetX: -500, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "ltr" },
  customStyle: (c) => ({ ...lightFocusedStyle(c), textColor: "#ffffff" }),
  textDefaults: { y: 200, rotateX: 16, mode: "scroll" },
};

export default layout;
