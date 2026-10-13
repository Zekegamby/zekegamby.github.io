// Invoked by the Windows launcher. No elevation, firewall edits or public tunnel.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createStudioServer } from './server.mjs';
import { modelReady, MODEL } from './generator.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options }); child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
});
async function findOllama() {
  const candidates = process.platform === 'win32' ? [join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'), ...String(process.env.PATH || '').split(';').map(dir => join(dir.replace(/^"|"$/g, ''), 'ollama.exe'))] : String(process.env.PATH || '').split(':').map(dir => join(dir, 'ollama'));
  return candidates.find(path => existsSync(path));
}
async function reachable() { try { const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) }); return r.ok; } catch { return false; } }
let ownedOllama, server;
function cleanup() { ownedOllama?.kill(); if (server) { server.close(); server.closeAllConnections(); } }
process.on('SIGINT', cleanup); process.on('SIGTERM', cleanup);
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Please install Node.js LTS (22 or newer) from https://nodejs.org/en/download, then rerun the launcher.');
  process.env.OLLAMA_NO_CLOUD = '1';
  let ollama = await findOllama();
  if (!ollama && process.platform === 'win32') {
    console.log('Installing Ollama with Windows Package Manager. Follow any installer prompts.');
    try { await run('winget.exe', ['install', '--id', 'Ollama.Ollama', '--exact', '--source', 'winget']); } catch {}
    ollama = await findOllama();
  }
  if (!ollama) throw new Error('Install Ollama from https://ollama.com/download/windows, then run this launcher again.');
  if (!await reachable()) {
    console.log('Starting local Ollama…');
    ownedOllama = spawn(ollama, ['serve'], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NUM_PARALLEL: '1', OLLAMA_NO_CLOUD: '1' } });
    let startError; ownedOllama.on('error', error => { startError = error; });
    for (let i = 0; i < 45 && !startError && !await reachable(); i++) await sleep(1000);
    if (startError || !await reachable()) throw new Error('Ollama did not start. Open the Ollama app, then rerun this launcher.');
  }
  if (!await modelReady()) {
    console.log(`Downloading ${MODEL} (about 4.7 GB). This is a one-time model download, with no API key or usage bill.`);
    await run(ollama, ['pull', MODEL], { env: { ...process.env, OLLAMA_HOST: '127.0.0.1:11434', OLLAMA_NO_CLOUD: '1' } });
  }
  server = createStudioServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8787, '127.0.0.1', resolve); });
  console.log('\nReady: http://127.0.0.1:8787\nKeep this window open. Ctrl+C stops the studio.\nThis is a local test; your public website is unchanged.\n');
  if (process.platform === 'win32') {
    const browser = spawn('cmd.exe', ['/d', '/c', 'start', '', 'http://127.0.0.1:8787'], { stdio: 'ignore' });
    browser.on('error', () => console.log('Open http://127.0.0.1:8787 in your browser.'));
  }
} catch (error) { console.error(`\nSetup stopped: ${error.message}\n`); cleanup(); process.exitCode = 1; }
