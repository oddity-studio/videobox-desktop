import type { SceneLayout } from "../sceneUtils";
import { CHAR1 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "My Video",
  category: "General",
  characters: [
    { src: CHAR1, side: "right", scale: 1.3, bottomPct: 0, flip: true, offsetX: 80 },
  ],
  backgroundVideo: { src: "/Cube.mp4", scale: 1, blendMode: "screen", startFrom: 300 },
  textDefaults: { y: -60, fontSize: 200, mode: "flat" },
  customStyle: (c) => ({ background: `radial-gradient(ellipse at 50% 80%, ${c.highlight}, ${c.dark}, #000000)`, textColor: "#ffffff", textGlow: `0 0 20px ${c.highlight}80, 0 4px 30px rgba(0,0,0,0.7)` }),
  customControls: [{ type: "videoUpload", field: "backgroundVideo" }],
};

export default layout;
