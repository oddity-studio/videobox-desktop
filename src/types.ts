import { z } from "zod";

export const colorSchemeSchema = z.object({
  dark: z.string(),
  light: z.string(),
  highlight: z.string(),
});

export const backgroundVideoSchema = z.object({
  src: z.string(),
  // Original file name from the upload — used by the timeline's Video
  // property cell to show "Uploaded as: foo.mp4" instead of an opaque
  // blob: URL. Optional so existing scenes without a name still load.
  name: z.string().optional(),
  scale: z.number().optional(),
  blendMode: z.string().optional(),
  startFrom: z.number().optional(),
  muted: z.boolean().optional(),
});

export const sceneSchema = z.object({
  text: z.string(),
  // User-editable secondary caption — only shown/used by layouts with
  // SceneLayout.subtitleEnabled (the S13 Caption 1-4 templates).
  subtitle: z.string().optional(),
  // Center text pair — only shown/used by layouts with
  // SceneLayout.hexRipple (Weekly Title 2). text2 is the big line, text3
  // sits directly below it at half the size with a fixed gap.
  text2: z.string().optional(),
  text3: z.string().optional(),
  layout: z.union([z.number(), z.string()]).optional(),
  fontSize: z.number().optional(),
  y: z.number().optional(),
  x: z.number().optional(),
  rotateZ: z.number().optional(),
  rotateX: z.number().optional(),
  perspective: z.number().optional(),
  duration: z.number().finite().positive().optional(),
  backgroundVideo: backgroundVideoSchema.optional(),
  portrait: z.string().optional(),
  sceneMusicMuted: z.boolean().optional(),
});

export const videoPropsSchema = z.object({
  seasonNumber: z.string(),
  colorScheme: colorSchemeSchema,
  music: z.string().optional(),
  transition: z.string().optional(),
  font: z.string().optional(),
  // Used for secondary text (currently: the Subtitle in S13 Caption 1-4).
  // Falls back to `font` if unset — see HelloWorld's secondaryFontConfig.
  secondaryFont: z.string().optional(),
  overlayVideo: z.string().optional(),
  // Injected by the render server when FRAME_SYNC_MEDIA=1 (the desktop
  // app sets this). Swaps wall-clock media (overlay <video>, loopVideo,
  // fire webp) for frame-synced Remotion components during rendering.
  // Never set on the web deployment — its renders keep the original,
  // known-good code path untouched.
  frameSyncMedia: z.boolean().optional(),
  scenes: z.array(sceneSchema),
});

export type ColorScheme = z.infer<typeof colorSchemeSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type VideoProps = z.infer<typeof videoPropsSchema>;

export const FPS = 60;
export const DEFAULT_SCENE_DURATION = 3; // seconds

export const getSceneFrames = (scene: Scene): number => {
  const seconds = Number(scene.duration ?? DEFAULT_SCENE_DURATION);
  const safeSeconds = Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_SCENE_DURATION;
  return Math.max(1, Math.round(safeSeconds * FPS));
};

export const getTotalFrames = (props: VideoProps): number =>
  props.scenes.reduce((sum, s) => sum + getSceneFrames(s), 0);

export const defaultVideoProps: VideoProps = {
  seasonNumber: "01",
  music: "Tournament.mp3",
  transition: "flash.json",
  font: "Dela Gothic One",
  overlayVideo: "none",
  colorScheme: {
    dark: "#953f0c",
    light: "#dfbf67",
    highlight: "#ffaa00",
  },
  scenes: [
    { text: "", fontSize: 80, layout: "S12 Logo" },
    { text: "New Season Starts Now", fontSize: 150, layout: "S12 Scene1" },
    { text: "Make Your Mark", fontSize: 230, layout: "S12 Scene2" },
    { text: "And Forge Your Legacy", fontSize: 140, layout: "Video Cube" },
    { text: "Using Our New Tools", fontSize: 150, layout: "S12 Scene3" },
    { text: "Sounds Packs Effects Tutorials Apps Plugins And More...", fontSize: 150, layout: "S12 Scene4" },
    { text: "Right Here Right Now", fontSize: 150, layout: "S12 Scene5" },
    { text: "", fontSize: 80, layout: "S12 Logo" },
  ],
};
