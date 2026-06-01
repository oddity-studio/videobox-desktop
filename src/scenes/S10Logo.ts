import type { SceneLayout } from "../sceneUtils";
import { S10ART, LOGO10 } from "../sceneUtils";

const layout: SceneLayout = {
  label: "S10 Logo",
  category: "Tournament",
  characters: [
    { src: S10ART, side: "left", scale: 1.1, bottomPct: 0, widthPct: 100, leftPct: 0, fadeOnly: true },
  ],
  titleCard: true,
  logoSrc: LOGO10,
  textDefaults: { y: 0, fontSize: 100, mode: "flat" },
};

export default layout;
