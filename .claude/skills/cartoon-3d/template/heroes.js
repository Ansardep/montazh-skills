// ГЕРОИ. Каждый герой — функция, которая строит его из простых 3D-фигур и возвращает:
//   root   — группа (позиция и поворот в комнате)
//   close  — крупный план камеры {p: [x,y,z] откуда, l: [x,y,z] куда смотрит, fov}
//   update(t, f, me) — оживление на каждом кадре: me.m — громкость голоса 0..1 (рот), me.mood — настроение
// Новый герой: скопируй функцию, поменяй фигуры и цвета. У каждого героя 3–4 приметы, которые не меняются.
// Помощники из scene.html: M(цвет), add(фигура, материал, x, y, z, родитель), lowpoly(), canvasTex(), rnd()

const EYE = () => new THREE.MeshStandardMaterial({ color: '#1e1a22', roughness: .25 });
const HL = () => new THREE.MeshBasicMaterial({ color: '#ffffff' });

// Героиня: круглое лицо в розовом платке, светлый лонгслив оверсайз, белые джинсы в чёрный горошек, розовые кроссовки
// настроения: idle, talk, shy (смущается), smile, laugh
HEROES.heroine = function ({ x = 1.25, z = .3, turn = -.2 } = {}) {
  const her = new THREE.Group(); her.position.set(x, 0, z); her.rotation.y = turn; S.add(her);
  const skin = M('#ffdcc4', { emissive: '#3a2418', emissiveIntensity: .35 }), shirt = M('#f8d3da');
  const jeansTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#1d1d24'; const r = rnd(5); for (let i = 0; i < 55; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3.2, 0, 7); g.fill() } });
  const jeans = new THREE.MeshStandardMaterial({ map: jeansTex, flatShading: true, roughness: .9 }), snk = M('#f19ab4'), sole = M('#ffffff');
  for (const sx of [-.32, .32]) { add(new THREE.BoxGeometry(.5, .22, .8), snk, sx, .16, .08, her); add(new THREE.BoxGeometry(.52, .08, .84), sole, sx, .04, .08, her) }
  for (const sx of [-.3, .3]) add(lowpoly(new THREE.CylinderGeometry(.3, .36, 1.35, 7), .03, sx > 0 ? 3 : 4), jeans, sx, .92, 0, her);
  const torso = add(lowpoly(new THREE.CylinderGeometry(.68, .92, 1.55, 8), .04, 9), shirt, 0, 2.32, 0, her); torso.scale.z = .78;
  for (const sx of [-1, 1]) {
    const sl = add(lowpoly(new THREE.CylinderGeometry(.22, .3, 1.35, 6), .03, sx + 12), shirt, sx * .86, 2.3, 0, her); sl.rotation.z = sx * .18;
    add(lowpoly(new THREE.IcosahedronGeometry(.17, 1), .02, sx + 20), skin, sx * .98, 1.56, .04, her);
  }
  const head = new THREE.Group(); head.position.set(0, 4.1, 0); her.add(head);
  const g = new THREE.SphereGeometry(1, 96, 72), pos = g.attributes.position, idx = g.index.array, keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += pos.getX(idx[i + k]); cy += pos.getY(idx[i + k]); cz += pos.getZ(idx[i + k]); }
    cx /= 3; cy /= 3; cz /= 3; if (!(cz > 0.2 && ((cx / 0.6) ** 2 + ((cy + 0.1) / 0.7) ** 2) < 1)) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep); g.computeVertexNormals();
  add(g, M('#e58fa8', { side: THREE.DoubleSide }), 0, 0, 0, head).scale.set(.9, 1.05, .95);
  add(new THREE.TorusGeometry(1, .075, 12, 96), M('#cf7592'), 0, -.105, .72, head).scale.set(.6 * .9 * 1.02, .7 * 1.05, 1);
  add(new THREE.SphereGeometry(.9, 40, 30), M('#ffdcc4', { flatShading: false, emissive: '#5a3020', emissiveIntensity: .45 }), 0, -.08, .12, head).scale.set(.84, .98, .85);
  const NS = M('#e58fa8', { flatShading: false }), ND = M('#d07893', { flatShading: false });
  const n1 = add(new THREE.TorusGeometry(.4, .085, 14, 48), NS, 0, -.97, .02, head); n1.rotation.x = Math.PI / 2 - .12; n1.scale.y = .86;
  add(new THREE.CylinderGeometry(.4, .44, .22, 32), NS, 0, -1.04, 0, head).scale.z = .86;
  const n2 = add(new THREE.TorusGeometry(.45, .065, 14, 48), ND, 0, -1.08, 0, head); n2.rotation.x = Math.PI / 2 + .05; n2.scale.y = .86;
  const eyeM = EYE(), hlM = HL(), eyes = [], hls = [];
  for (const sx of [-.27, .27]) {
    const e = add(new THREE.SphereGeometry(.13, 16, 12), eyeM, sx, -.02, .86, head); e.scale.set(1, 1.2, .5); eyes.push(e);
    hls.push(add(new THREE.SphereGeometry(.04, 8, 6), hlM, sx + .04, .05, .92, head), add(new THREE.SphereGeometry(.018, 6, 4), hlM, sx - .04, -.07, .92, head));
    add(new THREE.BoxGeometry(.2, .03, .03), M('#9c6b5a'), sx, .22, .8, head).rotation.z = sx > 0 ? -.12 : .12;
    add(new THREE.SphereGeometry(.09, 10, 8), new THREE.MeshStandardMaterial({ color: '#f29aa0', transparent: true, opacity: .75 }), sx * 1.33, -.2, .79, head).scale.set(1.3, .7, .3);
  }
  const mouth = add(new THREE.SphereGeometry(.06, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M('#b2465a', { flatShading: false }), 0, -.32, .86, head); mouth.scale.set(1.3, 1.1, .4);
  return {
    root: her,
    close: { p: [x - 1.65, 4.0, z + 6.3], l: [x - .1, 3.8, z], fov: 34 },
    update(t, f, me) {
      const br = Math.sin(t * 2.4) * .018; torso.scale.y = 1 + br;
      let hy = 4.1 + br * 1.4, rz = Math.sin(t * 1.1) * .03, rx = 0;
      if (me.mood === 'shy') { rz = .1 + Math.sin(t * 1.3) * .02; rx = .08 }
      if (me.mood === 'smile') rz = -.06;
      if (me.mood === 'laugh') { hy += Math.abs(Math.sin(t * 9)) * .06; rx = -.06 + Math.sin(t * 9) * .04 }
      head.position.y = hy; head.rotation.z = rz; head.rotation.x = rx;
      her.rotation.y = turn + (f.shot === me.id ? .12 : 0);
      const blink = ((t % 3.7) > 3.52) ? .12 : 1, happy = me.mood === 'laugh' ? .35 : 1;
      eyes.forEach(e => e.scale.y = 1.2 * Math.min(blink, happy)); hls.forEach(h => h.visible = blink > .5 && happy > .5);
      mouth.scale.set(1.3 + me.m * .4, 1.0 + me.m * 2.6, .4);
      if (me.mood === 'laugh') mouth.scale.y = Math.max(mouth.scale.y, 2.2);
    },
  };
};

// Клоуди: малиновый пухлый квадратик, антенна с сердечком, глаза-точки с бликом, короткие ножки
// настроения: idle, happy, warm (нежно), play (подмигивает), laugh
HEROES.cloudy = function ({ x = -1.05, z = 1.5, turn = .3, size = .72 } = {}) {
  const px = new THREE.Group(); px.position.set(x, 0, z); px.rotation.y = turn; px.scale.setScalar(size); S.add(px);
  const pM = M('#d9487c'), pD = M('#b8336a'), eyeM = EYE(), hlM = HL();
  add(new THREE.BoxGeometry(2.0, 1.55, 1.5, 2, 2, 2), pM, 0, 1.5, 0, px);
  for (const [lx, lz] of [[-.6, -.45], [.6, -.45], [-.6, .45], [.6, .45]]) add(new THREE.BoxGeometry(.32, .75, .32), pD, lx, .38, lz, px);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(.35, .4, .4), pM, sx * 1.15, 1.5, 0, px);
  const eyes = [], hls = [];
  for (const sx of [-.42, .42]) { eyes.push(add(new THREE.BoxGeometry(.16, .42, .05), eyeM, sx, 1.65, .77, px)); hls.push(add(new THREE.BoxGeometry(.05, .08, .02), hlM, sx + .03, 1.78, .8, px)) }
  const mouth = add(new THREE.BoxGeometry(.32, .04, .04), M('#2a1a22'), 0, 1.3, .77, px);
  const blush = [-.72, .72].map(sx => add(new THREE.BoxGeometry(.26, .12, .03), new THREE.MeshStandardMaterial({ color: '#f48fb1', emissive: '#ff5c9a' }), sx, 1.38, .765, px));
  add(new THREE.CylinderGeometry(.04, .04, .6, 6), pD, 0, 2.55, 0, px);
  const hs = new THREE.Shape(); hs.moveTo(0, -.18); hs.bezierCurveTo(-.3, .05, -.18, .28, 0, .12); hs.bezierCurveTo(.18, .28, .3, .05, 0, -.18);
  const heart = add(new THREE.ExtrudeGeometry(hs, { depth: .08, bevelEnabled: false }), M('#ff4f8f'), 0, 2.98, -.04, px);
  return {
    root: px,
    close: { p: [x + 1.75, 1.7, z + 5.5], l: [x, 1.3, z], fov: 36 },
    update(t, f, me) {
      let bounce = Math.abs(Math.sin(t * 2.2)) * .05, eyL = 1, eyR = 1, bl = .15, tilt = 0;
      if (me.mood === 'happy') { bounce = Math.abs(Math.sin(t * 6)) * .16; eyL = eyR = .22; bl = .9 }
      if (me.mood === 'warm') { bl = .6; tilt = Math.sin(t * 1.2) * .05 }
      if (me.mood === 'play') { eyL = .22; tilt = .08; bl = .4 }
      if (me.mood === 'laugh') { bounce = Math.abs(Math.sin(t * 10)) * .14; eyL = eyR = .2; bl = 1 }
      const blink = ((t % 2.9) > 2.75) ? .15 : 1;
      px.position.y = bounce; px.rotation.z = tilt;
      eyes.forEach(e => e.scale.y = Math.min(e.position.x < 0 ? eyL : eyR, blink));
      hls.forEach(h => h.visible = Math.min(eyL, eyR, blink) > .5);
      mouth.scale.y = 1 + me.m * 9; mouth.scale.x = 1 + me.m * .3; if (me.mood === 'laugh') mouth.scale.y = Math.max(mouth.scale.y, 7);
      blush.forEach(b => b.material.emissiveIntensity = bl);
      heart.scale.setScalar(1 + Math.sin(t * 5) * .08 + (me.mood === 'happy' || me.mood === 'laugh' ? .15 : 0));
    },
  };
};
