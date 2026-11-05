import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TRACKS } from '../src/game/MusicPlayer.js';

// The build manifest and runtime shuffle bag use the same original seven files.
const root = join(process.cwd(), 'public', 'media');
const tracks = TRACKS.map(([title, filename]) => {
  if (statSync(join(root, filename)).size < 1024) throw new Error('Missing soundtrack: ' + filename);
  return { title, src: '/media/' + filename };
});
writeFileSync(join(root, 'playlist.json'), JSON.stringify({ tracks }, null, 2) + '\n');
console.log('Soundtrack manifest:', tracks.length, 'original MP3 tracks');
