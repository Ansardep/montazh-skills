// node render.mjs stills 2 7.5 12   -> work/still_*.jpg (готовые кадры: спикер + схема + субтитры)
// node render.mjs full              -> out/готово.mp4
// Нужны: media/cut.mp4 (видео после «Чистой нарезки») и work/subs.json (субтитры оттуда же).
// Музыка (по желанию): node music.mjs <секунды> -> work/music.wav, или свой файл media/music.mp3. Громкость: MUSIC=0.08 node render.mjs full
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const [mode = 'stills', ...args] = process.argv.slice(2);
const FPS = 30, PAGES = 3, SRC = 'media/cut.mp4';
fs.mkdirSync('work', { recursive: true }); fs.mkdirSync('out', { recursive: true });
const subs = fs.existsSync('work/subs.json') ? JSON.parse(fs.readFileSync('work/subs.json', 'utf8')).subs : [];
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(f => fs.existsSync(f));
if (!CHROME) { console.error('Не нашёл Google Chrome. Установи его с google.com/chrome и запусти снова.'); process.exit(1); }
const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--allow-file-access-from-files'] });
const open = async () => {
  const p = await browser.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  p.on('pageerror', e => console.error('Ошибка на странице:', e.message));
  await p.evaluateOnNewDocument(s => { window.SUBS = s; }, subs);
  await p.goto('file://' + path.resolve('video.html'), { waitUntil: 'networkidle0' });
  await p.evaluate(() => document.fonts.ready);
  return p;
};
const page = await open();
const { DUR, SFX, LAYOUT, CROP, WIN } = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('panel'));
  return { DUR: window.DUR, SFX: window.SFX, LAYOUT: window.LAYOUT, CROP: document.body.dataset.crop || '90,560,900',
    WIN: ['left', 'top', 'width', 'height'].map(k => Math.round(parseFloat(cs[k]))) };
});

// окно спикера: кусок исходного кадра [x, y, ширина] (высоту подбираем под пропорции окна) -> в окно на экране
const [wx, wy, ww, wh] = WIN, [cx, cy, cw] = CROP.split(',').map(Number), ch = Math.round(cw * wh / ww / 2) * 2;
const small = `crop=${cw}:${ch}:${cx}:${cy},scale=${ww}:${wh}`;
const fullAt = t => (LAYOUT.find(l => t >= l[0] && t < l[1]) || [0, 0, 'split'])[2] === 'full';
const fullExpr = LAYOUT.filter(l => l[2] === 'full').map(l => `between(t,${l[0]},${l[1]})`).join('+') || '0';

const shot = async (p, t, file) => { await p.evaluate(t => render(t), t); await p.screenshot({ path: file, omitBackground: true }); };

if (mode === 'stills') {
  for (const t of args.map(Number)) {
    await shot(page, t, 'work/_ov.png');
    const base = fullAt(t) ? '[0:v]scale=1080:1920[b]' : `[0:v]${small}[sm];color=black:s=1080x1920[bk];[bk][sm]overlay=${wx}:${wy}:shortest=1[b]`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', SRC, '-i', 'work/_ov.png', '-filter_complex',
      `${base};[b][1:v]overlay`, '-frames:v', '1', `work/still_${t}.jpg`]);
  }
  console.log('Кадры: work/still_*.jpg');
} else {
  const n = Math.round(DUR * FPS);
  fs.rmSync('work/ov', { recursive: true, force: true }); fs.mkdirSync('work/ov', { recursive: true });
  const pages = [page, ...await Promise.all(Array.from({ length: PAGES - 1 }, open))];
  let done = 0;
  await Promise.all(pages.map(async (p, k) => {
    for (let i = k; i < n; i += PAGES) {
      await shot(p, i / FPS, `work/ov/o${String(i).padStart(5, '0')}.png`);
      if (++done % 30 === 0) process.stdout.write(`\rграфика: ${Math.round(done / n * 100)}%`);
    }
  }));
  console.log('\nсклеиваю…');
  const inA = [], mix = ['[va]'], flt = ['[0:a]asplit=2[va][vk]'];
  let k = 2;
  // фоновая музыка: media/music.mp3 (своя) или work/music.wav (из music.mjs); тихо и приглушается, когда звучит голос
  const music = ['media/music.mp3', 'media/music.wav', 'work/music.wav'].find(f => fs.existsSync(f));
  if (music) {
    inA.push('-stream_loop', '-1', '-i', music);
    flt.push(`[${k}:a]volume=${process.env.MUSIC || 0.12},afade=t=in:d=1,afade=t=out:st=${(DUR - 1.5).toFixed(2)}:d=1.5[mu0]`,
      `[mu0][vk]sidechaincompress=threshold=0.02:ratio=4:attack=30:release=400[mu]`);
    mix.push('[mu]'); k++;
  } else flt.push('[vk]anullsink');
  SFX.filter(([t, name]) => t >= 0 && t < DUR && fs.existsSync(`a/sfx/${name}.wav`)).forEach(([t, name, vol]) => {
    inA.push('-i', `a/sfx/${name}.wav`); flt.push(`[${k}:a]adelay=${Math.round(t * 1000)}:all=1,volume=${vol}[s${k}]`); mix.push(`[s${k}]`); k++;
  });
  flt.push(`[0:v]split=2[f][s]`, `[s]${small}[sm]`, `color=black:s=1080x1920:r=${FPS}:d=${DUR}[bk]`, `[bk][sm]overlay=${wx}:${wy}:shortest=1[base]`,
    `[base][f]overlay=0:0:enable='${fullExpr}'[v1]`, `[v1][1:v]overlay[v]`,
    `${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5[a]`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', SRC, '-framerate', String(FPS), '-i', 'work/ov/o%05d.png', ...inA,
    '-filter_complex', flt.join(';'), '-map', '[v]', '-map', '[a]', '-t', String(DUR),
    '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out/готово.mp4'],
    { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.rmSync('work/ov', { recursive: true, force: true });
  console.log('Готово: out/готово.mp4');
}
await browser.close();
