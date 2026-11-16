// Движок «Красный коллаж». Не трогать без нужды: ролик описывается в video.html.
// render(t) рисует кадр на секунде t. window.DUR — длина, window.SFX — звуки [[сек, файл, громкость]].
(() => {
const clamp = x => Math.min(Math.max(x, 0), 1);
const ease = x => 1 - Math.pow(1 - clamp(x), 3);
const inout = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const spring = x => { x = clamp(x); return 1 - Math.cos(x * 4.6) * Math.exp(-x * 6); };
const num = (v, d = 0) => v === undefined || v === '' || v === null ? d : +v;
const list = s => (s || '').split(/[\s,]+/).filter(Boolean).map(Number);
const ranges = s => (s || '').split(',').map(r => r.trim()).filter(Boolean).map(r => r.split('-').map(Number));
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

const SFX = [];
const sfx = (t, name, vol) => { if (name && name !== 'none') SFX.push([+Math.max(0, t).toFixed(3), name, vol ?? 0.12]); };

// ---------- общие наложения и фильтры ----------
const defs = svgEl('svg', { width: 0, height: 0, style: 'position:absolute' });
defs.innerHTML = `<defs>
  <filter id="chalkf" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="3" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d"/>
    <feComposite in="d" in2="n" operator="arithmetic" k1="0" k2="1" k3="-0.35" k4="0.1"/>
  </filter></defs>`;
document.body.prepend(defs);
const fx = document.createElement('div'); fx.id = 'fx';
fx.innerHTML = '<div id="dust"></div><div id="grain"></div><div id="scan"></div><div id="vignette"></div><div id="tunnel"></div><div id="flash"></div>';
document.body.appendChild(fx);
const $ = id => document.getElementById(id);
const dustN = num(document.body.dataset.dust, 34), R0 = rng(11);
const dust = Array.from({ length: dustN }, (_, k) => {
  const i = document.createElement('i'); if (k % 5 === 0) i.className = 's'; $('dust').appendChild(i);
  return { el: i, x: R0() * 1080, y: R0() * 1920, vx: (R0() - .5) * 30, vy: -20 - R0() * 50, a: .25 + R0() * .6, ph: R0() * 6 };
});

// ---------- подготовка сцен ----------
const scenes = [...document.querySelectorAll('.scene')];
scenes.forEach((sc, si) => {
  const d = sc.dataset;
  sc.s = num(d.s); sc.e = num(d.e, sc.s + 2);
  const bg = document.createElement('div'); bg.className = 'bg ' + (d.bg || 'red');
  if (d.img) { bg.style.backgroundImage = `url(${d.img})`; bg.classList.add('photo'); }
  const cam = document.createElement('div'); cam.className = 'cam';
  [...sc.childNodes].forEach(n => cam.appendChild(n));
  sc.append(bg, cam); sc.cam = cam;
  sc.hits = list(d.hit); sc.shakes = list(d.shake).concat(sc.hits); sc.glitch = ranges(d.glitch);
  const tr = d.tr || 'cut';
  if (si > 0) {
    const auto = { cut: ['swish', .10], flash: ['flash', .28], invert: ['flash', .3], glitch: ['glitch', .2], zoom: ['whoosh', .22], fade: [null] }[tr] || ['swish', .1];
    sfx(sc.s - 0.06, d.sfx || auto[0], num(d.vol, auto[1]));
    if (tr === 'invert') sfx(sc.s, 'glitch', .14);
  }
  if (d.end === 'tunnel') sfx(sc.e - 0.75, 'suck', .4);
  sc.hits.forEach(h => sfx(sc.s + h, d.hitsfx || 'boom', num(d.hitvol, .5)));
  sc.glitch.forEach(([a]) => sfx(sc.s + a, 'glitch', .18));

  // текст по словам
  sc.querySelectorAll('.cap').forEach(cap => {
    const times = list(cap.dataset.w), t0 = num(cap.dataset.at, 0.05);
    const lines = cap.innerHTML.split('|').map(x => x.trim());
    let k = 0, acc = false, sm = false;
    cap.innerHTML = lines.map(ln => '<span class="ln">' + ln.split(/\s+/).filter(Boolean).map(tok => {
      if (tok.startsWith('*')) { acc = true; tok = tok.slice(1); }
      if (tok.startsWith('_')) { sm = true; tok = tok.slice(1); }
      const endA = /\*[.,!?:;]*$/.test(tok), endS = /_[.,!?:;]*$/.test(tok);
      tok = tok.replace(/[*_]+([.,!?:;]*)$/, '$1');
      let cls = 'w' + (acc ? ' acc' : '') + (sm ? ' sm' : '');
      if (endA) acc = false; if (endS) sm = false;
      const t = times[k] ?? (t0 + k * 0.18); k++;
      return `<span class="${cls}" data-t="${t}">${tok}</span>`;
    }).join(' ') + '</span>').join('');
    if (cap.classList.contains('cloud')) {
      const pos = (cap.dataset.pos || '').trim().split(/\s+/).filter(Boolean).map(p => p.split(',').map(Number));
      const R = rng(si * 7 + 3), ws = [...cap.querySelectorAll('.w')];
      const cx = num(cap.dataset.cx, 540), cy = num(cap.dataset.cy, 720), rx = num(cap.dataset.rx, 360), ry = num(cap.dataset.ry, 470);
      ws.forEach((w, i) => {
        const a = (i / ws.length) * Math.PI * 2 - Math.PI / 2 + (R() - .5) * .5;
        const [x, y, size] = pos[i] || [cx + Math.cos(a) * rx * (.8 + R() * .3), cy + Math.sin(a) * ry * (.8 + R() * .3), [48, 64, 84][i % 3]];
        Object.assign(w.style, { left: x + 'px', top: y + 'px', fontSize: size + 'px' });
        w.ph = R() * 6;
      });
    }
  });

  // красный пунктир, который рисуется
  sc.querySelectorAll('svg.marks').forEach(svg => {
    svg.setAttribute('viewBox', '0 0 1080 1920');
    const md = svgEl('defs'); svg.prepend(md);
    [...svg.querySelectorAll('path')].forEach((p, j) => {
      const id = `mk${si}_${j}_${Math.round(R0() * 1e6)}`;
      const m = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -200, y: -200, width: 1480, height: 2320 });
      const mp = svgEl('path', { d: p.getAttribute('d'), fill: 'none', stroke: '#fff', 'stroke-width': 40, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-linecap': 'round' });
      m.appendChild(mp); md.appendChild(m);
      p.setAttribute('mask', `url(#${id})`);
      if (!p.classList.contains('solid')) p.setAttribute('stroke-dasharray', p.dataset.dash || '16 16');
      p.mp = mp;
      p.tin = num(p.dataset.in, num(svg.dataset.in) + j * num(svg.dataset.step, 0.12));
      p.tdur = num(p.dataset.dur, num(svg.dataset.dur, 0.45));
    });
    if (svg.dataset.sfx) sfx(sc.s + num(svg.dataset.in), svg.dataset.sfx, num(svg.dataset.vol, .12));
  });

  // мел: обводка, стрелка, подчёркивание, зачёркивание
  sc.querySelectorAll('svg.chalk').forEach(svg => {
    const W = parseFloat(svg.style.width) || 400, H = parseFloat(svg.style.height) || 200;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.overflow = 'visible';
    const shape = svg.dataset.shape || 'ellipse', R = rng(si * 13 + W);
    const paths = [];
    const ell = () => {
      let s = ''; const n = 48, cx = W / 2, cy = H / 2;
      for (let i = 0; i <= n; i++) {
        const a = -Math.PI * .6 + (i / n) * Math.PI * 2.15, w = 1 + (R() - .5) * .04 + i / n * .05;
        s += (i ? 'L' : 'M') + (cx + Math.cos(a) * W / 2 * w).toFixed(1) + ' ' + (cy + Math.sin(a) * H / 2 * w).toFixed(1);
      }
      return s;
    };
    if (shape.includes('ellipse')) paths.push(ell());
    if (shape.includes('arrow')) { // стрелка снизу справа, загибается к фигуре
      const x0 = W * .95, y0 = H * 1.9, x1 = W * .78, y1 = H * 1.05;
      paths.push(`M${x0} ${y0} C ${W * 1.25} ${H * 1.5}, ${W * 1.1} ${H * 1.1}, ${x1} ${y1}`);
      paths.push(`M${x1 + 44} ${y1 + 6} L${x1} ${y1} L${x1 + 14} ${y1 + 42}`);
    }
    if (shape === 'underline') paths.push(`M0 ${H * .5} C ${W * .3} ${H * .3}, ${W * .7} ${H * .7}, ${W} ${H * .45}`);
    if (shape === 'strike') paths.push(`M0 ${H * .55} L${W} ${H * .45}`);
    if (shape === 'x') { paths.push(`M0 0 L${W} ${H}`); paths.push(`M${W} 0 L0 ${H}`); }
    let t = num(svg.dataset.in);
    paths.forEach((dd, j) => {
      const p = svgEl('path', { d: dd, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
      p.tin = t; p.tdur = j === 0 ? num(svg.dataset.dur, .5) : .22; t += p.tdur; svg.appendChild(p);
    });
    sfx(sc.s + num(svg.dataset.in), svg.dataset.sfx || 'paper', num(svg.dataset.vol, .16));
  });

  // кресты и штрихи по краям
  sc.querySelectorAll('.crosses').forEach(box => {
    const R = rng(num(box.dataset.seed, si * 31 + 5)), n = num(box.dataset.n, 6);
    for (let i = 0; i < n; i++) {
      const s = 90 + R() * 130, side = i % 4;
      const x = side === 0 ? R() * 220 : side === 1 ? 860 + R() * 200 - s / 2 : R() * 1000;
      const y = side < 2 ? 200 + R() * 1500 : (side === 2 ? R() * 380 : 1500 + R() * 380);
      const svg = svgEl('svg', { viewBox: `0 0 ${s} ${s}`, width: s, height: s });
      svg.style.left = x + 'px'; svg.style.top = y + 'px'; svg.style.transform = `rotate(${(R() - .5) * 30}deg)`;
      const type = ['x', 'hash', 'plus'][Math.floor(R() * 3)];
      const L = type === 'x' ? [`M0 0 L${s} ${s}`, `M${s} 0 L0 ${s}`] : type === 'plus' ? [`M${s / 2} 0 L${s / 2} ${s}`, `M0 ${s / 2} L${s} ${s / 2}`]
        : [`M${s * .3} 0 L${s * .3} ${s}`, `M${s * .7} 0 L${s * .7} ${s}`, `M0 ${s * .35} L${s} ${s * .35}`, `M0 ${s * .7} L${s} ${s * .7}`];
      L.forEach((dd, j) => { const p = svgEl('path', { d: dd, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }); p.tin = num(box.dataset.in) + i * num(box.dataset.step, .07) + j * .05; p.tdur = .14; svg.appendChild(p); });
      box.appendChild(svg);
    }
    sfx(sc.s + num(box.dataset.in), box.dataset.sfx || 'paper', num(box.dataset.vol, .12));
  });

  // счётчик
  sc.querySelectorAll('.count').forEach(el => {
    const a = num(el.dataset.in), dur = num(el.dataset.dur, 1.6);
    for (let x = 0; x < dur; x += 0.12) sfx(sc.s + a + x, 'tick', .06);
  });
  // буквы, которые разлетаются / слетаются
  sc.querySelectorAll('.scatter').forEach(el => {
    const R = rng(si * 17 + 9);
    el.innerHTML = [...el.textContent.trim()].map(ch => `<i>${ch === ' ' ? '&nbsp;' : ch}</i>`).join('');
    [...el.children].forEach(i => { i.v = [(R() - .5) * 900, (R() - .5) * 700, (R() - .5) * 120, .6 + R() * .9]; });
    sfx(sc.s + num(el.dataset.in), el.dataset.sfx || 'whoosh', num(el.dataset.vol, .16));
  });
  sc.querySelectorAll('.flip').forEach(el => {
    const ts = list(el.dataset.t);
    ts.forEach((t, j) => j && sfx(sc.s + t, el.dataset.sfx || 'paper', num(el.dataset.vol, .14)));
  });
  sc.querySelectorAll('.split').forEach(el => sfx(sc.s + num(el.dataset.in), el.dataset.sfx || 'impact', num(el.dataset.vol, .45)));
  sc.querySelectorAll('.orbit').forEach(el => {
    [...el.children].forEach((c, j) => { const tin = num(el.dataset.in) + j * num(el.dataset.step, .08); c.dataset.oin = tin; if (el.dataset.sfx) sfx(sc.s + tin, el.dataset.sfx, num(el.dataset.vol, .1)); });
  });
  sc.querySelectorAll('.clock[data-tick]').forEach(el => { for (let x = num(el.dataset.in); x < sc.e - sc.s; x += .5) sfx(sc.s + x, 'tick', .1); });
  sc.querySelectorAll('.ribbon').forEach(el => {
    const svg = svgEl('svg', { class: 'band', viewBox: '0 0 1160 520', preserveAspectRatio: 'none' });
    const gid = 'rg' + si + Math.round(R0() * 1e6);
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b31a22"/><stop offset=".45" stop-color="#7d0f15"/><stop offset="1" stop-color="#4a070b"/></linearGradient></defs><path fill="url(#${gid})"/><path class="hl" fill="none" stroke="rgba(255,190,180,.35)" stroke-width="4"/>`;
    el.prepend(svg); el.band = svg;
    if (el.dataset.in !== undefined) sfx(sc.s + num(el.dataset.in), el.dataset.sfx || 'whoosh', num(el.dataset.vol, .2));
  });
  // звуки на появлении
  sc.querySelectorAll('[data-in]').forEach(el => {
    if (el.matches('svg.marks,svg.chalk,.crosses,.scatter,.split,.ribbon,.orbit')) return;
    const from = el.dataset.from;
    const name = el.dataset.sfx || (from && from !== 'scale' && from !== 'fade' ? 'swish' : null);
    sfx(sc.s + num(el.dataset.in), name, num(el.dataset.vol, from === 'slam' ? .4 : .09));
  });
  // базовый transform из CSS, чтобы анимация его не стирала
  sc.querySelectorAll('[data-in],[data-out],[data-float],[data-drift],[data-zoom],[data-spin],[data-pulse],[data-rot]').forEach(el => {
    const tf = getComputedStyle(el).transform; el.baseTf = tf && tf !== 'none' ? tf : '';
  });
});
window.DUR = Math.max(...scenes.map(s => s.e));
window.SFX = SFX.sort((a, b) => a[0] - b[0]);

function ribbonPath(ph) {
  const W = 1160, H = 520, n = 24; let top = '', bot = '';
  for (let i = 0; i <= n; i++) { const x = i / n * W; top += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + (90 + Math.sin(i / n * 5 + ph) * 60).toFixed(1); }
  for (let i = n; i >= 0; i--) { const x = i / n * W; bot += 'L' + x.toFixed(1) + ' ' + (430 + Math.sin(i / n * 5 + ph + .9) * 60).toFixed(1); }
  return [top + bot + 'Z', top];
}

// ---------- кадр ----------
function render(t) {
  const frame = Math.round(t * 30), FR = rng(frame + 1);
  let glitchOn = 0, flashO = 0, tunnelR = -1;
  scenes.forEach(sc => {
    const d = sc.dataset, lt = t - sc.s, len = sc.e - sc.s;
    const fadeIn = d.tr === 'fade' ? 0.35 : 0;
    const vis = t >= sc.s - fadeIn && t < sc.e;
    sc.style.display = vis ? 'block' : 'none'; if (!vis) return;
    sc.style.zIndex = Math.round(sc.s * 10);
    sc.style.opacity = fadeIn ? clamp((lt + fadeIn) / fadeIn) : 1;

    // камера: медленный наезд + удары + тряска + переходы
    const cm = d.cam === 'none' ? [1, 1] : d.cam === 'out' ? [1.07, 1] : d.cam ? d.cam.split(',').map(Number) : [1, 1.05];
    let sc0 = cm[0] + (cm[1] - cm[0]) * inout(lt / len), tx = 0, ty = 0, rot = 0, filt = '';
    const tr = d.tr || 'cut';
    if (tr === 'cut' || tr === 'flash' || tr === 'invert') sc0 *= 1 + 0.06 * (1 - ease(lt / 0.28));
    if (tr === 'zoom') { const p = ease(lt / 0.4); sc0 *= 1 + (1 - p) * 0.5; if (p < 1) filt += `blur(${((1 - p) * 18).toFixed(1)}px) `; }
    if (tr === 'flash' && lt < 0.2) flashO = Math.max(flashO, 1 - lt / 0.2);
    if (tr === 'invert' && lt < 0.13) filt += 'invert(1) hue-rotate(180deg) saturate(1.6) ';
    if (tr === 'glitch' && lt < 0.3) glitchOn = Math.max(glitchOn, 1 - lt / 0.3);
    sc.hits.forEach(h => { const k = lt - h; if (k >= 0 && k < 0.3) sc0 *= 1 + 0.07 * (1 - ease(k / 0.3)); });
    sc.shakes.forEach(h => { const k = lt - h; if (k >= 0 && k < 0.35) { const a = 18 * (1 - k / 0.35); tx += (FR() - .5) * 2 * a; ty += (FR() - .5) * 2 * a; rot += (FR() - .5) * a * 0.08; } });
    sc.glitch.forEach(([a, b]) => { if (lt >= a && lt < b) glitchOn = Math.max(glitchOn, 0.7 + 0.3 * FR()); });
    if (d.end === 'tunnel' && lt > len - 0.7) { const p = inout((lt - (len - 0.7)) / 0.7); sc0 *= 1 + p * 0.8; tunnelR = 1500 * (1 - p); }
    if (d.end === 'black' && lt > len - 0.6) sc.style.opacity = 1 - ease((lt - (len - 0.6)) / 0.6);
    if (glitchOn && (d.glitch || (tr === 'glitch' && lt < 0.3))) {
      const g = glitchOn * 12;
      tx += (FR() - .5) * g * 2;
      filt += `drop-shadow(${g.toFixed(1)}px 0 0 rgba(255,0,40,.75)) drop-shadow(${(-g).toFixed(1)}px 0 0 rgba(0,240,255,.6)) contrast(1.15) `;
    }
    sc.cam.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc0.toFixed(4)})`;
    sc.cam.style.filter = filt || 'none';

    // слова
    sc.querySelectorAll('.cap').forEach(cap => {
      const cloud = cap.classList.contains('cloud'), out = cap.dataset.out;
      const qo = out !== undefined ? ease((lt - num(out)) / 0.3) : 0;
      cap.querySelectorAll('.w').forEach(w => {
        const p = ease((lt - num(w.dataset.t)) / 0.28);
        w.style.opacity = (p * (1 - qo)).toFixed(3);
        const s = 1.14 - 0.14 * p, y = (1 - p) * 34;
        w.style.filter = p < 1 ? `blur(${((1 - p) * 10).toFixed(1)}px)` : '';
        if (cloud) {
          if (w.bx === undefined) w.bx = parseFloat(w.style.left);
          const half = w.offsetWidth / 2; w.style.left = Math.min(Math.max(w.bx, 50 + half), 1030 - half) + 'px';
          const dx = Math.sin(lt * .7 + w.ph) * 10, dy = Math.cos(lt * .6 + w.ph) * 8; w.style.transform = `translate(-50%,-50%) translate(${dx.toFixed(1)}px,${(dy + y).toFixed(1)}px) scale(${s.toFixed(3)})`; }
        else w.style.transform = `translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      });
    });

    // общие появления / движения
    sc.querySelectorAll('[data-in],[data-out],[data-float],[data-drift],[data-zoom],[data-spin],[data-pulse],[data-rot]').forEach(el => {
      if (el.matches('svg.marks,svg.chalk,.crosses,.cap,.scatter,.split,.orbit,.ribbon')) return;
      const e = el.dataset; let o = 1, tf = '', f = 0;
      if (e.in !== undefined) {
        const p = (lt - num(e.in)) / num(e.dur, 0.45), from = e.from || 'scale', dist = num(e.dist, 520);
        const sp = e.pop !== undefined ? spring(p) : ease(p), q = 1 - sp;
        o = clamp(p * 3);
        const dirs = { left: [-1, 0, -8], right: [1, 0, 8], top: [0, -1, 0], bottom: [0, 1, 0], tl: [-1, -1, -22], tr: [1, -1, 22], bl: [-1, 1, 22], br: [1, 1, -22] };
        if (dirs[from]) { const [dx, dy, r] = dirs[from]; tf += `translate(${(dx * q * dist).toFixed(1)}px,${(dy * q * dist).toFixed(1)}px) rotate(${(r * q).toFixed(2)}deg) `; }
        if (from === 'scale') tf += `scale(${(0.8 + 0.2 * sp).toFixed(4)}) `;
        if (from === 'slam') { const k = ease(p / .6); tf += `scale(${(1 + (1 - k) * 1.4).toFixed(4)}) `; o = clamp(p * 4); }
        if (from === 'grow') tf += `scaleY(${ease(p).toFixed(4)}) `;
        if (from !== 'fade' && from !== 'grow') f = (1 - ease(p)) * 10;
      }
      if (e.out !== undefined) { const q = ease((lt - num(e.out)) / num(e.odur, 0.3)); o *= 1 - q; }
      if (e.zoom !== undefined) { const [a, b] = e.zoom.split(',').map(Number); tf += `scale(${(a + (b - a) * inout(lt / len)).toFixed(4)}) `; }
      if (e.float !== undefined) { const a = num(e.float, 12), ph = el.ph ??= R0() * 6; tf += `translateY(${(Math.sin(lt * 1.5 + ph) * a).toFixed(1)}px) rotate(${(Math.sin(lt * 1.1 + ph) * a * .1).toFixed(2)}deg) `; }
      if (e.drift !== undefined) { const [dx, dy] = e.drift.split(',').map(Number); const k = lt / len; tf += `translate(${(dx * k).toFixed(1)}px,${(dy * k).toFixed(1)}px) `; }
      if (e.spin !== undefined) tf += `rotate(${(num(e.spin) * lt).toFixed(2)}deg) `;
      if (e.pulse !== undefined) { const bp = (lt * num(e.pulse, 72) / 60) % 1; tf += `scale(${(1 + .05 * Math.exp(-bp * 9) + .03 * Math.exp(-Math.max(0, bp - .28) * 9) * (bp > .28)).toFixed(4)}) `; }
      if (e.rot !== undefined) tf += `rotate(${e.rot}deg) `;
      el.style.opacity = o.toFixed(3);
      el.style.transform = (tf + (el.baseTf || '')).trim();
      el.style.filter = f > 0.4 ? `blur(${f.toFixed(1)}px)` : '';
    });

    // рисованные линии
    sc.querySelectorAll('svg.marks path').forEach(p => { if (p.mp) p.mp.setAttribute('stroke-dashoffset', (1 - inout((lt - p.tin) / p.tdur)).toFixed(4)); });
    sc.querySelectorAll('svg.marks[data-out]').forEach(s => s.style.opacity = 1 - ease((lt - num(s.dataset.out)) / .3));
    sc.querySelectorAll('svg.chalk path, .crosses path').forEach(p => p.setAttribute('stroke-dashoffset', (1 - ease((lt - p.tin) / p.tdur)).toFixed(4)));
    sc.querySelectorAll('svg.chalk[data-out], .crosses[data-out]').forEach(s => s.style.opacity = 1 - ease((lt - num(s.dataset.out)) / .3));

    sc.querySelectorAll('.count').forEach(el => {
      const a = num(el.dataset.from), b = num(el.dataset.to), p = inout((lt - num(el.dataset.in)) / num(el.dataset.dur, 1.6));
      const v = Math.round(a + (b - a) * p), big = Math.max(Math.abs(a), Math.abs(b)) >= 10000;
      el.textContent = (el.dataset.pre || '') + (big ? v.toLocaleString('ru-RU').replace(/ /g, ' ') : String(v)) + (el.dataset.post || '');
    });
    sc.querySelectorAll('.scatter').forEach(el => {
      const a = num(el.dataset.in), dur = num(el.dataset.dur, 1.2), rev = el.dataset.mode === 'in';
      let p = clamp((lt - a) / dur); p = rev ? 1 - ease(p) : ease(p);
      const vis = lt >= a;
      [...el.children].forEach(i => { const [vx, vy, vr, vs] = i.v; i.style.opacity = vis ? (rev ? 1 - p * .9 : 1 - p * .6) : 0; i.style.transform = `translate(${(vx * p).toFixed(1)}px,${(vy * p).toFixed(1)}px) rotate(${(vr * p).toFixed(1)}deg) scale(${(1 + (vs - 1 + .4) * p).toFixed(3)})`; });
    });
    sc.querySelectorAll('.flip').forEach(el => {
      const ts = list(el.dataset.t), imgs = [...el.children]; let cur = -1;
      ts.forEach((x, j) => { if (lt >= x) cur = j; });
      imgs.forEach((im, j) => { im.style.opacity = j === cur ? 1 : 0; });
      if (cur >= 0) { const k = lt - ts[cur]; imgs[cur].style.transform = `scale(${(1 + .07 * (1 - ease(k / .18))).toFixed(4)})`; }
    });
    sc.querySelectorAll('.split').forEach(el => {
      const p = ease((lt - num(el.dataset.in)) / 0.22), gap = num(el.dataset.gap, 18) * ease((lt - num(el.dataset.in)) / 1.2);
      const b = el.children[1]; if (b) { b.style.transform = `translate(${gap.toFixed(1)}px,${((1 - p) * 110).toFixed(1)}%)`; b.style.opacity = p > 0 ? 1 : 0; }
      const a0 = el.children[0]; if (a0) a0.style.transform = `translateX(${(-gap * .4).toFixed(1)}px)`;
    });
    sc.querySelectorAll('.orbit').forEach(el => {
      const kids = [...el.children], r = num(el.dataset.r, 330), ry = num(el.dataset.ry, 1), spin = num(el.dataset.spin, 8);
      kids.forEach((c, j) => {
        const a = (j / kids.length * 360 + spin * lt - 90) * Math.PI / 180, p = spring((lt - num(c.dataset.oin)) / .4);
        c.style.opacity = clamp((lt - num(c.dataset.oin)) * 8);
        c.style.transform = `translate(-50%,-50%) translate(${(Math.cos(a) * r * p).toFixed(1)}px,${(Math.sin(a) * r * ry * p).toFixed(1)}px) scale(${(.3 + .7 * p).toFixed(3)})`;
      });
    });
    sc.querySelectorAll('.ribbon').forEach(el => {
      const [full, top] = ribbonPath(lt * 1.6 + num(el.dataset.phase));
      el.band.children[1].setAttribute('d', full); el.band.children[2].setAttribute('d', top);
      let x = 0;
      if (el.dataset.in !== undefined) x = -1300 * (1 - inout((lt - num(el.dataset.in)) / num(el.dataset.dur, .5)));
      if (el.dataset.out !== undefined) x += 1300 * inout((lt - num(el.dataset.out)) / .45);
      el.style.transform = `translateX(${x.toFixed(1)}px) rotate(${num(el.dataset.rot, -6)}deg)`;
    });
    sc.querySelectorAll('.beam').forEach(el => { const cf = el.style.filter; if (cf === '' || cf.startsWith('blur(3px) b')) el.style.filter = `blur(3px) brightness(${(.88 + .12 * Math.sin(lt * 23) * Math.sin(lt * 7)).toFixed(3)})`; });
    sc.querySelectorAll('.clock').forEach(el => { const sp = num(el.dataset.speed, 1); el.style.setProperty('--m', (lt * 360 * sp + num(el.dataset.m0, 200)) + 'deg'); el.style.setProperty('--h', (lt * 30 * sp + num(el.dataset.h0, 40)) + 'deg'); });
  });

  // наложения
  dust.forEach(p => {
    const x = ((p.x + p.vx * t) % 1080 + 1080) % 1080, y = ((p.y + p.vy * t) % 1920 + 1920) % 1920;
    p.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(25deg)`;
    p.el.style.opacity = (p.a * (.6 + .4 * Math.sin(t * 2 + p.ph))).toFixed(3);
  });
  $('grain').style.transform = `translate(${Math.round((FR() - .5) * 100)}px,${Math.round((FR() - .5) * 100)}px)`;
  $('scan').style.opacity = glitchOn ? (.5 + .3 * glitchOn).toFixed(2) : 0;
  $('flash').style.opacity = flashO.toFixed(3);
  const tn = $('tunnel');
  if (tunnelR >= 0) { tn.style.opacity = 1; tn.style.background = `radial-gradient(circle at 50% 46%, transparent ${tunnelR.toFixed(0)}px, #0c1a1d ${(tunnelR + 70).toFixed(0)}px, #050909 ${(tunnelR + 220).toFixed(0)}px, #000 ${(tunnelR + 420).toFixed(0)}px)`; }
  else tn.style.opacity = 0;
}
window.render = render;
window.READY = (async () => {
  const text = document.body.innerText.slice(0, 2000);
  await Promise.all(['700', '800', '900'].map(w => document.fonts.load(`${w} 100px "Playfair Display"`, text || 'АБВ ABC')).concat([document.fonts.ready])).catch(() => {});
  // строки, которые не влезают по ширине, уменьшаются сами
  scenes.forEach(sc => { sc.style.display = 'block'; });
  document.querySelectorAll('.cap:not(.cloud) .ln, .scatter').forEach(ln => {
    const sct = ln.classList.contains('scatter'), box = sct ? 1000 : ln.parentElement.clientWidth;
    const fs = parseFloat(getComputedStyle(ln).fontSize), words = [...ln.querySelectorAll('.w')];
    const need = sct ? [...ln.children].reduce((s, i) => s + i.offsetWidth, 0) : words.reduce((s, w) => s + w.offsetWidth, 0) + Math.max(0, words.length - 1) * fs * .25;
    if (need > box) ln.style.fontSize = (fs * box / need * .96).toFixed(1) + 'px';
  });
  scenes.forEach(sc => { sc.style.display = 'none'; });
  render(0);
})();
})();
