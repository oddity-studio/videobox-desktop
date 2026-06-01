import type { SceneLayout } from "../sceneUtils";
import { CHAR2 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene3",
  category: "Season 12",
  characters: [
    { src: CHAR2, side: "left", scale: 1.1, bottomPct: 0 },
  ],
  textDefaults: { x: -20, y: 500, fontSize: 204, rotateZ: -15, rotateX: 22 },
};

export default layout;
