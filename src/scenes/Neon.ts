import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Neon",
  category: "Gradients",
  characters: [],
  textDefaults: { y: 200, fontSize: 200, mode: "flat" },
  customStyle: (c) => ({ background: `linear-gradient(135deg, #0a0015, #1a0030, ${c.dark})`, textColor: c.light, textGlow: `0 0 20px ${c.light}, 0 0 60px ${c.light}80, 0 0 120px ${c.light}40` }),
};

export default layout;
