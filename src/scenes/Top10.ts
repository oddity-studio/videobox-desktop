import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Top10",
  category: "Weekly Report",
  characters: [],
  top10: true,
  defaultDuration: 10,
  textDefaults: { y: 0, fontSize: 40, mode: "flat" },
  sceneMusic: { src: "/picker/music/Weekly.mp3", fadeIn: 0.3, fadeOut: 0.5, startFrom: 35 },
  customStyle: (c) => ({ background: `linear-gradient(180deg, ${c.dark}, #000000)`, textColor: "#ffffff", textGlow: `0 0 15px ${c.highlight}60` }),
};

export default layout;
