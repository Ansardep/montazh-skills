// node render.mjs stills 1 4.5 10   -> frames/still_1.jpg ... (проверить кадры)
// node render.mjs sheet [шаг]        -> frames/sheet.jpg — раскадровка всего ролика одним листом (шаг 0.5 с)
// node render.mjs full               -> out/video.mp4 (готовый ролик с голосом, звуками и музыкой)
// node render.mjs full 12            -> только первые 12 секунд (быстрая проверка)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const [mode = 'stills', ...args] = process.argv.slice(2);
const FPS = 30, PAGES = 3;
fs.mkdirSync('frames', { recursive: true }); fs.mkdirSync('out', { recursive: true });
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(f => fs.existsSync(f));
if (!CHROME) { console.error('Не нашёл Google Chrome. Установи его с google.com/chrome и запусти снова.'); process.exit(1); }
// у каждого потока свой Chrome: несколько вкладок в одном браузере зависают на скриншотах
const browsers = [];
const open = async () => {
  const b = await puppeteer.launch({ headless: true, executablePath: CHROME, protocolTimeout: 120000, args: ['--allow-file-access-from-files',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  browsers.push(b);
  const p = await b.newPage();
  await p.setViewport({ width: 1080, height: 1920 });
  p.on('pageerror', e => console.error('Ошибка на странице:', e.message));
  await p.goto('file://' + path.resolve('video.html'), { waitUntil: 'networkidle0' });
  await p.evaluate(() => window.READY);
  return p;
};
const shot = (p, t, file, q = 90) => p.evaluate(t => render(t), t).then(() => p.screenshot({ path: file, type: 'jpeg', quality: q }));

const page = await open();
const { DUR, SFX, MIX } = await page.evaluate(() => ({ DUR: window.DUR, SFX: window.SFX, MIX: window.MIX || {} }));
const music = ['media/music.mp3', 'a/music/drone.mp3', 'a/music/drone.wav'].find(f => fs.existsSync(f)) || null;

if (mode === 'stills') {
  for (const t of args.map(Number)) await shot(page, t, `frames/still_${t}.jpg`);
  console.log('Кадры в папке frames/');
} else if (mode === 'sheet') {
  const step = +(args[0] || 0.5), ts = [];
  for (let t = 0.05; t < DUR; t += step) ts.push(+t.toFixed(2));
  fs.readdirSync('frames').filter(f => f.startsWith('sh_')).forEach(f => fs.rmSync('frames/' + f));
  for (let i = 0; i < ts.length; i++) await shot(page, ts[i], `frames/sh_${String(i).padStart(3, '0')}.jpg`, 70);
  const cols = 8, rows = Math.ceil(ts.length / cols);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', '1', '-i', 'frames/sh_%03d.jpg', '-vf',
    `scale=216:384,tile=${cols}x${rows}:padding=4:color=white`,
    '-frames:v', '1', 'frames/sheet.jpg'], { stdio: 'inherit' });
  console.log(`Раскадровка: frames/sheet.jpg — ${ts.length} кадров, по ${cols} в ряд, шаг ${step} с (кадр N = ${step}·N с)`);
} else {
  const dur = args[0] ? +args[0] : DUR, n = Math.round(dur * FPS);
  fs.readdirSync('frames').filter(f => /^f\d/.test(f)).forEach(f => fs.rmSync('frames/' + f));
  const pages = [page, ...await Promise.all(Array.from({ length: PAGES - 1 }, open))];
  let done = 0;
  await Promise.all(pages.map(async (p, k) => {
    for (let i = k; i < n; i += PAGES) {
      await shot(p, i / FPS, `frames/f${String(i).padStart(5, '0')}.jpg`);
      if (++done % 30 === 0) process.stdout.write(`\rкадры: ${Math.round(done / n * 100)}%`);
    }
  }));
  console.log('\nсклеиваю видео и звук…');
  const inA = [], flt = [], mix = [];
  let k = 1, voice = null;
  const vf = ['media/voice.mp3', 'media/voice.wav', 'media/voice.m4a'].find(f => fs.existsSync(f));
  // голос: срезаем гул, сжимаем компрессором — он всегда впереди музыки и эффектов
  if (vf) {
    inA.push('-i', vf); voice = k++;
    flt.push(`[${voice}:a]highpass=f=70,acompressor=threshold=0.08:ratio=3.5:attack=5:release=150:makeup=2.5,volume=${MIX.voice ?? 1}[vproc]`);
  }
  if (music) {
    inA.push('-stream_loop', '-1', '-i', music);
    const mv = MIX.music ?? (music.startsWith('a/') ? 0.16 : 0.06);
    flt.push(`[${k}:a]volume=${mv},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, dur - 1.5).toFixed(2)}:d=1.5[mraw]`);
    if (voice) {
      flt.push(`[vproc]asplit=2[vo][vk]`);
      flt.push(`[mraw][vk]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=400[mu]`);
      mix.push('[vo]');
    }
    mix.push(voice ? '[mu]' : '[mraw]'); k++;
  } else if (voice) mix.push('[vproc]');
  SFX.filter(([t, name]) => t >= 0 && t < dur && fs.existsSync(`a/sfx/${name}.wav`)).forEach(([t, name, vol]) => {
    inA.push('-i', `a/sfx/${name}.wav`);
    flt.push(`[${k}:a]adelay=${Math.round(t * 1000)}:all=1,volume=${vol}[s${k}]`); mix.push(`[s${k}]`); k++;
  });
  const a = ['-y', '-framerate', String(FPS), '-i', 'frames/f%05d.jpg', ...inA];
  if (mix.length) {
    flt.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,atrim=0:${dur},loudnorm=I=-14:TP=-1.5,alimiter=limit=0.9[aout]`);
    fs.writeFileSync('frames/filter.txt', flt.join(';\n'));
    // ffmpeg 7+: «-/filter_complex файл», старые версии: «-filter_complex_script файл»
    const major = +(execFileSync('ffmpeg', ['-version']).toString().match(/ffmpeg version n?(\d+)/)?.[1] || 7);
    a.push(major >= 7 ? '-/filter_complex' : '-filter_complex_script', 'frames/filter.txt', '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  }
  a.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-t', String(dur), '-movflags', '+faststart', 'out/video.mp4');
  execFileSync('ffmpeg', a, { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('Готово: out/video.mp4');
}
await Promise.all(browsers.map(b => b.close()));
