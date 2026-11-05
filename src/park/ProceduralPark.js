import * as THREE from 'three';

const concrete = new THREE.MeshStandardMaterial({ color: 0x8f918b, roughness: 0.88, metalness: 0.02 });
const dark = new THREE.MeshStandardMaterial({ color: 0x273137, roughness: 0.72, metalness: 0.08 });
const steel = new THREE.MeshStandardMaterial({ color: 0x9da8aa, roughness: 0.34, metalness: 0.78 });
const accent = new THREE.MeshStandardMaterial({ color: 0xc64b2d, roughness: 0.55, metalness: 0.12 });

function prep(mesh, skateable = true) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.skateable = skateable;
  return mesh;
}

function box(group, size, position, material = concrete, rotation = [0, 0, 0], skateable = true) {
  const mesh = prep(new THREE.Mesh(new THREE.BoxGeometry(...size), material), skateable);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  group.add(mesh);
  return mesh;
}

function wedge(group, { width, run, height, position, rotationY = 0, material = concrete }) {
  const w = width / 2;
  const verts = new Float32Array([
    -w,0,0, w,0,0, w,0,-run, -w,0,-run,
    -w,height,-run, w,height,-run,
  ]);
  const idx = [0,1,2, 0,2,3, 3,2,5, 3,5,4, 0,3,4, 0,4,5, 0,5,1, 1,5,2];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = prep(new THREE.Mesh(geo, material));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  group.add(mesh);
  return mesh;
}

function quarter(group, { width = 10, run = 4, height = 3, position = [0,0,0], rotationY = 0, segments = 14 }) {
  const vertices = [];
  const indices = [];
  for (let side = 0; side < 2; side++) {
    const x = side ? width / 2 : -width / 2;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI / 2;
      const z = -run * Math.sin(t);
      const y = height * (1 - Math.cos(t));
      vertices.push(x, y, z);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < segments; i++) {
    const a=i, b=i+1, c=row+i+1, d=row+i;
    indices.push(a,b,c, a,c,d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = prep(new THREE.Mesh(geo, dark));
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  group.add(mesh);

  const lipA = new THREE.Vector3(-width/2, height + .04, -run);
  const lipB = new THREE.Vector3(width/2, height + .04, -run);
  const copingGeo = new THREE.CylinderGeometry(.055,.055,width,10);
  copingGeo.rotateZ(Math.PI/2);
  const coping = prep(new THREE.Mesh(copingGeo, steel), false);
  coping.position.copy(lipA).lerp(lipB,.5);
  coping.position.add(new THREE.Vector3(...position));
  coping.rotation.y = rotationY;
  group.add(coping);
  return mesh;
}

function rail(group, a, b, height = .75, material = steel) {
  const p1 = new THREE.Vector3(...a).add(new THREE.Vector3(0,height,0));
  const p2 = new THREE.Vector3(...b).add(new THREE.Vector3(0,height,0));
  const dir = p2.clone().sub(p1);
  const length = dir.length();
  const geo = new THREE.CylinderGeometry(.045,.045,length,8);
  geo.rotateX(Math.PI/2);
  const bar = prep(new THREE.Mesh(geo, material), false);
  bar.position.copy(p1).lerp(p2,.5);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1), dir.clone().normalize());
  group.add(bar);
  for (const p of [p1,p2]) {
    const post = box(group,[.07,height,.07],[p.x,height/2,p.z],material,[0,0,0],false);
    post.castShadow = true;
  }
}

export function createProceduralPark() {
  const group = new THREE.Group();
  group.name = 'StreetSkate procedural park';

  box(group,[68,.3,46],[0,-.15,0],concrete);
  box(group,[68,.35,.35],[0,.02,-23],dark,[0,0,0],false);
  box(group,[68,.35,.35],[0,.02,23],dark,[0,0,0],false);

  quarter(group,{width:12,run:4.3,height:3.6,position:[-27,0,5],rotationY:-Math.PI/2});
  quarter(group,{width:11,run:2.6,height:1.8,position:[-22,0,-12],rotationY:0});
  quarter(group,{width:8,run:2.5,height:1.9,position:[29,0,-2],rotationY:Math.PI/2});
  quarter(group,{width:10,run:3.2,height:2.1,position:[18,0,18],rotationY:Math.PI});

  wedge(group,{width:9,run:6,height:1.25,position:[-7,0,0]});
  box(group,[3.5,.28,2.0],[-7,1.39,-4.9],dark);
  wedge(group,{width:10,run:6,height:1.05,position:[7,0,2]});
  box(group,[.7,.65,3.1],[7,.33,-2.4],steel);
  wedge(group,{width:8,run:6,height:1.35,position:[-19,0,1],rotationY:0});

  box(group,[8,1.2,7],[-9,.6,15],concrete);
  for (let i=0;i<5;i++) box(group,[7,.18,1.1],[-9,.09 + i*.18,10.7-i*.9],concrete);
  rail(group,[-7.2,0,12.8],[-7.2,0,8.5],.75,accent);
  rail(group,[-2,0,3],[4,0,3],.55,steel);
  rail(group,[11,0,-8],[11,0,-12],.7,accent);
  rail(group,[19,0,13],[19,0,18],.8,steel);

  box(group,[6,.55,1.1],[17,.275,-12],concrete);
  box(group,[5,.35,1.0],[3,.175,14],concrete);

  group.traverse((o)=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
  group.updateMatrixWorld(true);
  return { scene: group, collision: group, spawn: [-13,.15,12], visualTriangles: 3200 };
}
