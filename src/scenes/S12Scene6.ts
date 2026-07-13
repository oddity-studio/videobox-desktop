import type { SceneLayout } from "../sceneUtils";
import { CHAR2 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene6",
  // Title input accepts Enter — each line renders as its own row.
  multilineText: true,
  category: "Season 12",
  characters: [
    { src: CHAR2, side: "left", scale: 1.25, bottomPct: 0, offsetX: -60 },
  ],
  textDefaults: { x: 50, y: 600, rotateZ: 18, rotateX: 5 },
};

export default layout;
