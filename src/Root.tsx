import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { defaultVideoProps, videoPropsSchema, getTotalFrames } from "./types";

export const RemotionRoot: React.FC = () => {
  const totalFrames = getTotalFrames(defaultVideoProps);

  return (
    <Composition
      id="HelloWorld"
      component={HelloWorld}
      durationInFrames={totalFrames}
      fps={60}
      width={1080}
      height={1920}
      schema={videoPropsSchema}
      defaultProps={defaultVideoProps}
    />
  );
};
