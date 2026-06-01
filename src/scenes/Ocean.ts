import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Ocean",
  category: "Gradients",
  characters: [],
  textDefaults: { y: -60, fontSize: 200, mode: "flat" },
  customStyle: (c) => ({ background: `linear-gradient(180deg, #0c1445, #1a3a6a, ${c.light})`, textColor: c.highlight, textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
