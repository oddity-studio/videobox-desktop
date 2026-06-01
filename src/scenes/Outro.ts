import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Outro",
  category: "Weekly Report",
  characters: [],
  backgroundVideo: { src: "/logo.webm", scale: 1, blendMode: "normal", startFrom: 0, muted: false },
  videoFit: "contain",
  defaultDuration: 10,
  textDefaults: { y: 0, fontSize: 100, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "0 4px 30px rgba(0,0,0,0.6)" }),
  customControls: [{ type: "videoMute" }],
};

export default layout;
