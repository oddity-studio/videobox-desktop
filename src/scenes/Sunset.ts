import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Sunset",
  category: "Gradients",
  characters: [],
  textDefaults: { y: 200, fontSize: 200, mode: "flat" },
  customStyle: (c) => ({ background: `linear-gradient(180deg, ${c.dark}, #ff6b35, ${c.highlight})`, textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
