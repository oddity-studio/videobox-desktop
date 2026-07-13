import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Bracket",
  category: "Tournament",
  characters: [],
  slideLinesOverlay: true,
  slideLinesTourney: true,
  slideLinesFixed: true,
  slideLinesLabels: ["Most Battles", "Most Wins", "Most Played Beats"],
  textDefaults: { y: 0, fontSize: 150, rotateZ: 0, rotateX: 0, perspective: 700 },
  customStyle: (c) => ({ background: `linear-gradient(135deg, ${c.light}, ${c.dark})`, textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
};

export default layout;
