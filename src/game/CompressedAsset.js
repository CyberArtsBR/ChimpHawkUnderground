// Optional lossless delivery for large original GLBs. Originals remain a
// fallback when the browser lacks streaming gzip or the host cannot serve .gz.
// Decoded geometry, hierarchy, materials, textures and collision are identical.
export async function fetchCompressedGlb(optimizedUrl, originalUrl, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  const Stream = options.DecompressionStream ?? globalThis.DecompressionStream;
  const signal = options.signal;
  const load = async url => {
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error(`Asset unavailable: ${url} (HTTP ${response.status})`);
    return response;
  };
  const isGlb = data => data.byteLength >= 12 && new DataView(data).getUint32(0, true) === 0x46546c67;
  if (typeof Stream === 'function') {
    try {
      const response = await load(optimizedUrl);
      let data = await response.arrayBuffer();
      // Some hosts may transparently decode with Content-Encoding: gzip.
      if (!isGlb(data)) {
        data = await new Response(new Blob([data]).stream().pipeThrough(new Stream('gzip'))).arrayBuffer();
      }
      if (!isGlb(data)) throw new Error('Compressed asset did not contain a GLB');
      return data;
    } catch (error) {
      if (signal?.aborted) throw error;
      // A stale CDN, unavailable codec, corrupt file or unsupported host falls
      // back to the untouched source instead of blocking entry to the park.
    }
  }
  const response = await load(originalUrl);
  const data = await response.arrayBuffer();
  if (!isGlb(data)) throw new Error(`Invalid GLB: ${originalUrl}`);
  return data;
}
