import type { PlaylistRecord } from "../data/playProjectTypes";

type Props = {
  playlist: PlaylistRecord;
};

// 0709: atmosphere layer disabled — blur/haze effects are compression-hostile in OBS broadcast output
export function PlaylistAtmosphereLayer(_props: Props) {
  return null;
}
