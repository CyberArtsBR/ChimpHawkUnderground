import { fetchCompressedGlb } from '../game/CompressedAsset.js';
import { gameAssetUrl } from '../game/AssetPaths.js';
import { createTestMapWorld } from '../game/TestMapLoader.js';
import { createParadiseSurfaceDetail } from '../graphics/ParadiseSurfaceDetail.js';

export const SKATE_PARADISE_ASSET='/assets/park/skate-paradise.glb';

export async function createSkateParadise({signal}={}) {
  const buffer=await fetchCompressedGlb(gameAssetUrl('/assets/park/skate-paradise.optimized.glb.gz'),gameAssetUrl(SKATE_PARADISE_ASSET),{signal});
  const world=await createTestMapWorld({name:'skate-paradise.glb',size:buffer.byteLength,arrayBuffer:async()=>buffer});
  return configureSkateParadise(world);
}

export function configureSkateParadise(world) {
  world.id='skate-paradise';
  world.manifest.name='Skate Paradise';
  world.manifest.locationId=world.id;
  // The test export starts beside the repaired spine; normal sessions enter
  // through the original clear, flat plaza entrance.
  world.manifest.spawn=[27,.4605,-75];
  world.manifest.spawnHeading=0;
  const [x,y,z]=world.presentation.center;
  world.manifest.spots=[{id:'entrance',label:'Paradise plaza',position:[...world.manifest.spawn],heading:0}];
  world.manifest.views={
    overview:{position:[x+100,y+85,z+105],target:[x,y,z],caption:'Skate Paradise · sunset skatepark',index:'01'},
    bowl:{position:[x-5,y+30,z+20],target:[x,y,z],caption:'Connected bowls and coping',index:'02'},
    street:{position:[45,18,-52],target:[40,1,-80],caption:'Plaza and street lines',index:'03'},
    top:{position:[x,200,z+.01],target:[x,y,z],caption:'Skate Paradise · all areas',index:'—'},
  };
  world.surfaceDetail ||= createParadiseSurfaceDetail(world);
  return world;
}
