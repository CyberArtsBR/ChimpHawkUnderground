import * as THREE from 'three';

/**
 * Sky life (2026-11 enhancement pass), outdoor maps only (maps with a sky):
 * a low sunset sun with slowly turning light rays, drifting clouds, and the
 * odd plane or helicopter crossing far overhead. Presentation only.
 * Built from camera-facing meshes (not sprites) so the glow pass darkens them
 * like the rest of the park and they never bloom.
 */
export const SKY_LIFE = Object.freeze({
  sunDistance: 620,
  sunElevation: 13 * Math.PI / 180,
  sunSize: 170,
  raysSize: 720,
  clouds: 8,
  cloudDistance: 660,
  cloudDrift: .0035,
  flyerFirst: 10,
  flyerGap: [28, 60],
});

const canvasTexture = (width, height, draw) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

function skyMaterial(map, { additive = false, opacity = 1, color = '#ffffff' } = {}) {
  return new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: !additive,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** Sun direction: the key light's compass bearing, held low for a sunset. */
export function sunDirection(keyPosition, elevation = SKY_LIFE.sunElevation) {
  const [x = -1, , z = 0] = Array.isArray(keyPosition) ? keyPosition : [];
  const bearing = Math.atan2(Number(z) || 0, Number(x) || -1);
  return new THREE.Vector3(Math.cos(bearing) * Math.cos(elevation), Math.sin(elevation), Math.sin(bearing) * Math.cos(elevation)).normalize();
}

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

/**
 * Where the sun glows in a photo dome: the brightest warm patch above the
 * horizon, mapped back to a world direction through the dome's own UVs.
 */
export function sunFromDome(dome) {
  try {
    const image = (Array.isArray(dome.material) ? dome.material[0] : dome.material).map.image;
    const W = 128, H = 64, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const cell = 4;
    let best = -1, bu = .5, bv = .5;
    for (let cy = Math.floor(H * .2 / cell); cy < Math.floor(H * .5 / cell); cy++) {
      for (let cx = 0; cx < W / cell; cx++) {
        let sum = 0;
        for (let y = cy * cell; y < cy * cell + cell; y++) for (let x = cx * cell; x < cx * cell + cell; x++) {
          const i = (y * W + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
          sum += (r * .45 + g * .45 + b * .1) * (1 + Math.max(0, r - b) / 255); // favour warm light
        }
        if (sum > best) { best = sum; bu = (cx + .5) * cell / W; bv = 1 - (cy + .5) * cell / H; }
      }
    }
    const uv = dome.geometry.attributes.uv, position = dome.geometry.attributes.position;
    let nearest = 0, distance = Infinity;
    for (let i = 0; i < uv.count; i++) {
      const d = (uv.getX(i) - bu) ** 2 + (uv.getY(i) - bv) ** 2;
      if (d < distance) { distance = d; nearest = i; }
    }
    dome.updateMatrixWorld(true);
    const point = new THREE.Vector3().fromBufferAttribute(position, nearest).applyMatrix4(dome.matrixWorld);
    const center = new THREE.Vector3().setFromMatrixPosition(dome.matrixWorld);
    const direction = point.sub(center).normalize();
    // Keep it just above the horizon line so the park walls do not swallow it.
    if (direction.y < .06) { direction.y = .06; direction.normalize(); }
    return direction;
  } catch {
    return null;
  }
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
    this.sunDir = sunDirection([-60, 45, -20]);
    this.center = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.flyerQuat = new THREE.Quaternion();
    const plane = new THREE.PlaneGeometry(1, 1);
    this.plane = plane;

    // Sun: hot core and warm halo, plus a wide, slowly turning ray fan.
    this.sunTexture = canvasTexture(512, 512, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,253,240,1)'); g.addColorStop(.07, 'rgba(255,246,214,1)');
      g.addColorStop(.11, 'rgba(255,210,150,.85)'); g.addColorStop(.3, 'rgba(255,160,110,.32)');
      g.addColorStop(.6, 'rgba(255,120,120,.08)'); g.addColorStop(1, 'rgba(255,110,130,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    this.raysTexture = canvasTexture(1024, 1024, (ctx, s) => {
      ctx.translate(s / 2, s / 2);
      let seed = 7;
      const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 26; i++) {
        const angle = (i / 26) * Math.PI * 2 + rand() * .2, width = .02 + rand() * .05, reach = s * (.32 + rand() * .18);
        const g = ctx.createRadialGradient(0, 0, s * .03, 0, 0, reach);
        g.addColorStop(0, `rgba(255,214,160,${.32 + rand() * .2})`); g.addColorStop(1, 'rgba(255,170,140,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, angle - width, angle + width); ctx.closePath(); ctx.fill();
      }
    });
    this.sun = new THREE.Mesh(plane, skyMaterial(this.sunTexture, { additive: true }));
    this.rays = new THREE.Mesh(plane, skyMaterial(this.raysTexture, { additive: true, opacity: .55 }));
    for (const [mesh, name] of [[this.rays, 'Sun rays'], [this.sun, 'Sunset sun']]) {
      mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = -5; mesh.userData.streetSkateRole = 'sky';
      this.root.add(mesh);
    }

    // Clouds: soft puff clusters lit warm on top, lavender underneath.
    this.cloudTextures = [0, 1, 2].map(variant => canvasTexture(512, 256, (ctx, w, h) => {
      let seed = 91 + variant * 37;
      const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const puffs = Array.from({ length: 9 + variant * 2 }, () => ({
        x: w * (.18 + rand() * .64), y: h * (.45 + rand() * .2), r: h * (.16 + rand() * .2),
      }));
      for (const [dy, color, alpha] of [[.18, '120,104,160', .55], [-.06, '255,226,214', .8], [-.2, '255,246,232', .6]]) {
        for (const p of puffs) {
          const g = ctx.createRadialGradient(p.x, p.y + p.r * dy, 0, p.x, p.y + p.r * dy, p.r);
          g.addColorStop(0, `rgba(${color},${alpha})`); g.addColorStop(.6, `rgba(${color},${alpha * .7})`); g.addColorStop(1, `rgba(${color},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y + p.r * dy, p.r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }));
    this.clouds = Array.from({ length: SKY_LIFE.clouds }, (_, i) => {
      const mesh = new THREE.Mesh(plane, skyMaterial(this.cloudTextures[i % 3], { opacity: .6 }));
      mesh.name = 'Drifting cloud'; mesh.frustumCulled = false; mesh.renderOrder = -4; mesh.userData.streetSkateRole = 'sky';
      this.root.add(mesh);
      return { mesh, bearing: (i / SKY_LIFE.clouds) * Math.PI * 2 + i * .37, elevation: (10 + (i * 7) % 14) * Math.PI / 180,
        width: 150 + (i * 53) % 110, speed: SKY_LIFE.cloudDrift * (.7 + (i % 3) * .3) };
    });

    // Flyers: a plane and a helicopter, one crossing at a time.
    this.glowTexture = canvasTexture(64, 64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    });
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: '#3a3b4a', roughness: .6, metalness: .3 });
    this.plane3d = this.buildPlane();
    this.heli = this.buildHeli();
    this.flyer = null;
    this.nextFlyer = SKY_LIFE.flyerFirst;
    this.flyerCount = 0;
  }

  light(color, size) {
    const mesh = new THREE.Mesh(this.plane, skyMaterial(this.glowTexture, { additive: true, color }));
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
    const dome = findSkyDome(world?.park);
    this.active = Boolean(look?.sky || dome);
    this.root.visible = this.active;
    if (!this.active) return;
    this.sunDir = (dome && sunFromDome(dome)) || sunDirection(look?.keyPosition);
    const c = Array.isArray(look?.center) ? look.center : [0, 0, 0];
    this.center.set(Number(c[0]) || 0, Number(c[1]) || 0, Number(c[2]) || 0);
    this.endFlyer();
    this.nextFlyer = SKY_LIFE.flyerFirst;
  }

  /** The dusk lighting toggle hides the sun but keeps clouds and flyers. */
  setDusk(value) { this.sun.visible = this.rays.visible = !value; }

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

  faceCamera(mesh, camera) { mesh.quaternion.copy(camera.quaternion); }

  update(delta, camera) {
    if (!this.active || !camera) return;
    const dt = Math.min(.1, Math.max(0, Number(delta) || 0));
    this.time += dt;
    const eye = camera.position;
    // Sun and rays sit at "infinity": they follow the camera, never get closer.
    this.sun.position.copy(eye).addScaledVector(this.sunDir, SKY_LIFE.sunDistance);
    this.rays.position.copy(eye).addScaledVector(this.sunDir, SKY_LIFE.sunDistance + 5);
    this.sun.scale.setScalar(SKY_LIFE.sunSize);
    this.rays.scale.setScalar(SKY_LIFE.raysSize);
    this.faceCamera(this.sun, camera);
    this.faceCamera(this.rays, camera);
    this.rays.rotateZ(this.time * .015);
    this.rays.material.opacity = .45 + Math.sin(this.time * .5) * .08;
    // Clouds drift slowly around the horizon.
    for (const cloud of this.clouds) {
      cloud.bearing += cloud.speed * dt;
      const ce = Math.cos(cloud.elevation);
      this.tmp.set(Math.cos(cloud.bearing) * ce, Math.sin(cloud.elevation), Math.sin(cloud.bearing) * ce);
      cloud.mesh.position.copy(eye).addScaledVector(this.tmp, SKY_LIFE.cloudDistance);
      cloud.mesh.scale.set(cloud.width, cloud.width * .5, 1);
      this.faceCamera(cloud.mesh, camera);
    }
    // Flyers.
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
    for (const texture of [this.sunTexture, this.raysTexture, this.glowTexture, ...this.cloudTextures]) texture?.dispose();
    this.root.removeFromParent();
  }
}
