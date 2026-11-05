// "Neon Street Toy" sunset environment, after the title art: purple-to-orange
// sky, low warm sun, magenta fog, a glowing city skyline and neon strips.
// Lights: hemisphere + one shadowed sun (the shadow box follows the rider).
import * as THREE from 'three';

const skyVertex = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const skyFragment = /* glsl */`
  uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    float h = vDir.y;
    vec3 top = vec3(0.10, 0.06, 0.25);
    vec3 mid = vec3(0.55, 0.16, 0.48);
    vec3 horizon = vec3(1.0, 0.48, 0.24);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, top, smoothstep(0.18, 0.75, h));
    col = mix(col, vec3(0.18, 0.08, 0.20), smoothstep(0.0, -0.2, h));
    float sun = max(dot(normalize(vDir), sunDir), 0.0);
    col += vec3(1.0, 0.62, 0.30) * pow(sun, 900.0) * 6.0;   // disc (feeds bloom)
    col += vec3(1.0, 0.45, 0.25) * pow(sun, 12.0) * 0.45;   // halo
    gl_FragColor = vec4(col, 1.0);
  }`;

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#100a1c';
  g.fillRect(0, 0, 64, 128);
  const colors = ['#ffd8a8', '#7edcff', '#ff8ac2', '#fff3c4'];
  for (let y = 4; y < 128; y += 8) for (let x = 4; x < 64; x += 8) {
    if (Math.random() < 0.42) { g.fillStyle = colors[Math.floor(Math.random() * colors.length)]; g.fillRect(x, y, 4, 4); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Brand graffiti panel drawn with the Bangers face (falls back to Impact). */
export function graffitiTexture(text: string, accent: string, base: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `hsla(${280 + Math.random() * 80}, 80%, ${30 + Math.random() * 30}%, 0.35)`;
    g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 256, 20 + Math.random() * 70, 0, Math.PI * 2); g.fill();
  }
  g.font = '150px Bangers, Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 18; g.strokeStyle = '#120a18';
  g.strokeText(text, 512, 132);
  g.fillStyle = accent; g.fillText(text, 512, 132);
  g.lineWidth = 4; g.strokeStyle = '#ffffff'; g.strokeText(text, 512, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  readonly group = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  private sunOffset = new THREE.Vector3(-30, 26, 18);

  constructor(scene: THREE.Scene, parkSize: number, quality: 'high' | 'low') {
    const sunDir = this.sunOffset.clone().normalize();
    scene.fog = new THREE.FogExp2(0x6a2a5a, 0.0065);
    scene.background = new THREE.Color(0x2a1238);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { sunDir: { value: sunDir } },
    }));
    sky.name = 'Sky';
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.group.add(sky);

    this.group.add(new THREE.HemisphereLight(0x9a7cff, 0x5a3328, 1.15));
    this.sun = new THREE.DirectionalLight(0xffb27a, 3.1);
    this.sun.castShadow = true;
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const cam = this.sun.shadow.camera;
    cam.left = -28; cam.right = 28; cam.top = 28; cam.bottom = -28; cam.near = 1; cam.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun, this.sun.target);

    this.buildSkyline(parkSize);
    scene.add(this.group);
  }

  private buildSkyline(parkSize: number): void {
    const count = 140;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const texture = windowTexture();
    const material = new THREE.MeshStandardMaterial({ color: 0x1a1226, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.9, roughness: 0.9 });
    const towers = new THREE.InstancedMesh(geometry, material, count);
    towers.name = 'Skyline';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const inner = parkSize * 0.75;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.03;
      // Far enough to sit in the haze, low enough to leave the sunset sky visible.
      const r = inner + 70 + Math.random() * 130;
      const w = 8 + Math.random() * 16, h = 10 + Math.random() * (r > inner + 140 ? 70 : 34);
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, -a);
      s.set(w, h, w * (0.6 + Math.random() * 0.8));
      towers.setMatrixAt(i, m.compose(p, q, s));
    }
    towers.instanceMatrix.needsUpdate = true;
    this.group.add(towers);

    // Neon strip along the top of the boundary wall, alternating pink / cyan.
    const half = parkSize / 2;
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3d8b).multiplyScalar(2.2), fog: false });
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7edcff).multiplyScalar(2.2), fog: false });
    for (const [x, z, w, d, mat] of [
      [0, -half + 0.5, parkSize, 0.12, pink], [0, half - 0.5, parkSize, 0.12, cyan],
      [-half + 0.5, 0, 0.12, parkSize, cyan], [half - 0.5, 0, 0.12, parkSize, pink],
    ] as const) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
      strip.position.set(x, 2.25, z);
      this.group.add(strip);
    }
  }

  /** Keep the shadow box centred on the rider so shadows stay sharp. */
  follow(target: THREE.Vector3): void {
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).add(this.sunOffset);
  }
}
