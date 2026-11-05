// GLB loading. Large maps ship pre-gzipped (.glb.gz) and are inflated in the
// browser with DecompressionStream, so any static host can serve them.
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const isGlb = (data: ArrayBuffer) => data.byteLength >= 12 && new DataView(data).getUint32(0, true) === 0x46546c67;

export async function fetchGlb(url: string, onProgress?: (fraction: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status})`);
  const total = Number(response.headers.get('content-length')) || 0;
  let data: ArrayBuffer;
  if (response.body && total && onProgress) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onProgress(Math.min(1, received / total));
    }
    const joined = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    data = joined.buffer;
  } else {
    data = await response.arrayBuffer();
  }
  // Some hosts already decode gzip transparently; only inflate when needed.
  if (!isGlb(data) && url.split('?')[0].endsWith('.gz')) {
    data = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  if (!isGlb(data)) throw new Error(`${url} is not a GLB file`);
  return data;
}

export async function loadGlb(url: string, onProgress?: (fraction: number) => void): Promise<GLTF> {
  const data = await fetchGlb(url, onProgress);
  return loader.parseAsync(data, '');
}
