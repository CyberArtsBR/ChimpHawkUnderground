import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const source = new URL('../assets-source/solar/', import.meta.url);
const output = new URL('../public/assets/park/hd/', import.meta.url);
await mkdir(output, { recursive: true });
for (const asset of JSON.parse(await readFile(new URL('manifest.json', source), 'utf8'))) {
  const target = new URL(asset.file, output);
  const valid = data => createHash('sha256').update(data).digest('hex') === asset.sha256;
  const cached = await readFile(target).catch(() => null);
  if (cached && valid(cached)) continue;
  let data;
  if (asset.url) {
    // Pin the original CC0 HDRI by hash, then serve it from our own deployment.
    // Browsers never depend on a third-party CDN or its CORS configuration.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(asset.url, { signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = Buffer.from(await response.arrayBuffer());
        if (!valid(data)) throw new Error('SHA-256 mismatch');
        break;
      } catch (error) {
        if (attempt === 2) throw new Error(`Unable to prepare ${asset.file}: ${error.message}`);
      }
    }
  } else {
    const encoded = await Promise.all(asset.parts.map(part => readFile(new URL(part, source), 'utf8')));
    data = Buffer.from(encoded.join('').replace(/\s/g, ''), 'base64');
  }
  if (!valid(data)) throw new Error(`Incomplete texture: ${asset.file}`);
  await writeFile(target, data);
}
