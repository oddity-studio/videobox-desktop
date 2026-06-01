import type { SceneLayout } from "../sceneUtils";
import { S11ART, LOGO11 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S11 Logo",
  category: "Tournament",
  characters: [
    { src: S11ART, side: "left", scale: 1.1, bottomPct: 0, widthPct: 100, leftPct: 0, fadeOnly: true },
  ],
  titleCard: true,
  logoSrc: LOGO11,
  textDefaults: { y: 0, fontSize: 100, mode: "flat" },
};

export default layout;
