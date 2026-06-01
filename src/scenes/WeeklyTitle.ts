import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Weekly Title",
  category: "Weekly Report",
  characters: [],
  backgroundVideo: { src: "/title.webm", scale: 1, blendMode: "normal", startFrom: 0 },
  weeklyTitle: true,
  videoFit: "contain",
  defaultDuration: 5,
  textDefaults: { y: 0, fontSize: 72, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "none" }),
  customControls: [{ type: "weekPicker" }, { type: "videoMute" }],
};

export default layout;
