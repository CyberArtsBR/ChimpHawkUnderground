// Rider catalog: the five original crew GLBs plus player-uploaded rigs.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RigRider } from './render/RigRider';
import { loadGlb } from './render/loadGltf';

export interface RiderEntry { id: string; name: string; subtitle: string; file: string; accent: string }

export const RIDERS: readonly RiderEntry[] = [
  { id: 'hollow', name: 'The Hollow', subtitle: 'The Phantom', file: 'thehollowf.glb', accent: '#fff151' },
  { id: 'heretic', name: 'Heretic', subtitle: 'The Executor', file: 'The_Heretic.glb', accent: '#f66e62' },
  { id: 'adolescent', name: 'Adolescent', subtitle: 'The Youngblood', file: 'The_AdolescentUR.glb', accent: '#7edcff' },
  { id: 'anchor', name: 'Anchor', subtitle: 'The Wizard', file: 'The_Anchor.glb', accent: '#c8f17f' },
  { id: 'tuxr', name: 'Tuxr', subtitle: 'The Mastermind', file: 'TuxR.glb', accent: '#cc94ff' },
];

export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

export function readRiderId(): string {
  try { return localStorage.getItem('chimphawk.rider') || 'hollow'; } catch { return 'hollow'; }
}
export function saveRiderId(id: string): void {
  try { localStorage.setItem('chimphawk.rider', id); } catch { /* ignore */ }
}

export async function loadCatalogRider(entry: RiderEntry): Promise<RigRider> {
  const gltf = await loadGlb(import.meta.env.BASE_URL + 'assets/riders/' + entry.file);
  return new RigRider(gltf.scene);
}

/**
 * Load a player's own rigged GLB. Any humanoid skeleton works as long as the
 * legs can be identified (Mixamo, Unreal, Rigify export and similar names).
 * Throws a readable error otherwise.
 */
export async function loadUploadedRider(file: File): Promise<RigRider> {
  if (!/\.glb$/i.test(file.name)) throw new Error('Choose a .glb file (binary glTF).');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That file is over 40 MB. Export a lighter version.');
  const data = await file.arrayBuffer();
  const loader = new GLTFLoader();
  // Uploaded files must be self-contained: no external texture/buffer requests.
  loader.manager.setURLModifier(url => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    throw new Error('The GLB references external files. Export with "embed textures" enabled.');
  });
  const gltf = await loader.parseAsync(data, '');
  let skinned = false;
  gltf.scene.traverse(o => { if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true; });
  if (!skinned) throw new Error('No skinned mesh found. Upload a rigged character (armature + skin weights).');
  return new RigRider(gltf.scene);
}
