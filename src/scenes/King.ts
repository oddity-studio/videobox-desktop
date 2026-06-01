import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "King",
  category: "Weekly Report",
  characters: [],
  backgroundVideo: { src: "/king.webm", scale: 1, blendMode: "normal", startFrom: 0, muted: false },
  kingOverlay: true,
  videoFit: "contain",
  defaultDuration: 8,
  textDefaults: { y: 0, fontSize: 110, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "none" }),
  customControls: [{ type: "videoMute" }],
};

export default layout;
