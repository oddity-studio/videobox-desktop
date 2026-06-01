import type { SceneLayout } from "../sceneUtils";
import { BELT1, ARENA } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Winner",
  category: "Tournament",
  characters: [],
  backgroundImageStatic: { src: ARENA, filter: "saturate(0.2)" },
  spotlight: true,
  textBlock: true,
  beltStomp: { src: BELT1 },
  textDefaults: { y: 36, fontSize: 120, rotateX: 10, mode: "flat" },
  defaultDuration: 10,
  customStyle: (c) => ({ background: "transparent", textColor: c.highlight, textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
