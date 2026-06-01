import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Prizes",
  category: "Tournament",
  characters: [],
  prizesGrid: true,
  textDefaults: { y: 0, fontSize: 100, mode: "flat" },
  customStyle: (c) => ({ background: `linear-gradient(135deg, ${c.dark}, #000000)`, textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
