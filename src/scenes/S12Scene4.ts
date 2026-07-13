import type { SceneLayout } from "../sceneUtils";
import { CHAR1 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene4",
  // Title input accepts Enter — each line renders as its own row.
  multilineText: true,
  category: "Season 12",
  characters: [
    { src: CHAR1, side: "left", scale: 1.15, bottomPct: 0 },
  ],
  textDefaults: { y: 200, rotateZ: -18, rotateX: -14, mode: "scroll" },
  customStyle: (c) => ({ background: `linear-gradient(135deg, #000000, ${c.dark})`, textColor: "#ffffff" }),
};

export default layout;
