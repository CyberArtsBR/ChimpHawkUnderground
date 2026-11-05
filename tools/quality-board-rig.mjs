import {loadGeometry} from './load-geometry.mjs';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
// The same model transform and measurements used in the browser, without textures/GPU.
export async function loadRuntimeBoardRig() {
  const board=new StreetBoard('/assets/rider/skateboard.glb');
  return board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
}
