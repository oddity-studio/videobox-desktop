import type { SceneLayout } from "../sceneUtils";
import { CHAR3, CHAR2 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene5",
  category: "Season 12",
  characters: [
    { src: CHAR3, side: "left", scale: 1.2, bottomPct: 0, opacity: 0.5, offsetX: -500 },
    { src: CHAR2, side: "left", scale: 0.8, bottomPct: 0 },
  ],
  textDefaults: { y: 200, rotateZ: 14, rotateX: -18 },
};

export default layout;
