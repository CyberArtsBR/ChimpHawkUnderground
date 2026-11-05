import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

const source = new URL('../../assets-source/iron-district/', import.meta.url);
const destination = new URL('../public/assets/iron-district/', import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roster = await readFile(new URL('SHA256SUMS.txt', source), 'utf8');
const verified = [];
for (const line of roster.trim().split(/\r?\n/)) {
  const [, expected, path] = /^(\w{64})\s+(.+)$/.exec(line) || [];
  if (!path || path.includes('..') || path.startsWith('/') || path.includes(':'))
    throw new Error('Invalid package hash entry.');
  const actual = digest(await readFile(new URL(path, source)));
  if (expected !== actual) throw new Error(`Package integrity mismatch: ${path}`);
  verified.push({ path, sha256: actual });
}
const parse = bytes => {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a)
    throw new Error('Invalid GLB header.');
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
};
const edited = await readFile(new URL('IronDistrictSource.glb', source));
const editedJson = parse(edited);
if ((editedJson.images || []).some(image => image.uri) || (editedJson.buffers || []).some(buffer => buffer.uri))
  throw new Error('The edited GLB must have embedded resources.');
const original = parse(await readFile(new URL('IronDistrict_Visual.glb', source)));
const matrices = {};
function walk(index, parent = new THREE.Matrix4()) {
  const node = original.nodes[index];
  const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
    new THREE.Vector3(...(node.translation || [0, 0, 0])),
    new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
    new THREE.Vector3(...(node.scale || [1, 1, 1])),
  );
  const world = parent.clone().multiply(local);
  matrices[node.name] = world.toArray();
  for (const child of node.children || []) walk(child, world);
}
for (const index of original.scenes[original.scene || 0].nodes) walk(index);
await mkdir(destination, { recursive: true });
await copyFile(new URL('IronDistrictSource.glb', source), new URL('IronDistrictSource.glb', destination));
for (const name of ['IronDistrict_Metadata.json', 'IronDistrict_README.md', 'LICENSES.md'])
  await copyFile(new URL(name, source), new URL(name, destination));
await writeFile(new URL('original-transforms.json', destination), JSON.stringify(matrices));
const outputs = [];
for (const path of ['IronDistrictSource.glb', 'IronDistrict_Metadata.json', 'IronDistrict_README.md', 'LICENSES.md', 'original-transforms.json'])
  outputs.push({ path, sha256: digest(await readFile(new URL(path, destination))) });
const receipt = { schema: 1, source: 'User-supplied IRONMAP.rar / edited IronDistrictSource.glb',
  license: 'LICENSES.md: original project assets; use, editing and redistribution with this project authorized.',
  archiveSha256: digest(await readFile(new URL('../../IRONMAP.rar', import.meta.url))),
  editedSourceSha256: digest(edited), verifiedOriginalRoster: verified, outputs,
  collisionPolicy: 'Build from edited RIDE and corresponding VIS geometry; exclude stale COL objects.',
};
await writeFile(new URL('integration-receipt.json', destination), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ verifiedFiles: verified.length, editedSourceSha256: digest(edited),
  sourceNodes: editedJson.nodes.length, destination: destination.pathname }));
