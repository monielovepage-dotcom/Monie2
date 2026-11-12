/* ==========================================================
   ถึงแฟนเก่าคนโปรด — script.js
   Plain JavaScript, no libraries.

   States
     idle     – waiting; "ไม่ไป" sits somewhere, ready to run
     running  – button flees, cat swaps to the toy gun and aims
     aiming   – short pause, reticle on the button
     firing   – bullet flies, button shatters
     recover  – fragments fade, button about to come back
     happy    – "ไป" was pressed (final)
   ========================================================== */
(() => {
  'use strict';

  /* ---------- config ---------- */
  const CFG = {
    runMs: 500,          // button glides to its new spot
    aimMs: 520,          // aiming pause before firing
    shotMs: 220,         // toy bullet flight
    respawnMs: 850,      // shatter -> button reappears (≈700–1000 ms)
    fragments: 90,       // button shards + confetti that fly across the whole screen
    scatterMs: [1700, 2800], // how long the shards drift before they have fully faded
    edge: 12,            // min gap to viewport edge (px)
    avoidPointer: 120,   // don't respawn right under the cursor
    maxAim: 30,          // max gun tilt in degrees
    maxCone: 28,         // button must appear within ±this angle of the gun
    proximity: 46,       // mouse "approach" distance that triggers the run
  };

  const SRC = {
    krathong: 'assets/cat-krathong-smooth.gif',
    gun: 'assets/cat-toy-gun-smooth.gif',
    happy: 'assets/cat-happy-smooth.gif',
  };
  const ALT = {
    krathong: 'แมวน้อยถือกระทง',
    gun: 'แมวน้อยเล็งปืนฉีดน้ำของเล่น',
    happy: 'แมวน้อยดีใจ',
  };
  // Muzzle position inside cat-toy-gun-smooth.gif (517×512), as a fraction.
  const GUN = { w: 517, h: 512, mx: 0.845, my: 0.555 };

  const CAPTION = {
    idle: 'รอคำตอบอยู่นะ…',
    run: 'อ้าว หนีเหรอ!',
    aim: 'ไม่ให้หนีหรอกนะ…',
    fire: 'ปัง!',
    after: 'เห็นไหม ไม่ไปไม่ได้นะ ♡',
  };

  /* ---------- elements ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    page: $('page'),
    deco: $('deco'),
    head: $('head'),
    stage: $('stage'),
    cat: $('cat'),
    img: $('catImg'),
    hearts: $('hearts'),
    caption: $('caption'),
    message: $('message'),
    go: $('goBtn'),
    actions: $('actions'),
    no: $('noBtn'),
    fx: $('fx'),
  };

  /* ---------- helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const sleep = (ms) => new Promise((r) => { timers.add(setTimeout(r, ms)); });
  const timers = new Set();
  const inflate = (r, p) => ({ left: r.left - p, top: r.top - p, right: r.right + p, bottom: r.bottom + p });
  const overlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const SVG = {
    heart: (fill, size) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="${fill}" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 2.6 4.5 6.3 4.5c2.1 0 3.7 1.1 5.7 3.3 2-2.2 3.6-3.3 5.7-3.3 3.7 0 5.4 3.8 3.9 7.3C19.5 16.4 12 21 12 21z"/></svg>`,
    sparkle: (fill, size) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="${fill}" d="M12 1c.9 6.2 4.8 10.1 11 11-6.2.9-10.1 4.8-11 11-.9-6.2-4.8-10.1-11-11 6.2-.9 10.1-4.8 11-11z"/></svg>`,
    star: () =>
      `<svg viewBox="0 0 100 100"><polygon fill="#ffd95a" stroke="#f5a623" stroke-width="3.5" stroke-linejoin="round" points="50,3 59,31 87,16 73,43 97,50 73,57 87,84 59,69 50,97 41,69 13,84 27,57 3,50 27,43 13,16 41,31"/><circle cx="50" cy="50" r="13" fill="#fff6c9"/></svg>`,
    reticle: () =>
      `<svg viewBox="0 0 70 70"><g fill="none" stroke="#ef6b97" stroke-width="3" stroke-linecap="round"><circle cx="35" cy="35" r="24" stroke-dasharray="7 6"/><path d="M35 4v12M35 54v12M4 35h12M54 35h12"/></g><circle cx="35" cy="35" r="3.5" fill="#ef6b97"/></svg>`,
  };

  /* ---------- state ---------- */
  let state = 'idle';
  let runId = 0;            // bumped to cancel an in-flight sequence
  let curKind = 'krathong';
  let tilt = 0;             // current gun tilt (deg)
  let aiming = false;
  let rafId = 0;
  let isFree = false;       // has the "ไม่ไป" button left its slot yet?
  const pointer = { x: -9999, y: -9999 };

  /* ---------- preload GIFs so swaps are instant ---------- */
  Object.values(SRC).forEach((src) => { const i = new Image(); i.src = src; });

  /* ==========================================================
     Cat
     ========================================================== */
  function setCat(kind) {
    if (curKind === kind) return;
    curKind = kind;
    el.img.src = SRC[kind];
    el.img.alt = ALT[kind];
    el.cat.dataset.kind = kind;
  }

  function applyTilt() { el.img.style.transform = `rotate(${tilt.toFixed(2)}deg)`; }

  // Where the gun's muzzle is on screen for a given tilt.
  function muzzle(deg) {
    const r = el.cat.getBoundingClientRect();
    const S = r.width;
    const dispH = (S * GUN.h) / GUN.w;
    const offY = S - dispH;                       // image is bottom-aligned
    const px = r.left + S * 0.4, py = r.top + S * 0.7;   // pivot (matches transform-origin)
    const mx = r.left + GUN.mx * S, my = r.top + offY + GUN.my * dispH;
    const a = (deg * Math.PI) / 180, vx = mx - px, vy = my - py;
    return { x: px + vx * Math.cos(a) - vy * Math.sin(a), y: py + vx * Math.sin(a) + vy * Math.cos(a) };
  }

  function startAim() {
    aiming = true;
    el.cat.classList.add('aiming');
    const loop = () => {
      if (!aiming) return;
      const b = el.no.getBoundingClientRect();
      const m = muzzle(tilt);
      const angle = Math.atan2(b.top + b.height / 2 - m.y, b.left + b.width / 2 - m.x) * 180 / Math.PI;
      tilt += (clamp(angle, -CFG.maxAim, CFG.maxAim) - tilt) * 0.22;
      applyTilt();
      rafId = requestAnimationFrame(loop);
    };
    loop();
  }
  function stopAim() { aiming = false; cancelAnimationFrame(rafId); }

  function relaxCat() {
    stopAim();
    el.cat.classList.remove('aiming');
    tilt = 0;
    applyTilt();
  }

  /* ==========================================================
     "ไม่ไป" button placement
     ========================================================== */
  function buttonSize() {
    const r = el.no.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }

  function setPos(x, y) {
    el.no.style.setProperty('--x', `${Math.round(x)}px`);
    el.no.style.setProperty('--y', `${Math.round(y)}px`);
  }

  // Take the button out of its slot so it can roam the viewport.
  function freeButton() {
    if (isFree) return;
    const r = el.no.getBoundingClientRect();
    // it shrinks a little once it starts running, so it has room to flee on phones
    el.no.style.width = `${Math.min(r.width, 124)}px`;
    el.no.style.height = `${Math.min(r.height, 54)}px`;
    el.no.style.fontSize = '22px';
    el.no.classList.add('free', 'snap');
    document.body.appendChild(el.no);     // keep `position: fixed` relative to the viewport
    setPos(r.left, r.top);
    void el.no.offsetWidth;               // commit before enabling the transition
    el.no.classList.remove('snap');
    isFree = true;
  }

  // Random spot that is: inside the viewport, off the title / cat / "ไป" /
  // caption, to the RIGHT of the gun (within a cone so the cat can aim at it),
  // and not right under the cursor.
  function pickPosition(size) {
    const vw = window.innerWidth, vh = window.innerHeight, e = CFG.edge;
    const keepOut = [[el.head, 12], [el.cat, 0], [el.go, 14], [el.caption, 8], [el.message, 12]]
      .filter(([n]) => n && !n.hidden)
      .map(([n, pad]) => inflate(n.getBoundingClientRect(), pad));
    const base = muzzle(0);
    const maxX = vw - size.w - e, maxY = vh - size.h - e;

    const tryPick = (useCone, usePointer) => {
      for (let i = 0; i < 260; i++) {
        const x = rand(e, Math.max(e, maxX)), y = rand(e, Math.max(e, maxY));
        const box = { left: x, top: y, right: x + size.w, bottom: y + size.h };
        if (keepOut.some((k) => overlap(box, k))) continue;
        const cx = x + size.w / 2, cy = y + size.h / 2;
        if (useCone) {
          const dx = cx - base.x, dy = cy - base.y;
          if (dx < 50) continue;
          if (Math.abs(Math.atan2(dy, dx)) * 180 / Math.PI > CFG.maxCone) continue;
        }
        if (usePointer && Math.hypot(cx - pointer.x, cy - pointer.y) < CFG.avoidPointer) continue;
        return { x, y };
      }
      return null;
    };

    return (
      tryPick(true, true) || tryPick(true, false) || tryPick(false, true) || tryPick(false, false) ||
      { x: clamp(vw - size.w - e, e, vw), y: clamp(vh - size.h - e, e, vh) }
    );
  }

  /* ==========================================================
     Effects
     ========================================================== */
  function spawn(html, cls, x, y) {
    const n = document.createElement('div');
    n.className = cls;
    n.innerHTML = html;
    n.style.transform = `translate(${x}px, ${y}px)`;
    el.fx.appendChild(n);
    return n;
  }

  function showReticle(cx, cy) {
    const n = spawn(SVG.reticle(), 'reticle', cx, cy);
    n.dataset.kind = 'reticle';
    n.animate(
      [
        { transform: `translate(${cx}px, ${cy}px) scale(2) rotate(-90deg)`, opacity: 0 },
        { transform: `translate(${cx}px, ${cy}px) scale(1) rotate(0deg)`, opacity: 1 },
      ],
      { duration: 380, easing: 'cubic-bezier(.2,1,.4,1)', fill: 'forwards' }
    );
    return n;
  }

  function muzzleFlash(m) {
    const n = spawn(SVG.star(), 'flash', m.x, m.y);
    n.animate(
      [
        { transform: `translate(${m.x}px, ${m.y}px) scale(.2) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${m.x + 12}px, ${m.y}px) scale(1.15) rotate(25deg)`, opacity: 1, offset: .4 },
        { transform: `translate(${m.x + 16}px, ${m.y}px) scale(.8) rotate(40deg)`, opacity: 0 },
      ],
      { duration: 280, easing: 'ease-out', fill: 'forwards' }
    ).onfinish = () => n.remove();
    // tiny sparkles around the muzzle
    for (let i = 0; i < 4; i++) {
      const s = spawn(SVG.sparkle(pick(['#ffd95a', '#ff9cbb', '#fff']), 12), 'flash', m.x, m.y);
      s.style.width = s.style.height = '12px';
      s.style.margin = '-6px 0 0 -6px';
      const a = rand(-0.9, 0.9), d = rand(26, 52);
      s.animate(
        [
          { transform: `translate(${m.x}px, ${m.y}px) scale(.4)`, opacity: 1 },
          { transform: `translate(${m.x + Math.cos(a) * d}px, ${m.y + Math.sin(a) * d}px) scale(1)`, opacity: 0 },
        ],
        { duration: 380, easing: 'ease-out', fill: 'forwards' }
      ).onfinish = () => s.remove();
    }
  }

  // toy "bullet" (a little heart) from the muzzle to the button
  function fireBullet(from, to) {
    const n = spawn(SVG.heart('#ff7aa5', 22), 'shot', from.x, from.y);
    n.style.filter = 'drop-shadow(0 0 4px rgba(255,150,185,.9))';
    return n.animate(
      [
        { transform: `translate(${from.x}px, ${from.y}px) scale(.6) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(1.1) rotate(300deg)`, opacity: 1 },
      ],
      { duration: CFG.shotMs, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' }
    ).finished.then(() => n.remove());
  }

  function impact(cx, cy) {
    const n = spawn(SVG.star() + '<b>ปัง!</b>', 'impact', cx, cy);
    n.animate(
      [
        { transform: `translate(${cx}px, ${cy}px) scale(.3)`, opacity: 1 },
        { transform: `translate(${cx}px, ${cy}px) scale(1.15)`, opacity: 1, offset: .35 },
        { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 0 },
      ],
      { duration: 520, easing: 'ease-out', fill: 'forwards' }
    ).onfinish = () => n.remove();
  }

  // break the button into MANY cartoon shards that fly all over the screen,
  // then drift and slowly fade away
  function shatter(rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const reach = Math.max(vw, vh);
    const colors = ['#fffdfb', '#fbd3e1', '#f6b8cd', '#ef9fbb', '#e58ba8', '#ffe6ee', '#e7cfd9', '#d77a99'];
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    for (let i = 0; i < CFG.fragments; i++) {
      const kind = i < CFG.fragments * 0.68 ? 'shard' : (i % 2 ? 'heart' : 'sparkle');
      const f = document.createElement('i');
      f.className = 'frag';
      let w, h;
      if (kind === 'shard') {
        w = rand(12, 42); h = rand(10, 28);
        f.style.cssText =
          `width:${w}px;height:${h}px;background:${pick(colors)};` +
          `clip-path:polygon(${rand(0, 30)}% 0,100% ${rand(0, 40)}%,${rand(60, 100)}% 100%,0 ${rand(60, 100)}%);`;
      } else {
        w = h = rand(14, 30);
        f.innerHTML = kind === 'heart'
          ? SVG.heart(pick(['#ff8fb5', '#ffb3cb', '#f7a8c2', '#ef7fa4']), w)
          : SVG.sparkle(pick(['#ffd95a', '#fff1a8', '#ffffff', '#ffb3cb']), w);
        f.style.cssText = `width:${w}px;height:${h}px;`;
      }
      const x = rect.left + rand(0, rect.width - w), y = rect.top + rand(0, rect.height - h);
      f.style.transform = `translate(${x}px, ${y}px)`;
      el.fx.appendChild(f);

      // fly outward in every direction; far enough to cover the whole screen
      const ang = rand(0, Math.PI * 2);
      const dist = reach * rand(0.25, 1.05);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      const rot = rand(-720, 720);
      const dur = rand(CFG.scatterMs[0], CFG.scatterMs[1]);
      f.animate(
        [
          { transform: `translate(${x}px, ${y}px) rotate(0deg) scale(.6)`, opacity: 1 },
          { transform: `translate(${x + dx * 0.7}px, ${y + dy * 0.7}px) rotate(${rot * 0.6}deg) scale(1.15)`, opacity: 1, offset: .3 },
          { transform: `translate(${x + dx}px, ${y + dy + 40}px) rotate(${rot * 0.85}deg) scale(1)`, opacity: .85, offset: .6 },
          { transform: `translate(${x + dx * 1.08}px, ${y + dy + 120}px) rotate(${rot}deg) scale(.7)`, opacity: 0 },
        ],
        { duration: dur, easing: 'cubic-bezier(.12,.7,.3,1)', fill: 'forwards' }
      ).onfinish = () => f.remove();
    }
  }

  // the "boom": shock-wave rings, a soft screen flash and a little screen shake
  function boom(cx, cy) {
    const flash = spawn('', 'screen-flash', 0, 0);
    flash.style.setProperty('--fx', `${cx}px`);
    flash.style.setProperty('--fy', `${cy}px`);
    flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => flash.remove();

    [0, 120].forEach((delay, i) => {
      const r = spawn('', 'ring', cx, cy);
      r.animate(
        [
          { transform: `translate(${cx}px, ${cy}px) scale(.3)`, opacity: .95 },
          { transform: `translate(${cx}px, ${cy}px) scale(${i ? 12 : 16})`, opacity: 0 },
        ],
        { duration: 800, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }
      ).onfinish = () => r.remove();
    });

    el.page.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-7px, 4px) rotate(-.3deg)' },
        { transform: 'translate(6px, -5px) rotate(.3deg)' },
        { transform: 'translate(-5px, -3px)' },
        { transform: 'translate(4px, 3px)' },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 380, easing: 'ease-out' }
    );
  }

  function clearFx() { el.fx.replaceChildren(); }

  /* ==========================================================
     The run-away → aim → shoot → shatter → return loop
     ========================================================== */
  function setCaption(key) { el.caption.textContent = CAPTION[key]; }

  async function runAway() {
    if (state !== 'idle') return;
    state = 'running';
    const id = ++runId;
    const alive = () => id === runId && state !== 'happy';

    setCaption('run');
    freeButton();

    // 1) escape to a random spot, smoothly
    const target = pickPosition(buttonSize());
    el.no.classList.remove('fleeing', 'nervous');
    void el.no.offsetWidth;
    el.no.classList.add('fleeing');
    setPos(target.x, target.y);

    // 2) cat grabs the toy gun and tracks the button
    setCat('gun');
    startAim();
    await sleep(CFG.runMs);
    if (!alive()) return;

    // 3) aiming pause
    state = 'aiming';
    el.no.classList.remove('fleeing');
    el.no.classList.add('nervous');
    setCaption('aim');
    const b1 = el.no.getBoundingClientRect();
    showReticle(b1.left + b1.width / 2, b1.top + b1.height / 2);
    await sleep(CFG.aimMs);
    if (!alive()) return;

    // 4) FIRE (toy gun, cartoon only)
    state = 'firing';
    stopAim();
    const m = muzzle(tilt);
    const b2 = el.no.getBoundingClientRect();
    const hit = { x: b2.left + b2.width / 2, y: b2.top + b2.height / 2 };
    el.fx.querySelectorAll('[data-kind="reticle"]').forEach((n) => n.remove());
    el.cat.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-14px)' }, { transform: 'translateX(0)' }],
      { duration: 240, easing: 'ease-out' }
    );
    muzzleFlash(m);
    setCaption('fire');
    await fireBullet(m, hit);
    if (!alive()) return;

    // 5) button breaks into pieces
    state = 'recover';
    el.no.classList.remove('nervous');
    el.no.classList.add('gone');
    impact(hit.x, hit.y);
    boom(hit.x, hit.y);
    shatter(b2);

    await sleep(380);
    if (!alive()) return;
    setCat('krathong');
    relaxCat();
    setCaption('after');

    // 6) …and it comes back somewhere else after ~0.85 s
    await sleep(CFG.respawnMs - 380);
    if (!alive()) return;
    respawn();
    state = 'idle';
  }

  function respawn() {
    const p = pickPosition(buttonSize());
    el.no.classList.add('snap');
    setPos(p.x, p.y);
    void el.no.offsetWidth;
    el.no.classList.remove('snap', 'gone');
    el.no.animate(
      [
        { transform: 'scale(.3)', opacity: 0 },
        { transform: 'scale(1.12)', opacity: 1, offset: .7 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 380, easing: 'ease-out' }
    );
  }

  /* ==========================================================
     "ไป" — happy ending
     ========================================================== */
  let heartTimer = 0;

  function floatHeart() {
    const w = el.stage.clientWidth, h = el.stage.clientHeight;
    const size = rand(14, 30);
    const useSparkle = Math.random() < 0.3;
    const n = document.createElement('span');
    n.innerHTML = useSparkle
      ? SVG.sparkle(pick(['#ffd95a', '#ffb3cb', '#fff1a8']), size * 0.8)
      : SVG.heart(pick(['#ff9cbb', '#f7a8c2', '#ffc2d6', '#ef7fa4']), size);
    const x = rand(w * 0.12, w * 0.88), y0 = h * rand(0.55, 0.9);
    n.style.left = `${x}px`;
    n.style.top = `${y0}px`;
    el.hearts.appendChild(n);
    const sway = rand(-26, 26), rise = rand(140, 250);
    n.animate(
      [
        { transform: 'translate(0, 0) scale(.5)', opacity: 0 },
        { transform: `translate(${sway * 0.5}px, ${-rise * 0.3}px) scale(1)`, opacity: 1, offset: .2 },
        { transform: `translate(${-sway}px, ${-rise}px) scale(.9)`, opacity: 0 },
      ],
      { duration: rand(1800, 2800), easing: 'ease-out', fill: 'forwards' }
    ).onfinish = () => n.remove();
  }

  function burstHearts(count) {
    for (let i = 0; i < count; i++) setTimeout(floatHeart, i * 70);
  }

  // "ไป ♡" pops away too, so the happy screen is just the cat + message
  function leaveButtons() {
    el.go.disabled = true;
    el.actions.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.85)' }],
      { duration: 260, easing: 'ease-in', fill: 'forwards' }
    ).onfinish = () => { el.actions.hidden = true; };
  }

  function sayYes() {
    if (state === 'happy') return;

    // stop every running-away / shooting animation
    state = 'happy';
    runId++;
    timers.forEach(clearTimeout);
    timers.clear();
    relaxCat();
    clearFx();
    el.no.getAnimations().forEach((a) => a.cancel());
    el.no.classList.remove('fleeing', 'nervous');
    el.no.classList.add('gone');          // hide "ไม่ไป"
    el.no.hidden = true;
    leaveButtons();

    setCat('happy');
    el.caption.hidden = true;
    el.message.hidden = false;
    el.go.setAttribute('aria-pressed', 'true');

    burstHearts(12);
    clearInterval(heartTimer);
    heartTimer = setInterval(floatHeart, 650);
  }

  /* ==========================================================
     Wiring
     ========================================================== */
  // touch / mouse press on "ไม่ไป" → it runs
  el.no.addEventListener('pointerdown', (e) => { e.preventDefault(); runAway(); });
  // keyboard (Enter / Space) → also runs
  el.no.addEventListener('click', (e) => { e.preventDefault(); runAway(); });

  // mouse "approach": run before the cursor even touches the button
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY;
    if (e.pointerType !== 'mouse' || state !== 'idle') return;
    const r = el.no.getBoundingClientRect();
    const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
    const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    if (Math.hypot(dx, dy) < CFG.proximity) runAway();
  }, { passive: true });

  el.go.addEventListener('click', sayYes);

  // keep a parked button inside the viewport after rotate / resize
  window.addEventListener('resize', () => {
    if (state === 'idle' && isFree) {
      el.no.classList.add('snap');
      const p = pickPosition(buttonSize());
      setPos(p.x, p.y);
      void el.no.offsetWidth;
      el.no.classList.remove('snap');
    }
  });

  /* ---------- background sprinkles (seeded → stable layout) ---------- */
  (function sprinkle() {
    let s = 7;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 26; i++) {
      const n = document.createElement('i');
      const heart = i % 4 === 0;
      n.className = heart ? 'heart' : 'dot';
      const size = heart ? 10 + r() * 8 : 3 + r() * 5;
      n.style.cssText =
        `left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;` +
        `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;opacity:${(0.35 + r() * 0.5).toFixed(2)}`;
      frag.appendChild(n);
    }
    el.deco.appendChild(frag);
  })();
})();
