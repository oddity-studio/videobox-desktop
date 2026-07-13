import type { SceneLayout } from "../sceneUtils";
import { S13_DATA, S13_ARENA, darkFocusedStyle } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Left Align",
  // Title input accepts Enter — each line renders as its own row.
  multilineText: true,
  category: "Season 13",
  characters: [
    { src: S13_DATA, side: "left", scale: 1.21, bottomPct: 0, offsetX: -200, doubleShadow: true },
  ],
  backgroundPan: { src: S13_ARENA, direction: "rtl" },
  customStyle: darkFocusedStyle,
  textDefaults: { y: 700, fontSize: 204, align: "left", leftAnchorPx: 50 },
};

export default layout;
