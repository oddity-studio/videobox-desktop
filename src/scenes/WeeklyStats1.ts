import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Weekly Stats 1",
  category: "Weekly Report",
  characters: [],
  defaultDuration: 6,
  slideLinesOverlay: true,
  slideLinesLabels: ["Most Battles", "Most Wins", "Most Played Beats"],
  polkaDotOverlay: true,
  textDefaults: { y: 0, fontSize: 100, rotateZ: 25, rotateX: -22, perspective: 700 },
  sceneMusic: { src: "/picker/music/Weekly.mp3", fadeIn: 0.3, fadeOut: 0.5, startFrom: 5 },
  customStyle: (c) => ({ background: `linear-gradient(135deg, ${c.light}, ${c.dark})`, textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
