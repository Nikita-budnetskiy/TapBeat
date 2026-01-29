// game.js (FULL)
(() => {
  "use strict";

  /* =========================
     DOM
  ========================= */
  const $ = (sel) => document.querySelector(sel);

  const screenSplash = $("#screen-splash");
  const screenMenu = $("#screen-menu");
  const screenGame = $("#screen-game");

  const btnPlay = $("#btnPlay");
  const btnSettingsMenu = $("#btnSettingsMenu");
  const btnShopMenu = $("#btnShopMenu");
  const btnAchMenu = $("#btnAchMenu");

  const playfield = $("#playfield");
  const targetEl = $("#target");
  const judgementEl = $("#judgement");
  const distractorsEl = $("#distractors");

  const scoreEl = $("#score");
  const comboEl = $("#combo");
  const coinsEl = $("#coins");
  const bpmEl = $("#bpm");
  const levelEl = $("#level");
  const livesEl = $("#lives");

  const vibeEl = $("#vibe");
  const energyFill = $("#energyFill");
  const energyPctEl = $("#energyPct");
  const streakEl = $("#streak");

  const btnSettings = $("#btnSettings");
  const modalSettings = $("#modalSettings");
  const modalShop = $("#modalShop");
  const modalAchievements = $("#modalAchievements");

  const toggleMusic = $("#toggleMusic");
  const toggleHaptics = $("#toggleHaptics");
  const toggleReduceMotion = $("#toggleReduceMotion");
  const skinGrid = $("#skinGrid");

  const btnBackToMenu = $("#btnBackToMenu");

  const tutorial = $("#tutorial");
  const btnTutorialOk = $("#btnTutorialOk");

  const achList = $("#achList");

  const fxCanvas = $("#fx");
  const fx = fxCanvas.getContext("2d", { alpha: true });

  /* =========================
     SETTINGS + SAVE
  ========================= */
  const LS_KEY = "tapbeat_v1";
  const defaultSave = {
    coins: 0,
    bestScore: 0,
    bestCombo: 0,
    seenTutorial: false,
    settings: {
      music: true,
      haptics: true,
      reduceMotion: false,
      skin: "aqua"
    },
    achievements: {}
  };

  const loadSave = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return structuredClone(defaultSave);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(defaultSave),
        ...parsed,
        settings: { ...structuredClone(defaultSave.settings), ...(parsed.settings || {}) },
        achievements: { ...(parsed.achievements || {}) }
      };
    } catch {
      return structuredClone(defaultSave);
    }
  };

  let save = loadSave();
  const persist = () => localStorage.setItem(LS_KEY, JSON.stringify(save));

  /* =========================
     SKINS
  ========================= */
  const SKINS = [
    { id: "aqua", name: "Aqua", ring: "linear-gradient(135deg, rgba(61,255,179,.55), rgba(83,199,255,.25))", core: "linear-gradient(135deg, rgba(61,255,179,.75), rgba(255,79,163,.25))" },
    { id: "sunset", name: "Sunset", ring: "linear-gradient(135deg, rgba(255,124,92,.35), rgba(255,79,163,.25))", core: "linear-gradient(135deg, rgba(255,228,91,.65), rgba(255,79,163,.28))" },
    { id: "neon", name: "Neon", ring: "linear-gradient(135deg, rgba(83,199,255,.55), rgba(255,79,163,.25))", core: "linear-gradient(135deg, rgba(83,199,255,.65), rgba(61,255,179,.35))" },
    { id: "mint", name: "Mint", ring: "linear-gradient(135deg, rgba(61,255,179,.55), rgba(255,255,255,.12))", core: "linear-gradient(135deg, rgba(61,255,179,.80), rgba(83,199,255,.22))" },
    { id: "rose", name: "Rose", ring: "linear-gradient(135deg, rgba(255,79,163,.35), rgba(255,255,255,.12))", core: "linear-gradient(135deg, rgba(255,79,163,.65), rgba(61,255,179,.22))" },
    { id: "blueberry", name: "Berry", ring: "linear-gradient(135deg, rgba(83,199,255,.30), rgba(11,15,42,.10))", core: "linear-gradient(135deg, rgba(83,199,255,.60), rgba(255,79,163,.20))" }
  ];

  function applySkin(id) {
    const skin = SKINS.find(s => s.id === id) || SKINS[0];
    save.settings.skin = skin.id;
    persist();

    const ring = targetEl.querySelector(".target__ring");
    const core = targetEl.querySelector(".target__core");
    if (ring) ring.style.background = `radial-gradient(circle at 30% 25%, rgba(255,255,255,.35), transparent 60%), ${skin.ring}`;
    if (core) core.style.background = `radial-gradient(circle at 35% 35%, rgba(255,255,255,.65), rgba(255,255,255,.08) 55%, rgba(0,0,0,.18) 100%), ${skin.core}`;
  }

  function buildSkinGrid() {
    if (!skinGrid) return;
    skinGrid.innerHTML = "";
    for (const s of SKINS) {
      const btn = document.createElement("button");
      btn.className = "skin";
      if (s.id === save.settings.skin) btn.classList.add("skin--active");
      btn.type = "button";
      btn.innerHTML = `
        <div class="skin__dot" style="background:${s.core}"></div>
        <div class="skin__name">${s.name}</div>
      `;
      btn.addEventListener("click", () => {
        applySkin(s.id);
        [...skinGrid.querySelectorAll(".skin")].forEach(x => x.classList.remove("skin--active"));
        btn.classList.add("skin--active");
        burstConfetti(state.target.x, state.target.y, 14);
      });
      skinGrid.appendChild(btn);
    }
  }

  /* =========================
     ACHIEVEMENTS
  ========================= */
  const ACH = [
    { id: "first_hit", name: "First Blood", desc: "Land your first hit.", test: () => state.stats.hits >= 1 },
    { id: "combo_10", name: "Combo x10", desc: "Reach 10 combo.", test: () => state.combo >= 10 || save.bestCombo >= 10 },
    { id: "combo_25", name: "Combo x25", desc: "Reach 25 combo.", test: () => state.combo >= 25 || save.bestCombo >= 25 },
    { id: "perfect_5", name: "Clean!", desc: "Get 5 Perfect in one run.", test: () => state.stats.perfect >= 5 },
    { id: "survivor", name: "Survivor", desc: "Play 60 seconds without losing all hearts.", test: () => state.timeAlive >= 60 && state.lives > 0 },
    { id: "rich_100", name: "Pocket Money", desc: "Collect 100 coins total.", test: () => save.coins >= 100 }
  ];

  function unlock(id) {
    if (save.achievements[id]) return;
    save.achievements[id] = true;
    persist();
    showJudgement("Unlocked!", "good");
    burstConfetti(state.target.x, state.target.y, 26);
  }

  function checkAchievements() {
    for (const a of ACH) {
      if (!save.achievements[a.id] && a.test()) unlock(a.id);
    }
  }

  function renderAchievements() {
    if (!achList) return;
    achList.innerHTML = "";
    for (const a of ACH) {
      const done = !!save.achievements[a.id];
      const row = document.createElement("div");
      row.className = "ach" + (done ? " ach--done" : "");
      row.innerHTML = `
        <div>
          <div class="ach__name">${a.name}</div>
          <div class="ach__desc">${a.desc}</div>
        </div>
        <div class="ach__badge">${done ? "DONE" : "LOCKED"}</div>
      `;
      achList.appendChild(row);
    }
  }

  /* =========================
     AUDIO (WebAudio synth)
  ========================= */
  let audio = null;

  function audioInit() {
    if (audio) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    const drums = ctx.createGain(); drums.gain.value = 0.55; drums.connect(master);
    const bass = ctx.createGain(); bass.gain.value = 0.45; bass.connect(master);
    const lead = ctx.createGain(); lead.gain.value = 0.38; lead.connect(master);
    const pad = ctx.createGain(); pad.gain.value = 0.28; pad.connect(master);

    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    {
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    }

    function hitKick(t) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.08);
      g.gain.setValueAtTime(1.0, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g); g.connect(drums);
      osc.start(t); osc.stop(t + 0.13);
    }

    function hitHat(t) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 5500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(bp); bp.connect(g); g.connect(drums);
      src.start(t); src.stop(t + 0.06);
    }

    function hitClap(t) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.10);
      src.connect(bp); bp.connect(g); g.connect(drums);
      src.start(t); src.stop(t + 0.12);
    }

    function note(bus, freq, t, dur, type = "sine", gain = 0.18) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(bus);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    const scale = [0, 2, 4, 7, 9];
    function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    audio = {
      ctx, master, drums, bass, lead, pad,
      hitKick, hitHat, hitClap, note, midiToHz, scale,
      startedAt: 0,
      nextStepTime: 0,
      step: 0
    };
  }

  function audioStart() {
    if (!save.settings.music) return;
    audioInit();
    if (audio.ctx.state !== "running") audio.ctx.resume();
    audio.startedAt = audio.ctx.currentTime;
    audio.nextStepTime = audio.ctx.currentTime + 0.05;
    audio.step = 0;
    audio.master.gain.setTargetAtTime(0.7, audio.ctx.currentTime, 0.03);
  }

  function audioStop() {
    if (!audio) return;
    audio.master.gain.setTargetAtTime(0.0001, audio.ctx.currentTime, 0.03);
  }

  function audioTick() {
    if (!audio || !save.settings.music) return;

    const ctx = audio.ctx;
    const now = ctx.currentTime;

    while (audio.nextStepTime < now + 0.12) {
      const t = audio.nextStepTime;
      const vibe = state.vibeStage;
      const s = audio.step % 16;

      if (s % 4 === 0) audio.hitKick(t);
      if (s % 2 === 0) audio.hitHat(t);
      if (vibe >= 1 && (s === 4 || s === 12)) audio.hitClap(t);

      const root = 50 + (vibe === 2 ? 5 : 0);
      if (s % 4 === 0) audio.note(audio.bass, audio.midiToHz(root), t, 0.16, "triangle", 0.18);

      const baseM = 62 + (vibe === 2 ? 2 : 0);
      const pick = audio.scale[(s + vibe) % audio.scale.length];
      if (vibe >= 1 && (s === 2 || s === 6 || s === 10 || s === 14)) {
        audio.note(audio.lead, audio.midiToHz(baseM + pick), t, 0.12, "sawtooth", 0.09);
      }
      if (vibe >= 2 && (s === 1 || s === 9)) {
        audio.note(audio.lead, audio.midiToHz(baseM + pick + 12), t, 0.09, "square", 0.05);
      }

      if (s === 0) {
        const m = 57 + (vibe === 2 ? 2 : 0);
        audio.note(audio.pad, audio.midiToHz(m), t, 0.45, "sine", 0.05);
        audio.note(audio.pad, audio.midiToHz(m + 7), t, 0.45, "sine", 0.04);
      }

      const spb = 60 / state.bpm;
      audio.nextStepTime += spb / 4;
      audio.step++;
    }
  }

  /* =========================
     GAME STATE
  ========================= */
  const state = {
    mode: "menu",
    running: false,

    score: 0,
    combo: 0,
    streak: 0,
    coins: save.coins,
    lives: 3,

    bpm: 80,
    level: 1,
    energy: 0,
    vibeStage: 0,
    timeAlive: 0,

    beatStart: 0,

    bounds: { w: 0, h: 0 },
    target: { x: 0, y: 0, r: 85 },
    targetTo: { x: 0, y: 0 },

    stats: { hits: 0, miss: 0, perfect: 0, great: 0, good: 0 },

    lastFrame: performance.now(),
    reduceMotion: !!save.settings.reduceMotion
  };

  function resetRun() {
    state.running = false;
    state.score = 0;
    state.combo = 0;
    state.streak = 0;
    state.lives = 3;
    state.bpm = 80;
    state.level = 1;
    state.energy = 0;
    state.vibeStage = 0;
    state.timeAlive = 0;
    state.stats = { hits: 0, miss: 0, perfect: 0, great: 0, good: 0 };
    updateHUD(true);
    buildLives();
  }

  /* =========================
     HUD/UI
  ========================= */
  function buildLives() {
    if (!livesEl) return;
    livesEl.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const h = document.createElement("div");
      h.className = "heart" + (i < state.lives ? "" : " heart--off");
      livesEl.appendChild(h);
    }
  }

  function updateLives() {
    const hearts = [...livesEl.querySelectorAll(".heart")];
    hearts.forEach((h, i) => {
      if (i < state.lives) h.classList.remove("heart--off");
      else h.classList.add("heart--off");
    });
  }

  function updateHUD(full = false) {
    if (scoreEl) scoreEl.textContent = Math.floor(state.score);
    if (comboEl) comboEl.textContent = state.combo;
    if (coinsEl) coinsEl.textContent = state.coins;
    if (bpmEl) bpmEl.textContent = Math.round(state.bpm);
    if (levelEl) levelEl.textContent = state.level;

    if (vibeEl) vibeEl.textContent = state.vibeStage === 0 ? "Verse" : (state.vibeStage === 1 ? "Build" : "Chorus");
    if (energyFill) energyFill.style.width = `${Math.max(0, Math.min(100, state.energy))}%`;
    if (energyPctEl) energyPctEl.textContent = `${Math.round(state.energy)}%`;
    if (streakEl) streakEl.textContent = state.streak;

    if (full) updateLives();
  }

  function showJudgement(text, kind) {
    const cls =
      kind === "perfect" ? "pop pop--perfect" :
      kind === "great" ? "pop pop--great" :
      kind === "good" ? "pop pop--good" :
      "pop pop--miss";

    if (!judgementEl) return;
    judgementEl.innerHTML = `<div class="${cls}">${text}</div>`;
    setTimeout(() => {
      if (judgementEl && judgementEl.innerHTML.includes(text)) judgementEl.innerHTML = "";
    }, 520);
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function showScreen(name) {
    if (screenSplash) screenSplash.setAttribute("aria-hidden", "true");
    if (screenMenu) screenMenu.setAttribute("aria-hidden", "true");
    if (screenGame) screenGame.setAttribute("aria-hidden", "true");

    if (name === "splash" && screenSplash) screenSplash.setAttribute("aria-hidden", "false");
    if (name === "menu" && screenMenu) screenMenu.setAttribute("aria-hidden", "false");
    if (name === "game" && screenGame) screenGame.setAttribute("aria-hidden", "false");
    state.mode = name;
  }

  /* =========================
     PARTICLES (canvas background)
  ========================= */
  let particles = [];

  function resizeFx() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fxCanvas.width = Math.floor(window.innerWidth * dpr);
    fxCanvas.height = Math.floor(window.innerHeight * dpr);
    fxCanvas.style.width = "100%";
    fxCanvas.style.height = "100%";
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedStars() {
    particles = [];
    const count = state.reduceMotion ? 60 : 140;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() * 2 - 1) * 0.06,
        vy: (Math.random() * 2 - 1) * 0.06,
        r: Math.random() * 1.6 + 0.6,
        a: Math.random() * 0.6 + 0.25,
        hue: [165, 200, 325][Math.floor(Math.random() * 3)]
      });
    }
  }

  function burstConfetti(x, y, n = 18) {
    if (state.reduceMotion) return;
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: (Math.random() * 2 - 1) * 2.2,
        vy: (Math.random() * 2 - 1) * 2.2 - 1.8,
        r: Math.random() * 2.2 + 1.2,
        a: 0.95,
        hue: [165, 200, 325, 40][Math.floor(Math.random() * 4)],
        life: 700 + Math.random() * 450,
        born: now,
        confetti: true
      });
    }
  }

  function drawFx(dt) {
    fx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    fx.globalCompositeOperation = "source-over";
    fx.fillStyle = "rgba(255,255,255,0.02)";
    fx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    const now = performance.now();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      if (p.confetti) {
        const age = now - p.born;
        const t = age / p.life;
        if (t >= 1) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += 0.012;
        p.x += p.vx;
        p.y += p.vy;
        p.a = 0.95 * (1 - t);

        fx.save();
        fx.globalAlpha = p.a;
        fx.fillStyle = `hsla(${p.hue}, 90%, 65%, 1)`;
        fx.translate(p.x, p.y);
        fx.rotate((age / 120) % (Math.PI * 2));
        fx.fillRect(-p.r, -p.r, p.r * 2.2, p.r * 1.2);
        fx.restore();
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < -20) p.x = window.innerWidth + 20;
      if (p.x > window.innerWidth + 20) p.x = -20;
      if (p.y < -20) p.y = window.innerHeight + 20;
      if (p.y > window.innerHeight + 20) p.y = -20;

      fx.globalAlpha = p.a;
      fx.fillStyle = `hsla(${p.hue}, 85%, 75%, 1)`;
      fx.beginPath();
      fx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      fx.fill();
    }

    fx.globalAlpha = 1;
  }

  /* =========================
     DISTRACTORS (DOM)
  ========================= */
  let distractors = [];

  function spawnDistractor() {
    if (state.reduceMotion) return;
    if (!distractorsEl) return;

    const el = document.createElement("div");
    el.className = "distractor";

    const y = 60 + Math.random() * (state.bounds.h - 120);
    const dir = Math.random() < 0.5 ? -1 : 1;
    const x = dir < 0 ? state.bounds.w + 80 : -80;
    const speed = 70 + Math.random() * 140;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    distractorsEl.appendChild(el);

    distractors.push({ el, x, y, dir, speed });
  }

  function updateDistractors(dt) {
    for (let i = distractors.length - 1; i >= 0; i--) {
      const d = distractors[i];
      d.x += d.dir * d.speed * dt;
      d.el.style.transform = `translate(${d.x}px, ${d.y}px) rotate(${(performance.now() / 400) % 360}deg)`;
      if ((d.dir < 0 && d.x < -160) || (d.dir > 0 && d.x > state.bounds.w + 160)) {
        d.el.remove();
        distractors.splice(i, 1);
      }
    }
    if (distractors.length > 6) {
      const d = distractors.shift();
      d.el.remove();
    }
  }

  /* =========================
     TARGET MOTION
  ========================= */
  function measureBounds() {
    if (!playfield) return;
    const r = playfield.getBoundingClientRect();
    state.bounds.w = r.width;
    state.bounds.h = r.height;

    const base = Math.min(r.width, r.height);
    state.target.r = Math.max(62, Math.min(92, base * 0.17));

    if (!state.target.x && !state.target.y) {
      state.target.x = r.width * 0.55;
      state.target.y = r.height * 0.55;
      state.targetTo.x = state.target.x;
      state.targetTo.y = state.target.y;
    }
  }

  function pickNewTarget() {
    const pad = state.target.r + 22;
    const x = pad + Math.random() * (state.bounds.w - pad * 2);
    const y = pad + Math.random() * (state.bounds.h - pad * 2);
    state.targetTo.x = x;
    state.targetTo.y = y;
  }

  function renderTarget() {
    if (!targetEl) return;
    targetEl.style.transform = `translate(${state.target.x - state.target.r}px, ${state.target.y - state.target.r}px)`;
    targetEl.style.width = `${state.target.r * 2}px`;
    targetEl.style.height = `${state.target.r * 2}px`;

    const core = targetEl.querySelector(".target__core");
    if (core) core.style.inset = `${Math.max(26, state.target.r * 0.42)}px`;
  }

  function updateTarget(dt) {
    const speed = state.reduceMotion ? 5.5 : 7.5;
    state.target.x += (state.targetTo.x - state.target.x) * (1 - Math.exp(-speed * dt));
    state.target.y += (state.targetTo.y - state.target.y) * (1 - Math.exp(-speed * dt));
    renderTarget();
  }

  /* =========================
     HIT WINDOWS
  ========================= */
  function hitWindowMs() {
    const perfect = Math.max(110, 140 - (state.level - 1) * 6);
    const great = Math.max(200, 240 - (state.level - 1) * 8);
    const good = Math.max(260, 300 - (state.level - 1) * 6);
    return { perfect, great, good };
  }

  function nearestBeatDeltaMs(nowMs) {
    const spb = 60000 / state.bpm;
    const sinceStart = nowMs - state.beatStart;
    const beatFloat = sinceStart / spb;
    const nearest = Math.round(beatFloat);
    const nearestTime = state.beatStart + nearest * spb;
    return nowMs - nearestTime;
  }

  function inCircle(px, py) {
    const dx = px - state.target.x;
    const dy = py - state.target.y;
    return (dx * dx + dy * dy) <= (state.target.r * state.target.r);
  }

  function haptic(kind) {
    if (!save.settings.haptics) return;
    if (!navigator.vibrate) return;
    if (kind === "perfect") navigator.vibrate([12]);
    else if (kind === "great") navigator.vibrate([10]);
    else if (kind === "good") navigator.vibrate([8]);
    else navigator.vibrate([20, 30, 20]);
  }

  function addCoins(n) {
    state.coins += n;
    save.coins = state.coins;
    persist();
  }

  function onHit(kind) {
    state.stats.hits++;
    state.combo++;
    state.streak++;
    save.bestCombo = Math.max(save.bestCombo, state.combo);

    const mult = 1 + Math.min(2.5, state.combo / 18);
    const add = kind === "perfect" ? 120 : kind === "great" ? 80 : 45;
    state.score += add * mult;

    const eAdd = kind === "perfect" ? 6 : kind === "great" ? 4 : 2;
    state.energy = Math.min(100, state.energy + eAdd);

    if (kind === "perfect") addCoins(2);
    else if (kind === "great") addCoins(1);

    if (kind === "perfect") state.stats.perfect++;
    else if (kind === "great") state.stats.great++;
    else state.stats.good++;

    showJudgement(kind.toUpperCase(), kind);
    burstConfetti(state.target.x, state.target.y, kind === "perfect" ? 26 : 14);

    if (state.combo % 3 === 0) state.bpm = Math.min(160, state.bpm + 1.5);
    if (state.combo % 2 === 0) pickNewTarget();

    if (state.combo >= 18 || state.energy >= 45) state.vibeStage = 1;
    if (state.combo >= 35 || state.energy >= 75) state.vibeStage = 2;

    state.level = 1 + Math.floor(state.score / 2000);

    checkAchievements();
    updateHUD();
    haptic(kind);
  }

  function onMiss(reason = "MISS") {
    state.stats.miss++;
    state.combo = 0;
    state.streak = 0;

    state.lives = Math.max(0, state.lives - 1);
    updateLives();

    showJudgement(reason, "miss");
    haptic("miss");

    state.energy = Math.max(0, state.energy - 10);
    state.bpm = Math.max(78, state.bpm - 2.5);

    if (state.lives <= 0) {
      endRun();
      return;
    }
    updateHUD();
  }

  function judgeTap(dtMs) {
    const { perfect, great, good } = hitWindowMs();
    const a = Math.abs(dtMs);

    if (a <= perfect) return "perfect";
    if (a <= great) return "great";
    if (a <= good) return "good";
    return "miss";
  }

  /* =========================
     RUN LOOP
  ========================= */
  function startRun() {
    resetRun();
    state.running = true;

    measureBounds();
    applySkin(save.settings.skin);
    buildSkinGrid();

    state.beatStart = performance.now();

    pickNewTarget();
    renderTarget();

    audioStart();

    if (distractorsEl) distractorsEl.innerHTML = "";
    distractors = [];

    updateHUD(true);

    if (!save.seenTutorial && tutorial) {
      tutorial.classList.remove("hidden");
      tutorial.setAttribute("aria-hidden", "false");
    }
  }

  function endRun() {
    state.running = false;

    save.bestScore = Math.max(save.bestScore, Math.floor(state.score));
    save.bestCombo = Math.max(save.bestCombo, state.combo);
    persist();

    audioStop();
    renderAchievements();
    showScreen("menu");
  }

  function frame(now) {
    const dt = Math.min(0.04, (now - state.lastFrame) / 1000);
    state.lastFrame = now;

    drawFx(dt * 60);

    if (state.mode === "game" && state.running) {
      state.timeAlive += dt;

      if (!state.reduceMotion && Math.random() < dt * 0.08) spawnDistractor();

      state.energy = Math.max(0, state.energy - dt * 1.15);
      state.bpm = Math.min(160, state.bpm + dt * 0.25);

      updateTarget(dt);
      updateDistractors(dt);

      audioTick();
      updateHUD();
      checkAchievements();
    }

    requestAnimationFrame(frame);
  }

  /* =========================
     INPUT
  ========================= */
  function getPointerPos(e) {
    const r = playfield.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - r.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - r.top;
    return { x, y };
  }

  function onPointerDown(e) {
    if (state.mode !== "game" || !state.running) return;
    e.preventDefault();

    const p = getPointerPos(e);

    if (!inCircle(p.x, p.y)) {
      onMiss("MISS");
      return;
    }

    const dtMs = nearestBeatDeltaMs(performance.now());
    const res = judgeTap(dtMs);

    if (res === "miss") {
      onMiss("MISS");
      return;
    }
    onHit(res);
  }

  if (playfield) {
    playfield.addEventListener("pointerdown", onPointerDown, { passive: false });
    playfield.addEventListener("touchstart", onPointerDown, { passive: false });
  }

  /* =========================
     MENU + MODALS + SETTINGS
  ========================= */
  function wireModalClose(modal) {
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-close") === "1") closeModal(modal);
    });
  }
  wireModalClose(modalSettings);
  wireModalClose(modalShop);
  wireModalClose(modalAchievements);

  function syncSettingsUI() {
    if (toggleMusic) toggleMusic.checked = !!save.settings.music;
    if (toggleHaptics) toggleHaptics.checked = !!save.settings.haptics;
    if (toggleReduceMotion) toggleReduceMotion.checked = !!save.settings.reduceMotion;
  }

  if (toggleMusic) toggleMusic.addEventListener("change", () => {
    save.settings.music = toggleMusic.checked;
    persist();
    if (!save.settings.music) audioStop();
    else if (state.mode === "game" && state.running) audioStart();
  });

  if (toggleHaptics) toggleHaptics.addEventListener("change", () => {
    save.settings.haptics = toggleHaptics.checked;
    persist();
  });

  if (toggleReduceMotion) toggleReduceMotion.addEventListener("change", () => {
    save.settings.reduceMotion = toggleReduceMotion.checked;
    state.reduceMotion = save.settings.reduceMotion;
    persist();
    seedStars();
  });

  if (btnSettings) btnSettings.addEventListener("click", () => {
    syncSettingsUI();
    buildSkinGrid();
    openModal(modalSettings);
  });

  if (btnSettingsMenu) btnSettingsMenu.addEventListener("click", () => {
    syncSettingsUI();
    buildSkinGrid();
    openModal(modalSettings);
  });

  if (btnShopMenu) btnShopMenu.addEventListener("click", () => openModal(modalShop));
  if (btnAchMenu) btnAchMenu.addEventListener("click", () => {
    renderAchievements();
    openModal(modalAchievements);
  });

  if (btnBackToMenu) btnBackToMenu.addEventListener("click", () => {
    closeModal(modalSettings);
    showScreen("menu");
    state.running = false;
    audioStop();
  });

  if (btnPlay) btnPlay.addEventListener("click", () => {
    showScreen("game");
    startRun();
  });

  if (btnTutorialOk) btnTutorialOk.addEventListener("click", () => {
    if (!tutorial) return;
    tutorial.classList.add("hidden");
    tutorial.setAttribute("aria-hidden", "true");
    save.seenTutorial = true;
    persist();
  });

  /* =========================
     STARTUP
  ========================= */
  function init() {
    showScreen("splash");

    state.coins = save.coins;

    buildLives();
    applySkin(save.settings.skin);
    syncSettingsUI();
    buildSkinGrid();

    renderAchievements();

    resizeFx();
    seedStars();

    window.addEventListener("resize", () => {
      resizeFx();
      seedStars();
      measureBounds();
      renderTarget();
    });

    setTimeout(() => {
      showScreen("menu");
    }, 1500);

    let lastTouchEnd = 0;
    document.addEventListener("touchend", (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 250) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });

    setTimeout(() => {
      measureBounds();
      renderTarget();
    }, 60);

    requestAnimationFrame(frame);
  }

  init();
})();