import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Ember",
  category: "Gradients",
  characters: [],
  textDefaults: { y: -60, fontSize: 200, mode: "flat" },
  customStyle: (c) => ({ background: `radial-gradient(ellipse at 50% 80%, ${c.highlight}, ${c.dark}, #000000)`, textColor: "#ffffff", textGlow: `0 0 20px ${c.highlight}80, 0 4px 30px rgba(0,0,0,0.7)` }),
};

export default layout;
