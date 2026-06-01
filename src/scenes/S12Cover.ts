import type { SceneLayout } from "../sceneUtils";
import { CHAR1, CHAR3, CHAR2 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S12 Cover",
  category: "Season 12",
  characters: [
    { src: CHAR1, side: "left", scale: 1, bottomPct: 0, widthPct: 33.33, leftPct: 0, offsetX: 200 },
    { src: CHAR3, side: "left", scale: 1, bottomPct: 0, widthPct: 33.33, leftPct: 33.33, offsetX: -200 },
    { src: CHAR2, side: "left", scale: 1, bottomPct: 0, widthPct: 33.33, leftPct: 66.66 },
  ],
  textDefaults: { rotateZ: 10, rotateX: -15 },
};

export default layout;
