import type { SceneLayout } from "../sceneUtils";
import { CHAR3 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Scene2",
  category: "Season 12",
  characters: [
    { src: CHAR3, side: "left", scale: 1.25, bottomPct: 0, offsetX: -700 },
  ],
  textDefaults: { y: 100, fontSize: 400, perspective: 0, rotateX: 10, mode: "flat" },
};

export default layout;
