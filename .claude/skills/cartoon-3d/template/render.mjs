// node render.mjs plan              -> проверить тайминг реплик (ничего не рисует)
// node render.mjs stills 2 6.5 12   -> out/still_2.jpg ... (проверить кадры)
// node render.mjs full              -> out/мультик.mp4 (готовый мультик 1080×1920 со звуком и субтитрами)
// Всё описание мультика — в script.json.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const [mode = 'plan', ...args] = process.argv.slice(2);
const SC = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const FPS = SC.fps || 30, [W, H] = SC.size || [720, 1280], GAP = SC.gap ?? 0.3, SR = 16000;
fs.mkdirSync('out', { recursive: true });

const probe = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const pcm = (f, a, b) => {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(a), '-to', String(b), '-i', f, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
};

// ---------- 1. тайминг реплик ----------
let t = 0.3, last = null;
const lines = SC.lines.map(L => {
  const a = L.from ?? 0, b = L.to ?? probe(L.audio), d = b - a;
  const t0 = L.overlap !== undefined && last ? last.t0 + L.overlap : t;
  const e = Object.assign({}, L, { a, b, t0, t1: t0 + d });
  if (L.overlap === undefined) { t = t0 + d + GAP; last = e; }
  return e;
});
const TOT = Math.max(...lines.map(e => e.t1)) + (SC.tail ?? 1.6), N = Math.round(TOT * FPS);
const ids = SC.heroes.map(h => h.id), names = Object.fromEntries(SC.heroes.map(h => [h.id, h.name || '']));

// ---------- 2. рот по громкости голоса ----------
const env = {}; ids.forEach(id => env[id] = new Float32Array(N));
for (const e of lines) {
  const x = pcm(e.audio, e.a, e.b), hop = SR / FPS;
  for (let i = 0; i * hop < x.length; i++) {
    let s = 0, n = 0; for (let k = Math.floor(i * hop); k < Math.min(x.length, (i + 1) * hop); k++) { s += x[k] * x[k]; n++ }
    const f = Math.round(e.t0 * FPS) + i; if (f < N) env[e.who][f] = Math.max(env[e.who][f], Math.sqrt(s / (n || 1)));
  }
}
for (const id of ids) {
  const r = env[id], nz = [...r].filter(v => v > 0).sort((p, q) => p - q), p95 = nz[Math.floor(nz.length * .95)] || 1;
  for (let i = 0; i < N; i++) { const v = Math.min(1, Math.max(0, (r[i] / p95 - .08) / .9)); r[i] = Math.max(v, i ? r[i - 1] * .6 : 0) }
}

// ---------- 3. кадры: камера, настроение, субтитр ----------
const subs = [];
for (const e of lines) {
  const chunks = e.subs || (e.text ? [[0, e.b - e.a, e.text]] : []);
  for (const [s, z, txt] of chunks) subs.push({ s: e.t0 + s, e: e.t0 + z, txt, who: e.who });
}
const frames = [];
for (let i = 0; i < N; i++) {
  const tt = i / FPS;
  let cur = null; for (const e of lines) if (e.shot && e.t0 - 0.3 <= tt) cur = e;
  const mood = {}, m = {};
  for (const id of ids) {
    const act = lines.find(e => e.who === id && e.t0 <= tt && tt <= e.t1 + 0.3);
    mood[id] = act ? (act.mood || 'talk') : 'idle'; m[id] = +env[id][i].toFixed(3);
  }
  for (const e of lines) if (e.everyone && tt >= e.t0) ids.forEach(id => mood[id] = e.everyone);
  const sb = subs.find(s => tt >= s.s && tt < s.e);
  frames.push({ t: +tt.toFixed(4), shot: cur ? cur.shot : 'wide', st: +(tt - (cur ? cur.t0 - 0.3 : 0)).toFixed(3), m, mood,
    sub: sb ? sb.txt : '', name: sb && SC.show_names ? names[sb.who] : '' });
}

if (mode === 'plan') {
  console.log(`Длина: ${TOT.toFixed(1)} с, кадров: ${N}`);
  for (const e of lines) console.log(`${e.t0.toFixed(2)}–${e.t1.toFixed(2)}  ${e.who.padEnd(8)} ${String(e.shot || '').padEnd(8)} ${e.mood || ''}  ${(e.subs || []).map(s => s[2]).join(' ') || e.text || ''}`);
  process.exit(0);
}

// ---------- 4. рисуем ----------
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(f => fs.existsSync(f));
if (!CHROME) { console.error('Не нашёл Google Chrome. Установи его с google.com/chrome и запусти снова.'); process.exit(1); }
const browser = await puppeteer.launch({ headless: true, executablePath: CHROME,
  args: ['--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
page.on('pageerror', e => console.error('Ошибка в сцене:', e.message));
await page.evaluateOnNewDocument(c => { window.CAST = c; }, { mode: SC.mode || 'night', heroes: SC.heroes, shots: SC.shots });
await page.goto('file://' + path.resolve('scene.html'));
await page.waitForFunction(() => document.title === 'ready', { timeout: 120000 });

if (mode === 'stills') {
  for (const s of args.map(Number)) {
    await page.evaluate(f => renderFrame(f), frames[Math.min(N - 1, Math.round(s * FPS))]);
    await page.screenshot({ path: `out/still_${s}.jpg`, type: 'jpeg', quality: 90 });
  }
  console.log('Кадры: out/still_*.jpg');
} else {
  fs.rmSync('out/frames', { recursive: true, force: true }); fs.mkdirSync('out/frames', { recursive: true });
  for (let i = 0; i < N; i++) {
    await page.evaluate(f => renderFrame(f), frames[i]);
    await page.screenshot({ path: `out/frames/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (i % 30 === 0) process.stdout.write(`\rкадры: ${Math.round(i / N * 100)}%`);
  }
  console.log('\nсклеиваю звук и видео…');
  const inA = [], flt = [];
  lines.forEach((e, k) => {
    inA.push('-i', e.audio);
    flt.push(`[${k + 1}:a]atrim=${e.a}:${e.b},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,adelay=${Math.round(e.t0 * 1000)}:all=1,volume=${e.volume ?? 1}[a${k}]`);
  });
  flt.push(`${lines.map((_, k) => `[a${k}]`).join('')}amix=inputs=${lines.length}:normalize=0:duration=longest,apad,atrim=0:${TOT.toFixed(3)},loudnorm=I=-14:TP=-1.5[aout]`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', 'out/frames/f%05d.jpg', ...inA, '-filter_complex', flt.join(';'),
    '-map', '0:v', '-map', '[aout]', '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-t', TOT.toFixed(3), '-movflags', '+faststart', 'out/мультик.mp4'], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('Готово: out/мультик.mp4');
}
await browser.close();
