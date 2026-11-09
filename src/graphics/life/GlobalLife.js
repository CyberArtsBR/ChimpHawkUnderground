import * as THREE from 'three';

/**
 * World Life, global touches (2026-11), active in every park:
 *  - a short metal "ring" when a rail grind of at least 0.25 s ends normally;
 *  - a bail clatter and 2-4 rubber skid marks laid on the ground along the
 *    travel direction (pooled, max 12, fade over 6 s).
 * Presentation only: reads skater state and ground queries, writes nothing back.
 */
const MIN_RING_GRIND = .25;
const RING_MAX_DRIFT_SQ = 4; // grind must end within ~2 m of the last rail position
const CLATTER_COOLDOWN = 1;
const MARK_POOL = 12;
const MARK_FADE = 6;
const MARK_OPACITY = .7;
const MARK_LIFT = .01;

export class GlobalLife {
  constructor() {
    this.parks = '*';
    this.root = new THREE.Group();
    this.root.name = 'World life: global';
    this.density = 1;
    this.time = 0;
    this.skater = null;
    this.ctx = null;
    this.unsubscribe = [];
    this.reactions = null;

    this.grindActive = false;
    this.grindStartTime = 0;
    this.grindMetal = false;
    this.railPoint = new THREE.Vector3();
    this.lastClatter = -Infinity;

    // Skid marks: one InstancedMesh, one shared material, per-instance fade attribute.
    this.marks = Array.from({ length: MARK_POOL }, () => ({ life: 0 }));
    this.cursor = 0;
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(MARK_POOL), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2); // lies in XZ: x = width, z = length
    geometry.setAttribute('aFade', this.fade);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x0a0a0b, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.material.name = 'world-life skid mark';
    this.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
    };
    this.material.customProgramCacheKey = () => 'world-life-skid';
    this.mesh = new THREE.InstancedMesh(geometry, this.material, MARK_POOL);
    this.mesh.name = 'World life skid marks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.root.add(this.mesh);

    this.matrix = new THREE.Matrix4();
    this.dir = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.at = new THREE.Vector3();
    this.along = new THREE.Vector3();
  }

  setWorld(world, ctx) {
    this.ctx = ctx;
    this.clearMarks();
    if (ctx?.reactions && ctx.reactions !== this.reactions) {
      this.unsubscribe.forEach(off => off());
      this.reactions = ctx.reactions;
      this.unsubscribe = [
        this.reactions.on('grindStart', e => this.onGrindStart(e)),
        this.reactions.on('grindEnd', () => this.onGrindEnd()),
        this.reactions.on('bail', e => this.onBail(e)),
      ];
    }
  }

  setQuality(settings) {
    const performance = settings?.name === 'performance';
    this.density = performance ? 0 : Number(settings?.vfxScale) < 1 ? .5 : 1;
    this.root.visible = this.density > 0;
    if (this.density === 0) this.reset();
  }

  onGrindStart(e) {
    this.grindActive = true;
    this.grindStartTime = this.time;
    this.grindMetal = e.material === 'metal';
    this.railPoint.copy(e.point);
  }

  onGrindEnd() {
    if (!this.grindActive) return;
    this.grindActive = false;
    const skater = this.skater;
    if (this.density <= 0 || !this.grindMetal || !skater) return;
    if (this.time - this.grindStartTime < MIN_RING_GRIND) return;
    if (skater.bailTime > 0) return;
    if (skater.position.distanceToSquared(this.railPoint) > RING_MAX_DRIFT_SQ) return;
    this.ctx?.audio?.play('ring', this.railPoint, { gain: .5 });
  }

  onBail(e) {
    if (this.density <= 0 || !this.ctx) return;
    if (this.time - this.lastClatter >= CLATTER_COOLDOWN) {
      this.lastClatter = this.time;
      this.ctx.audio?.play('clatter', e.point);
    }
    this.layMarks(e.point);
  }

  layMarks(point) {
    const surface = this.ctx?.surface, skater = this.skater;
    if (!surface?.ground) return;
    const dir = this.dir;
    dir.set(skater?.velocity?.x || 0, 0, skater?.velocity?.z || 0);
    if (dir.lengthSq() < .04) dir.set(skater?.forward?.x || 0, 0, skater?.forward?.z || -1);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const count = 2 + Math.floor(Math.random() * 3);
    const spacing = .3 + Math.random() * .1;
    const cap = Math.max(1, Math.round(MARK_POOL * this.density));
    for (let i = 0; i < count; i++) {
      this.at.copy(point).addScaledVector(dir, i * spacing + .15);
      const hit = surface.ground(this.at, .5, 1);
      if (!hit) continue;
      this.placeMark(hit, dir, .5 + Math.random() * .4, .07 + Math.random() * .04, cap);
    }
  }

  placeMark(hit, dir, length, width, cap) {
    const index = this.cursor % cap;
    this.cursor = (index + 1) % cap;
    const n = hit.normal;
    // Travel direction projected onto the ground plane, then a (side, normal, along) basis.
    const along = this.along.copy(dir).addScaledVector(n, -dir.dot(n));
    if (along.lengthSq() < 1e-6) along.set(1, 0, 0).addScaledVector(n, -n.x);
    along.normalize();
    const side = this.side.crossVectors(n, along).normalize();
    this.matrix.makeBasis(side.multiplyScalar(width), n, along.multiplyScalar(length));
    this.matrix.setPosition(
      hit.point.x + n.x * MARK_LIFT, hit.point.y + n.y * MARK_LIFT, hit.point.z + n.z * MARK_LIFT);
    this.mesh.setMatrixAt(index, this.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.marks[index].life = MARK_FADE;
    this.fade.array[index] = MARK_OPACITY;
    this.fade.needsUpdate = true;
    this.syncCount();
  }

  syncCount() {
    let count = 0;
    for (let i = this.marks.length - 1; i >= 0; i--) if (this.marks[i].life > 0) { count = i + 1; break; }
    this.mesh.count = count;
  }

  clearMarks() {
    for (let i = 0; i < this.marks.length; i++) { this.marks[i].life = 0; this.fade.array[i] = 0; }
    this.fade.needsUpdate = true;
    this.cursor = 0;
    this.mesh.count = 0;
  }

  update(dt, skater) {
    this.time += dt;
    this.skater = skater;
    if (skater.grind && this.grindActive) this.railPoint.copy(skater.position);
    if (this.mesh.count === 0) return;
    let live = false;
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i];
      if (mark.life <= 0) continue;
      mark.life -= dt;
      if (mark.life <= 0) { mark.life = 0; this.fade.array[i] = 0; }
      else { this.fade.array[i] = MARK_OPACITY * (mark.life / MARK_FADE); live = true; }
    }
    this.fade.needsUpdate = true;
    if (live) this.syncCount(); else this.mesh.count = 0;
  }

  reset() {
    this.clearMarks();
    this.grindActive = false;
    this.lastClatter = -Infinity;
    this.ctx?.audio?.stop?.('ring');
    this.ctx?.audio?.stop?.('clatter');
  }

  dispose() {
    this.unsubscribe.forEach(off => off());
    this.unsubscribe = [];
    this.reactions = null;
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
