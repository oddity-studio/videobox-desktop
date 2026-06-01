import type { SceneLayout } from "../sceneUtils";
import { BELT1 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Belt Stomp",
  category: "Tournament",
  characters: [],
  beltStomp: { src: BELT1 },
  textDefaults: { y: 200, fontSize: 120, rotateX: 10, mode: "flat" },
  customStyle: (c) => ({ background: `radial-gradient(circle, ${c.highlight}, ${c.dark})`, textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
