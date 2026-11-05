import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';
import { StreetBoard } from '../skateboard/StreetBoard.js';
import { SKATEBOARD_FINISHES } from '../skateboard/BoardFinishes.js';

let previews;
export function boardPortraits() {
  return previews ||= loadBakedBoards().catch(()=>renderBoards())
    .catch(error => { previews = null; throw error; });
}
async function loadBakedBoards(){
  const images=SKATEBOARD_FINISHES.map((_,index)=>gameAssetUrl(`/assets/menu/decks/${index}.png`));
  await Promise.all(images.map(src=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>Promise.resolve(image.decode?.()).then(resolve,reject);image.onerror=reject;image.src=src;
  })));
  return images;
}
async function renderBoards() {
  // Preview loads never change the player's saved finish.
  const board = await new StreetBoard(gameAssetUrl('/assets/rider/skateboard.glb')).load({persist:false});
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power', preserveDrawingBuffer:true});
    renderer.setSize(320,150); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.add(board.root);
    scene.add(new THREE.HemisphereLight('#fff5ed','#687184',2.5));
    const light = new THREE.DirectionalLight('#fff4dd',3.8); light.position.set(0,4,3); scene.add(light);
    board.root.rotation.set(0,Math.PI / 2,-.12);
    const camera = new THREE.PerspectiveCamera(32,320/150,.01,20);
    camera.position.set(.1,1.4,1.4); camera.lookAt(0,0,0);
    return SKATEBOARD_FINISHES.map((finish,index) => {
      board.setFinish(index,{persist:false});
      renderer.render(scene,camera);
      return renderer.domElement.toDataURL('image/png');
    });
  } finally {
    const geometry = new Set(), materials = new Set(), textures = new Set();
    board.root.traverse(item => {
      if(item.geometry) geometry.add(item.geometry);
      for(const material of (Array.isArray(item.material)?item.material:[item.material])) if(material) materials.add(material);
    });
    materials.forEach(material => { Object.values(material).forEach(value => {if(value?.isTexture) textures.add(value);}); material.dispose(); });
    geometry.forEach(item => item.dispose()); textures.forEach(item => item.dispose());
    renderer?.dispose(); renderer?.forceContextLoss();
  }
}
