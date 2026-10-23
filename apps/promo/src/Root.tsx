import { Composition } from "remotion";
import { Agenda } from "./agenda/Agenda";
import { FPS, LENGTH } from "./kit/time";

export const RemotionRoot = () => (
  <Composition id="Agenda" component={Agenda} durationInFrames={Math.round(LENGTH * FPS)} fps={FPS} width={1920} height={1080} />
);
