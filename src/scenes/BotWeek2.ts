import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "BotWeek2",
  category: "General",
  characters: [],
  backgroundVideo: { src: "/Cube.mp4", scale: 1, blendMode: "normal", startFrom: 0 },
  battleOverlay: true,
  battleSlide: 1,
  defaultDuration: 30,
  textDefaults: { y: -60, fontSize: 80, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "none" }),
  customControls: [{ type: "videoUpload", field: "backgroundVideo" }],
};

export default layout;
