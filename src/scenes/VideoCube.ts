import type { SceneLayout } from "../sceneUtils";
import { CHAR1 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Video Cube",
  category: "General",
  characters: [
    { src: CHAR1, side: "right", scale: 1.3, bottomPct: 0, flip: true, offsetX: 80 },
  ],
  backgroundVideo: { src: "/Cube.mp4", scale: 1.5, blendMode: "screen", startFrom: 300 },
  textDefaults: { y: 200, rotateZ: 25, rotateX: -20 },
};

export default layout;
