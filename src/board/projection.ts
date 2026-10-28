import { geoConicEqualArea } from 'd3-geo';
import { geometry } from './model';

const { rotate, parallels, scale, translate } = geometry.projection;
const proj = geoConicEqualArea().rotate(rotate).parallels(parallels).scale(scale).translate(translate);

/** lat/lng → board px. Parameters are baked by scripts/board/build-board.ts so build and runtime agree. */
export function project(lat: number, lng: number): [number, number] {
  const p = proj([lng, lat]);
  return p ? [p[0], p[1]] : [0, 0];
}
