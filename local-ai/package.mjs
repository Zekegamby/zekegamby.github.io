// Small reproducible ZIP using only Node's standard library. Source files only;
// no model weights, credentials, private data, media or development dependencies.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { ASSETS } from './server.mjs';
const root = new URL('../', import.meta.url);
const files = [...ASSETS, 'Start-Finger-Studio.cmd', 'local-ai/start.mjs', 'local-ai/server.mjs', 'local-ai/generator.mjs', 'local-ai/README.md'];
const table = Array.from({ length: 256 }, (_, n) => { for (let i = 0; i < 8; i++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = bytes => { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
let offset = 0; const local = [], central = [];
for (const path of files) {
  let data = await readFile(new URL(path, root));
  if (path.endsWith('.cmd')) data = Buffer.from(data.toString().replace(/\r?\n/g, '\r\n'));
  const name = Buffer.from(`Finger-Studio/${path}`), compressed = deflateRawSync(data), crc = crc32(data);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(0x21, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
  local.push(header, name, compressed);
  const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8); entry.writeUInt16LE(8, 10); entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
  central.push(entry, name); offset += header.length + name.length + compressed.length;
}
const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...local, directory, end]);
await writeFile(new URL('Finger-Studio-Local-AI.zip', import.meta.url), zip);
console.log(`Packaged ${files.length} files (${zip.length} bytes): local-ai/Finger-Studio-Local-AI.zip`);
