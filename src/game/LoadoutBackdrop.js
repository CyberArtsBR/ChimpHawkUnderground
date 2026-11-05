import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';

/** A lit brick alley, rendered only while the loadout menu is visible. */
export class LoadoutBackdrop {
  constructor(host) {
    this.host = host;
    this.active = false;
    this.disposed = false;
    this.pointer = new THREE.Vector2();
    this.motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#10121c');
    this.scene.fog = new THREE.Fog('#10121c', 16, 36);
    this.camera = new THREE.PerspectiveCamera(48, 1, .1, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'loadout-backdrop';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.prepend(this.renderer.domElement);
    const grit = document.createElement('canvas');grit.width=256;grit.height=128;
    const ctx=grit.getContext('2d'), pixels=ctx.createImageData(256,128);
    let seed=137;
    for(let i=0;i<pixels.data.length;i+=4){
      seed=(seed*1664525+1013904223)>>>0;
      const shade=130+(seed>>>24)*.45;
      pixels.data[i]=shade;pixels.data[i+1]=shade;pixels.data[i+2]=shade;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);
    const roughness=new THREE.CanvasTexture(grit);
    const brick = new THREE.BoxGeometry(.49, .205, .12);
    const material = new THREE.MeshStandardMaterial({color:'#565665', map:roughness, bumpMap:roughness, bumpScale:.018, roughness:.96});
    const wall = new THREE.InstancedMesh(brick, material, 54 * 39);
    const matrix = new THREE.Matrix4(), color = new THREE.Color();
    let index = 0;
    for (let row = 0; row < 39; row++) for (let col = 0; col < 54; col++) {
      matrix.makeTranslation((col - 27) * .51 + (row % 2) * .255, row * .222 - .2, -.07);
      wall.setMatrixAt(index, matrix);
      const shade = .33 + ((row * 13 + col * 7) % 9) * .016;
      wall.setColorAt(index++, color.setRGB(shade, shade * .98, shade * 1.08));
    }
    this.scene.add(wall);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(45, 35), new THREE.MeshStandardMaterial({color:'#252631', roughness:.65, metalness:.12}));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0,-.5,9); this.scene.add(floor);
    const ambient = new THREE.HemisphereLight('#abb6ed', '#252332', 2);
    this.scene.add(ambient);
    for (const [x, color] of [[-8,'#0edbff'],[8,'#c75cff']]) {
      const light = new THREE.PointLight(color, 65, 23, 2); light.position.set(x,5,2); this.scene.add(light);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,5,8), new THREE.MeshBasicMaterial({color}));
      tube.position.set(x,3,.22); this.scene.add(tube);
    }
    this.textures = [roughness];
    // Flat paint sits on an actual relief brick wall; glyph alpha preserves mortar.
    this.paint('STREETSKATE', 'cyan-purple', -7, 5.1, 1.4);
    this.paint('BUILD YOUR LINE', 'gold', -6.5, 2.8, .85);
    this.paint('01 02', 'cyan-purple', 6.7, .7, .65);
    this.resize = new ResizeObserver(() => this.requestDraw());
    this.resize.observe(host);
    this.move = event => {
      this.pointer.set(event.clientX / innerWidth - .5, event.clientY / innerHeight - .5);
      if(!this.motionPreference.matches)this.requestDraw();
    };
    host.addEventListener('pointermove', this.move, {passive:true});
    this.motionChanged=()=>this.requestDraw();
    this.motionPreference.addEventListener('change',this.motionChanged);
  }
  paint(text, tone, startX, y, height) {
    let x = startX;
    const loader = new THREE.TextureLoader();
    for (const letter of text) {
      if (letter === ' ') { x += height * .45; continue; }
      const at = x;
      const texture = loader.load(gameAssetUrl(`/assets/graffiti/${tone}/${letter}.webp`), loaded => {
        if (this.disposed) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * .85, height),
          new THREE.MeshBasicMaterial({ map:loaded, transparent:true, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1 }));
        mesh.position.set(at,y,.025); mesh.rotation.z = .04 * Math.sin(at * 4);
        this.scene.add(mesh);
        this.requestDraw();
      });
      this.textures.push(texture);
      x += height * .71;
    }
  }
  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this.renderer.domElement.hidden = !active;
    cancelAnimationFrame(this.frame);
    this.frame=null;
    if (active) this.requestDraw();
  }
  requestDraw() {
    if(!this.active||this.disposed||this.frame!=null)return;
    // Static alley: draw only for resize, new artwork or pointer movement.
    this.frame=requestAnimationFrame(()=>{
      this.frame=null;
      if(this.active&&!this.disposed&&!document.hidden)this.draw();
    });
  }
  draw() {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x !== width || size.y !== height) this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    const motion = this.motionPreference.matches ? 0 : 1;
    this.camera.position.set(this.pointer.x * .4 * motion, 3.3 + this.pointer.y * .15 * motion, 10.5);
    this.camera.lookAt(0,3.25,0);
    this.renderer.render(this.scene,this.camera);
  }
  dispose() {
    this.disposed = true; this.setActive(false); this.resize.disconnect();
    this.host.removeEventListener('pointermove',this.move);
    this.motionPreference.removeEventListener('change',this.motionChanged);
    const geometry = new Set(), materials = new Set();
    this.scene.traverse(item => { if(item.geometry) geometry.add(item.geometry); if(item.material) materials.add(item.material); });
    geometry.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    this.textures.forEach(item => item.dispose());
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
