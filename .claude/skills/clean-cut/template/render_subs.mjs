// node render_subs.mjs           -> out/готово.mp4 (нарезка + субтитры, громкость под Reels)
// node render_subs.mjs still 2.5 -> work/still_2.5.png (проверить кадр с субтитром)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const [mode, ...ts] = process.argv.slice(2);
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(f => fs.existsSync(f));
if (!CHROME) { console.error('Не нашёл Google Chrome. Установи его с google.com/chrome и запусти снова.'); process.exit(1); }
const { duration, subs } = JSON.parse(fs.readFileSync('work/subs.json', 'utf8'));
fs.mkdirSync('work/subframes', { recursive: true }); fs.mkdirSync('out', { recursive: true });

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920 });
await page.goto('file://' + path.resolve('subs.html'), { waitUntil: 'networkidle0' });
await page.evaluate(s => { window.SUBS = s; }, subs);
await page.evaluate(() => document.fonts.ready);

if (mode === 'still') {
  for (const t of ts.map(Number)) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', 'work/cut.mp4', '-frames:v', '1', 'work/_bg.png']);
    await page.evaluate(t => render(t), t);
    await page.screenshot({ path: 'work/_sub.png', omitBackground: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'work/_bg.png', '-i', 'work/_sub.png', '-filter_complex', 'overlay', `work/still_${t}.png`]);
  }
  console.log('Кадры: work/still_*.png');
} else {
  fs.readdirSync('work/subframes').forEach(f => fs.rmSync('work/subframes/' + f));
  const n = Math.round(duration * 30);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => render(t), i / 30);
    await page.screenshot({ path: `work/subframes/s${String(i).padStart(5, '0')}.png`, omitBackground: true });
    if (i % 30 === 0) process.stdout.write(`\rсубтитры: ${Math.round(i / n * 100)}%`);
  }
  console.log('\nсклеиваю…');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'work/cut.mp4', '-framerate', '30', '-i', 'work/subframes/s%05d.png',
    '-filter_complex', '[0:v][1:v]overlay=eof_action=pass[v];[0:a]loudnorm=I=-14:TP=-1.5[a]', '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', 'out/готово.mp4']);
  console.log('Готово: out/готово.mp4');
}
await browser.close();
