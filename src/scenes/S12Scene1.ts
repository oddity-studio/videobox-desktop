import type { SceneLayout } from "../sceneUtils";
import { CHAR1 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene1",
  // Title input accepts Enter — each line renders as its own row.
  multilineText: true,
  category: "Season 12",
  characters: [
    { src: CHAR1, side: "left", scale: 1.2, bottomPct: 0 },
  ],
  textDefaults: { y: 500, rotateZ: -12, rotateX: 18 },
};

export default layout;
