import type { SceneLayout } from "../sceneUtils";

const layout: SceneLayout = {
  label: "Killstreak",
  category: "Weekly Report",
  characters: [],
  backgroundVideo: { src: "/killstreak.webm", scale: 1, blendMode: "normal", startFrom: 0, muted: false },
  killstreakOverlay: true,
  videoFit: "contain",
  defaultDuration: 8,
  textDefaults: { y: 0, fontSize: 150, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "none" }),
  customControls: [{ type: "videoMute" }],
};

export default layout;
