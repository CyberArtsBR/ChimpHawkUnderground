import * as THREE from 'three';

/**
 * Sky life (2026-11 enhancement pass), outdoor maps only: the odd plane or
 * helicopter with blinking lights crossing far overhead. Presentation only.
 * (A sun with rays and drifting clouds were tried and removed by request.)
 */
export const SKY_LIFE = Object.freeze({
  flyerFirst: 10,
  flyerGap: [28, 60],
});

/** A park's photo sky dome (Skate Paradise), if it has one. */
export function findSkyDome(park) {
  let dome = null;
  park?.traverse?.(object => {
    if (dome || !object.isMesh) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if ((object.userData?.streetSkateRole === 'sky' || /sky|sunset|dome/i.test(object.name || '')) && material?.map?.image) dome = object;
  });
  return dome;
}

function glowTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class SkyLife {
  constructor(scene = null) {
    this.root = new THREE.Group();
    this.root.name = 'Sky life';
    this.root.visible = false;
    scene?.add(this.root);
    this.active = false;
    this.reduced = false;
    this.time = 0;
    this.center = new THREE.Vector3();
    this.flyerQuat = new THREE.Quaternion();
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.glowTexture = glowTexture();
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: '#3a3b4a', roughness: .6, metalness: .3 });
    this.plane3d = this.buildPlane();
    this.heli = this.buildHeli();
    this.flyer = null;
    this.nextFlyer = SKY_LIFE.flyerFirst;
    this.flyerCount = 0;
  }

  light(color, size) {
    const mesh = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({
      map: this.glowTexture, color, transparent: true, depthWrite: false, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending,
    }));
    mesh.scale.setScalar(size); mesh.frustumCulled = false; mesh.userData.billboard = true; mesh.userData.streetSkateRole = 'sky';
    return mesh;
  }

  buildPlane() {
    const group = new THREE.Group(); group.name = 'Passing plane'; group.visible = false;
    const box = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.bodyMaterial); m.position.set(x, y, z); group.add(m); return m; };
    box(3.4, 3.4, 30, 0, 0, 0);          // fuselage (nose toward -Z)
    box(32, .7, 5, 0, -.4, 1.5);         // wings
    box(11, .5, 2.6, 0, .4, 13);         // tailplane
    box(.6, 5.5, 3.6, 0, 3, 13);         // fin
    const red = this.light('#ff3b30', 9); red.position.set(-16, -.4, 1.5);
    const green = this.light('#36ff7a', 9); green.position.set(16, -.4, 1.5);
    const strobe = this.light('#ffffff', 14); strobe.position.set(0, -2, 0);
    group.add(red, green, strobe);
    group.userData = { strobe, speed: 52, kind: 'plane' };
    this.root.add(group);
    return group;
  }

  buildHeli() {
    const group = new THREE.Group(); group.name = 'Passing helicopter'; group.visible = false;
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), this.bodyMaterial); body.scale.set(1, .85, 1.6); group.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, 9), this.bodyMaterial); tail.position.set(0, .4, 7); group.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(15, .15, .7), this.bodyMaterial); rotor.position.y = 2.4; group.add(rotor);
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(.15, 3, .4), this.bodyMaterial); tailRotor.position.set(.5, .6, 11.2); group.add(tailRotor);
    const beacon = this.light('#ff2a2a', 10); beacon.position.set(0, 3, 0); group.add(beacon);
    group.userData = { rotor, tailRotor, strobe: beacon, speed: 24, kind: 'heli' };
    this.root.add(group);
    return group;
  }

  setQuality(settings) { this.reduced = settings?.name === 'performance'; }

  setWorld(world) {
    const look = world?.presentation;
    this.active = Boolean(look?.sky || findSkyDome(world?.park));
    this.root.visible = this.active;
    this.endFlyer();
    if (!this.active) return;
    const c = Array.isArray(look?.center) ? look.center : [0, 0, 0];
    this.center.set(Number(c[0]) || 0, Number(c[1]) || 0, Number(c[2]) || 0);
    this.nextFlyer = SKY_LIFE.flyerFirst;
  }

  endFlyer() { if (this.flyer) this.flyer.group.visible = false; this.flyer = null; }

  startFlyer() {
    const group = this.flyerCount++ % 3 === 2 ? this.heli : this.plane3d;
    const heading = Math.random() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const across = new THREE.Vector3(-dir.z, 0, dir.x);
    const offset = (Math.random() < .5 ? -1 : 1) * (140 + Math.random() * 180);
    const altitude = group.userData.kind === 'heli' ? 70 + Math.random() * 30 : 120 + Math.random() * 40;
    const start = this.center.clone().addScaledVector(across, offset).addScaledVector(dir, -520).setY(this.center.y + altitude);
    group.position.copy(start);
    group.lookAt(start.clone().sub(dir)); // models face -Z, so look backwards along the path
    group.visible = true;
    this.flyer = { group, dir, travelled: 0, length: 1040, baseY: start.y };
  }

  update(delta, camera) {
    if (!this.active || !camera) return;
    const dt = Math.min(.1, Math.max(0, Number(delta) || 0));
    this.time += dt;
    if (this.reduced) { this.endFlyer(); return; }
    if (!this.flyer) {
      this.nextFlyer -= dt;
      if (this.nextFlyer <= 0) {
        this.startFlyer();
        const [min, extra] = SKY_LIFE.flyerGap;
        this.nextFlyer = min + Math.random() * extra;
      }
      return;
    }
    const f = this.flyer, data = f.group.userData, step = data.speed * dt;
    f.travelled += step;
    f.group.position.addScaledVector(f.dir, step);
    if (data.kind === 'heli') {
      f.group.position.y = f.baseY + Math.sin(this.time * .9) * 1.5;
      data.rotor.rotation.y += dt * 30; data.tailRotor.rotation.x += dt * 40;
    }
    // Strobe / beacon blink.
    data.strobe.visible = (this.time % 1.1) < .12;
    // Lights face the camera inside the rotated aircraft.
    this.flyerQuat.copy(f.group.quaternion).invert().multiply(camera.quaternion);
    for (const child of f.group.children) if (child.userData.billboard) child.quaternion.copy(this.flyerQuat);
    if (f.travelled >= f.length) this.endFlyer();
  }

  dispose() {
    this.root.traverse(object => { if (!object.isMesh) return; object.material.dispose?.(); if (object.geometry !== this.plane) object.geometry.dispose(); });
    this.plane.dispose();
    this.glowTexture?.dispose();
    this.root.removeFromParent();
  }
}
