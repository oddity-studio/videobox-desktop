import type { SceneLayout } from "../sceneUtils";
import { S13_MAXX, S13_HAMMER, S13_ARENA, S13_LOGO } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S13 Logo",
  category: "Season 13",
  // Hammer listed first / Maxx second: characters paint in array order, so
  // Maxx (listed last) renders in front of Hammer.
  characters: [
    { src: S13_HAMMER, side: "right", scale: 1.1, bottomPct: -15.63, flip: true, offsetX: 400, doubleShadow: true },
    { src: S13_MAXX, side: "left", scale: 0.9, bottomPct: 15.63, flip: true, offsetX: -400, doubleShadow: true },
  ],
  titleCard: true,
  logoSrc: S13_LOGO,
  logoOffsetY: 200,
  backgroundPan: { src: S13_ARENA, direction: "rtl" },
  textDefaults: { y: 0, fontSize: 100, mode: "flat" },
};

export default layout;
