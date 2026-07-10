import type { SceneLayout } from "../sceneUtils";

// Weekly Title 2 — same bottom title text as Weekly Title, but instead of
// the title.webm background animation, a centered hexagon outline in the
// palette's highlight color with a slow hexagonal ripple expanding out
// from behind it (drawn by HexRippleOverlay in HelloWorld.tsx).
const layout: SceneLayout = {
  label: "Weekly Title 2",
  category: "Weekly Report",
  characters: [],
  weeklyTitle: true,
  hexRipple: true,
  defaultDuration: 5,
  textDefaults: { y: 0, fontSize: 72, mode: "flat" },
  customStyle: () => ({ background: "#000000", textColor: "#ffffff", textGlow: "none" }),
  customControls: [{ type: "weekPicker" }],
};

export default layout;
