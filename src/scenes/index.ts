import type { SceneLayout } from "../sceneUtils";

import S13Logo from "./S13Logo";
import S13Cover from "./S13Cover";
import S13Scene1 from "./S13Scene1";
import S13Scene2 from "./S13Scene2";
import S13Scene3 from "./S13Scene3";
import S13Scene4 from "./S13Scene4";
import S13Scene5 from "./S13Scene5";
import S13Scene6 from "./S13Scene6";
import S13Scene7 from "./S13Scene7";
import S13Scene8 from "./S13Scene8";
import S12Scene1 from "./S12Scene1";
import S12Scene2 from "./S12Scene2";
import S12Scene3 from "./S12Scene3";
import VideoCube from "./VideoCube";
import MyVideo from "./MyVideo";
import BotWeek1 from "./BotWeek1";
import BotWeek2 from "./BotWeek2";
import Brackets from "./Brackets";
import WeeklyStats1 from "./WeeklyStats1";
import WeeklyStats2 from "./WeeklyStats2";
import Tourney1 from "./Tourney1";
import TourneyBranch from "./TourneyBranch";
import BeltStomp from "./BeltStomp";
import Winner from "./Winner";
import Profile from "./Profile";
import S12Scene4 from "./S12Scene4";
import S12Scene5 from "./S12Scene5";
import S12Scene6 from "./S12Scene6";
import S12Cover from "./S12Cover";
import S12Logo from "./S12Logo";
import S11Logo from "./S11Logo";
import S10Logo from "./S10Logo";
import Sunset from "./Sunset";
import Neon from "./Neon";
import Ocean from "./Ocean";
import Ember from "./Ember";
import WeeklyTitle from "./WeeklyTitle";
import WeeklyTitle2 from "./WeeklyTitle2";
import Killstreak from "./Killstreak";
import King from "./King";
import Outro from "./Outro";
import Prizes from "./Prizes";
import Top10 from "./Top10";

// Preserve the original entries at their historical numeric indexes. Saved
// presets may still contain a numeric `layout`, so inserting new templates in
// front would silently remap old projects to the wrong scene. New templates
// are appended and the editor orders category headings independently.
export const SCENE_LAYOUTS: SceneLayout[] = [
  S12Scene1,
  S12Scene2,
  S12Scene3,
  VideoCube,
  MyVideo,
  BotWeek1,
  BotWeek2,
  Brackets,
  WeeklyStats1,
  WeeklyStats2,
  Tourney1,
  TourneyBranch,
  BeltStomp,
  Winner,
  Profile,
  S12Scene4,
  S12Scene5,
  S12Scene6,
  S12Cover,
  S12Logo,
  S11Logo,
  S10Logo,
  Sunset,
  Neon,
  Ocean,
  Ember,
  WeeklyTitle,
  WeeklyTitle2,
  Killstreak,
  King,
  Outro,
  Prizes,
  Top10,
  S13Logo,
  S13Cover,
  S13Scene2, // Head On
  S13Scene3, // Left Align
  S13Scene1, // Caption 1
  S13Scene5, // Caption 2
  S13Scene7, // Caption 3
  S13Scene8, // Caption 4
  S13Scene4, // Scroll
  S13Scene6, // Marquee
];
