import React from "react";
import { Composition } from "remotion";
import { Example } from "./Example";

// one line per reel: durationInFrames = seconds × 30
export const Root: React.FC = () => (
  <>
    <Composition id="Example" component={Example} durationInFrames={10 * 30} fps={30} width={1080} height={1920} />
  </>
);
