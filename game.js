/* TapBeat – single-file WebAudio rhythm toy (no external assets)
   - full-screen field
   - smooth moving target (lerp)
   - tap ONLY inside circle counts
   - wider hit window (configurable)
   - 3 lives (hearts)
   - music via WebAudio (verse -> chorus feel)
   - skins selectable
   - achievements + coins
   - confetti / stars FX on canvas
*/

(() => {
  const $ = (s) => document.querySelector(s);

  // Screens
  const splash = $("#splash");
  const menu = $("#menu");
  const game = $("#game");

  // Buttons
  const btnPlay = $("#btnPlay");
  const btnSettings = $("#btnSettings");
  const btnShop = $("#btnShop");
  const btnAch = $("#btnAch");
  const gear = $("#gear");
  const btnBackMenu = $("#btnBackMenu");

  // Modals
  const backdrop = $("#modalBackdrop");
  const modalSettings = $("#modalSettings");
  const modalShop = $("#modalShop");
  const modalAch = $("#modalAch");

  // Settings inputs
  const optMusic = $("#optMusic");
  const optHaptics = $("#optHaptics");
  const optWindow = $("#optWindow");
  const skinGrid = $("#skinGrid");

  // HUD
  const elScore = $("#score");
  const elCombo = $("#combo");
  const elCoins = $("#coins");
  const elBpm = $("#bpm");
  const elLv = $("#lv");
  const elVibe = $("#hudVibe");
  const elEnergyFill = $("#energyFill");
  const elEnergyPct = $("#energyPct");
  const elStreak = $("#streak");

  const elVibeMenu = $("#hudVibeMenu");
  const elEnergyFillMenu = $("#energyFillMenu");
  const elEnergyPctMenu = $("#energyPctMenu");
  const elStreakMenu = $("#streakMenu");

  const h1 = $("#h1"), h2 = $("#h2"), h3 = $("#h3");

  // Playfield
  const field = $("#field");
  const ring = $("#ring");
  const judge = $("#judge");
  const fly = $("#fly");

  // FX canvas
  const fx = $("#fx");
  const ctx = fx.getContext("2d", { alpha: true });

  // --------- State ----------
  const LS_KEY = "tapbeat_save_v1";
  const save = loadSave();

  const state = {
    running: false,
    startedAt: 0,
    lastBeatAt: 0,
    bpm: 80,
    lv: 1,
    score: 0,
    combo: 0,
    streak: 0,
    coins: save.coins ?? 0,
    lives: 3,
    energy: 0,        // 0..100
    vibe: "Verse",     // Verse / Build / Chorus
    hitWindowMs: save.hitWindowMs ?? 210, // adjustable (bigger = easier)
    musicOn: save.musicOn ?? true,
    hapticsOn: save.hapticsOn ?? true,
    skin: save.skin ?? "Aurora",
    // ring movement
    x: 0.5, y: 0.62,
    tx: 0.5, ty: 0.62,
    ringPx: { x: 0, y: 0, r: 95 },
    // beat scheduling
    beatIndex: 0,
    // fly-by
    nextFlyAt: 0,
  };

  // Skins (all tryable)
  const SKINS = [
    { name: "Aurora",   core: ["#2cf0df", "#ff4f9a"], rim: "rgba(255,255,255,0.30)" },
    { name: "Mint",     core: ["#2cff8b", "#2cf0df"], rim: "rgba(255,255,255,0.28)" },
    { name: "Candy",    core: ["#ff4f9a", "#ffd86a"], rim: "rgba(255,255,255,0.30)" },
    { name: "Sky",      core: ["#6aa8ff", "#2cf0df"], rim: "rgba(255,255,255,0.26)" },
    { name: "Cherry",   core: ["#ff2f6d", "#ff9ad1"], rim: "rgba(255,255,255,0.30)" },
    { name: "Neon",     core: ["#b6ff5c", "#2cf0df"], rim: "rgba(255,255,255,0.26)" },
  ];

  // Achievements
  const ACH = [
    { id: "first_hit",  name: "First Touch",   desc: "Hit your first beat." },
    { id: "combo_10",   name: "Combo x10",     desc: "Reach a 10 combo." },
    { id: "combo_25",   name: "Combo x25",     desc: "Reach a 25 combo." },
    { id: "survivor",   name: "Still Standing",desc: "Finish a run with 1 life left." },
    { id: "coins_50",   name: "Shiny",         desc: "Earn 50 coins total." },
    { id: "chorus",     name: "Into the Chorus",desc:"Reach the Chorus vibe." },
  ];
  const unlocked = new Set(save.ach ?? []);

  // ---------- WebAudio (simple but fun) ----------
  let audio = null;

  function ensureAudio() {
    if (audio) return audio;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    const ac = new AudioCtx();

    // master
    const master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(ac.destination);

    // music bus
    const music = ac.createGain();
    music.gain.value = 0.85;
    music.connect(master);

    // kick bus
    const kickBus = ac.createGain();
    kickBus.gain.value = 0.9;
    kickBus.connect(music);

    // hats bus
    const hatBus = ac.createGain();
    hatBus.gain.value = 0.55;
    hatBus.connect(music);

    // lead bus
    const leadBus = ac.createGain();
    leadBus.gain.value = 0.55;
    leadBus.connect(music);

    audio = { ac, master, music, kickBus, hatBus, leadBus, started: false };
    return audio;
  }

  function beepHit(type) {
    const a = ensureAudio();
    if (!a || !state.musicOn) return;
    // tiny click / sparkle
    const t = a.ac.currentTime;
    const o = a.ac.createOscillator();
    const g = a.ac.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(type === "perfect" ? 1200 : 900, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(type === "miss" ? 0.06 : 0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(a.master);
    o.start(t);
    o.stop(t + 0.12);
  }

  function scheduleBeatSound(beatTime, step) {
    const a = ensureAudio();
    if (!a || !state.musicOn) return;

    // kick every beat
    kick(beatTime, step);

    // hats every 1/2 beat in build/chorus (we fake by adding extra hats on even steps)
    if (state.vibe !== "Verse" && step % 2 === 0) hat(beatTime + 0.5 * beatDur(), 0.35);

    // lead in chorus
    if (state.vibe === "Chorus") lead(beatTime, step);
  }

  function beatDur() {
    return 60 / state.bpm;
  }

  function kick(t, step) {
    const a = ensureAudio();
    const ac = a.ac;

    const o = ac.createOscillator();
    const g = ac.createGain();

    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.08);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    o.connect(g).connect(a.kickBus);
    o.start(t);
    o.stop(t + 0.14);

    // little punch on downbeats
    if (step % 4 === 0) {
      const p = ac.createOscillator();
      const pg = ac.createGain();
      p.type = "triangle";
      p.frequency.setValueAtTime(220, t);
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      p.connect(pg).connect(a.music);
      p.start(t);
      p.stop(t + 0.1);
    }
  }

  function hat(t, amt = 0.45) {
    const a = ensureAudio();
    const ac = a.ac;

    const bufferSize = 2 * ac.sampleRate * 0.03;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 4);

    const src = ac.createBufferSource();
    src.buffer = buffer;

    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amt, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);

    src.connect(hp).connect(g).connect(a.hatBus);
    src.start(t);
    src.stop(t + 0.05);
  }

  function lead(t, step) {
    const a = ensureAudio();
    const ac = a.ac;

    const scale = [0, 3, 5, 7, 10]; // minor-ish
    const base = 440 * Math.pow(2, -1); // 220
    const note = scale[(step / 2) % scale.length | 0];
    const freq = base * Math.pow(2, note / 12);

    const o = ac.createOscillator();
    const g = ac.createGain();

    o.type = "sawtooth";
    o.frequency.setValueAtTime(freq, t);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    o.connect(g).connect(a.leadBus);
    o.start(t);
    o.stop(t + 0.25);
  }

  // ---------- FX particles ----------
  const particles = [];
  function resizeFx() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    fx.width = Math.floor(window.innerWidth * dpr);
    fx.height = Math.floor(window.innerHeight * dpr);
    fx.style.width = "100%";
    fx.style.height = "100%";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", () => {
    resizeFx();
    computeRingMetrics();
  });

  function spawnConfetti(x, y, power = 16) {
    const colors = ["#2cff8b", "#2cf0df", "#ff4f9a", "#ffd86a", "#6aa8ff"];
    for (let i = 0; i < power; i++) {
      particles.push({
        x, y,
        vx: (Math.random() * 2 - 1) * 3.8,
        vy: (Math.random() * -1) * 4.6 - 1.5,
        g: 0.12 + Math.random() * 0.10,
        a: 1,
        s: 2 + Math.random() * 3,
        r: Math.random() * Math.PI,
        vr: (Math.random() * 2 - 1) * 0.25,
        c: colors[(Math.random() * colors.length) | 0],
        t: Math.random() < 0.5 ? "star" : "dot",
      });
    }
  }

  function stepFx() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // gentle stars in background
    if (Math.random() < 0.18) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: -10,
        vx: (Math.random() * 2 - 1) * 0.15,
        vy: 0.5 + Math.random() * 1.2,
        g: 0,
        a: 0.7,
        s: 1 + Math.random() * 2.2,
        r: Math.random() * Math.PI,
        vr: 0.01,
        c: "rgba(255,255,255,0.85)",
        t: "spark",
      });
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      p.a *= 0.985;

      if (p.a < 0.05 || p.y > window.innerHeight + 40) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);

      if (p.t === "star" || p.t === "spark") {
        drawStar(0, 0, p.s * 0.55, p.s, 5, p.c);
      } else {
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(0, 0, p.s, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    requestAnimationFrame(stepFx);
  }

  function drawStar(x, y, r1, r2, n, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const ang = (i * Math.PI) / n;
      const r = i % 2 === 0 ? r2 : r1;
      ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------- UI helpers ----------
  function showScreen(el) {
    [splash, menu, game].forEach(s => s.classList.remove("is-on"));
    el.classList.add("is-on");

    splash.setAttribute("aria-hidden", el !== splash);
    menu.setAttribute("aria-hidden", el !== menu);
    game.setAttribute("aria-hidden", el !== game);
  }

  function openModal(m) {
    backdrop.classList.add("is-on");
    backdrop.setAttribute("aria-hidden", "false");
    m.classList.add("is-on");
    m.setAttribute("aria-hidden", "false");
  }
  function closeModal() {
    backdrop.classList.remove("is-on");
    backdrop.setAttribute("aria-hidden", "true");
    [modalSettings, modalShop, modalAch].forEach(m => {
      m.classList.remove("is-on");
      m.setAttribute("aria-hidden", "true");
    });
  }
  backdrop.addEventListener("click", closeModal);
  document.addEventListener("click", (e) => {
    if (e.target && e.target.matches("[data-close]")) closeModal();
  });

  function haptic(ms = 18) {
    if (!state.hapticsOn) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function setJudge(type, text) {
    judge.className = "judge show";
    if (type === "perfect") judge.classList.add("judge--perfect");
    if (type === "great") judge.classList.add("judge--great");
    if (type === "miss") judge.classList.add("judge--miss");
    judge.textContent = text;

    judge.setAttribute("aria-hidden", "false");
    // restart animation
    void judge.offsetWidth;
    judge.classList.add("show");
  }

  function updateHearts() {
    [h1, h2, h3].forEach((h, i) => {
      const on = state.lives >= (3 - i);
      h.classList.toggle("is-off", !on);
    });
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- Achievements ----------
  function unlock(id) {
    if (unlocked.has(id)) return;
    unlocked.add(id);
    save.ach = Array.from(unlocked);
    persistSave();
    // small celebration
    spawnConfetti(window.innerWidth * 0.5, window.innerHeight * 0.35, 26);
  }

  function renderAch() {
    const root = $("#achList");
    root.innerHTML = "";
    ACH.forEach(a => {
      const div = document.createElement("div");
      div.className = "ach" + (unlocked.has(a.id) ? " is-done" : "");
      div.innerHTML = `<b>${a.name}</b><div class="s">${a.desc}</div>`;
      root.appendChild(div);
    });
  }

  // ---------- Skins ----------
  function renderSkins() {
    skinGrid.innerHTML = "";
    SKINS.forEach(s => {
      const b = document.createElement("button");
      b.className = "skin" + (state.skin === s.name ? " is-on" : "");
      b.textContent = s.name;
      b.addEventListener("click", () => {
        state.skin = s.name;
        applySkin();
        renderSkins();
        save.skin = state.skin;
        persistSave();
      });
      skinGrid.appendChild(b);
    });
  }

  function applySkin() {
    const s = SKINS.find(x => x.name === state.skin) || SKINS[0];
    const core = ring.querySelector(".ring__core");
    core.style.borderColor = s.rim;

    // recolor core by setting CSS background via inline style
    core.style.background =
      `radial-gradient(circle at 55% 35%, rgba(255,255,255,0.85), rgba(255,255,255,0.20) 28%, rgba(0,0,0,0) 55%),
       radial-gradient(circle at 30% 30%, ${s.core[0]}, rgba(0,0,0,0) 55%),
       radial-gradient(circle at 70% 75%, ${s.core[1]}, rgba(0,0,0,0) 55%),
       rgba(255,255,255,0.10)`;
  }

  // ---------- Gameplay ----------
  let raf = 0;

  function resetRun() {
    state.running = false;
    state.startedAt = performance.now();
    state.lastBeatAt = performance.now();
    state.bpm = 80;
    state.lv = 1;
    state.score = 0;
    state.combo = 0;
    state.streak = 0;
    state.lives = 3;
    state.energy = 0;
    state.vibe = "Verse";
    state.beatIndex = 0;
    state.nextFlyAt = performance.now() + 4500;
    setTarget(true);
    updateUI();
    updateHearts();
  }

  function startRun() {
    resetRun();
    state.running = true;

    // iOS needs audio resume on user gesture
    const a = ensureAudio();
    if (a && a.ac.state === "suspended") a.ac.resume().catch(()=>{});

    // schedule initial beat time a bit in the future so player feels ready
    state.lastBeatAt = performance.now() + 650;
    state.startedAt = performance.now();

    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function endRun(reason = "gameover") {
    state.running = false;
    cancelAnimationFrame(raf);

    if (state.lives === 1) unlock("survivor");

    // go back to menu
    updateMenuHudFromState();
    showScreen(menu);
  }

  function setTarget(force = false) {
    // set new target position (normalized)
    // Keep inside safe margins so ring never clips.
    const mx = 0.16, my = 0.18;
    const nx = mx + Math.random() * (1 - mx * 2);
    const ny = my + Math.random() * (1 - my * 2);

    state.tx = nx;
    state.ty = ny;

    if (force) {
      state.x = nx;
      state.y = ny;
    }
  }

  function computeRingMetrics() {
    const rect = field.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    // radius from current CSS (half width)
    const r = ringRect.width / 2;
    state.ringPx.r = r;
    // center set by our positioning function each frame
    state.ringPx.x = rect.left + rect.width * state.x;
    state.ringPx.y = rect.top + rect.height * state.y;
  }

  function updateUI() {
    elScore.textContent = String(state.score);
    elCombo.textContent = String(state.combo);
    elCoins.textContent = String(state.coins);
    elBpm.textContent = String(Math.round(state.bpm));
    elLv.textContent = String(state.lv);

    elVibe.textContent = state.vibe;
    elStreak.textContent = String(state.streak);
    elEnergyFill.style.width = `${state.energy}%`;
    elEnergyPct.textContent = `${Math.round(state.energy)}%`;
  }

  function updateMenuHudFromState() {
    elVibeMenu.textContent = state.vibe;
    elStreakMenu.textContent = String(state.streak);
    elEnergyFillMenu.style.width = `${state.energy}%`;
    elEnergyPctMenu.textContent = `${Math.round(state.energy)}%`;
  }

  function vibeProgression() {
    // energy and vibe based on combo and time
    if (state.combo >= 18) state.vibe = "Chorus";
    else if (state.combo >= 7) state.vibe = "Build";
    else state.vibe = "Verse";

    if (state.vibe === "Chorus") unlock("chorus");

    // bpm ramps slower at first, faster later
    const targetBpm = 80 + Math.min(50, state.combo * 1.8) + Math.min(20, (performance.now() - state.startedAt) / 8000);
    state.bpm += (targetBpm - state.bpm) * 0.04;

    // level from bpm
    state.lv = 1 + Math.floor((state.bpm - 80) / 12);
  }

  function maybeFlyBy(now) {
    if (now < state.nextFlyAt) return;
    state.nextFlyAt = now + 3800 + Math.random() * 3200;

    const emojis = ["✨","⚡️","🔥","💫","🍬","⭐️","🪽"];
    const e = document.createElement("div");
    e.className = "thing";
    const y = 80 + Math.random() * (field.clientHeight - 200);
    e.style.setProperty("--y", `${y}px`);
    e.textContent = emojis[(Math.random() * emojis.length) | 0];
    fly.appendChild(e);
    setTimeout(() => e.remove(), 2600);
  }

  function loop(now) {
    if (!state.running) return;

    vibeProgression();
    updateUI();
    maybeFlyBy(now);

    // Smooth movement (lerp) — no jerks
    const moveSpeed = 0.035 + Math.min(0.03, state.bpm / 3000);
    state.x += (state.tx - state.x) * moveSpeed;
    state.y += (state.ty - state.y) * moveSpeed;

    // Apply ring position (px)
    const rect = field.getBoundingClientRect();
    const px = rect.width * state.x;
    const py = rect.height * state.y;

    ring.style.left = `${px}px`;
    ring.style.top = `${py}px`;
    ring.style.transform = `translate(-50%, -50%)`;

    // update ring metrics for hit test
    state.ringPx.x = rect.left + px;
    state.ringPx.y = rect.top + py;
    state.ringPx.r = ring.getBoundingClientRect().width / 2;

    // Beat scheduler (based on performance clock)
    const beatMs = (60 / state.bpm) * 1000;

    while (state.lastBeatAt <= now) {
      // beat event
      const beatTimeAudio = (() => {
        const a = ensureAudio();
        if (!a) return null;
        // map perf.now to audio time
        // we can't perfectly sync; but it's good enough for casual play
        return a.ac.currentTime + 0.04;
      })();

      if (beatTimeAudio != null) scheduleBeatSound(beatTimeAudio, state.beatIndex);

      // Move target each beat to keep it lively, but not too aggressive early
      if (state.beatIndex % 1 === 0) setTarget(false);

      // Spawn soft ambient confetti sometimes in chorus
      if (state.vibe === "Chorus" && Math.random() < 0.25) {
        spawnConfetti(rect.left + rect.width * (0.2 + Math.random()*0.6), rect.top + rect.height * (0.25 + Math.random()*0.5), 8);
      }

      state.lastBeatAt += beatMs;
      state.beatIndex++;
    }

    raf = requestAnimationFrame(loop);
  }

  // Hit detection:
  // 1) must tap inside circle area (distance <= r)
  // 2) must be close to beat time (abs(delta) <= hitWindowMs)
  function onTap(clientX, clientY) {
    if (!state.running) return;

    const dx = clientX - state.ringPx.x;
    const dy = clientY - state.ringPx.y;
    const dist = Math.hypot(dx, dy);

    const inside = dist <= state.ringPx.r; // WHOLE circle counts

    // timing vs nearest beat:
    const now = performance.now();
    const beatMs = (60 / state.bpm) * 1000;
    const nextBeat = state.lastBeatAt;           // scheduled future beat
    const prevBeat = state.lastBeatAt - beatMs;  // previous beat
    const deltaPrev = now - prevBeat;
    const deltaNext = nextBeat - now;
    const delta = Math.abs(deltaPrev) < Math.abs(deltaNext) ? deltaPrev : -deltaNext; // signed-ish
    const absDelta = Math.abs(delta);

    const windowMs = state.hitWindowMs;

    if (!inside) {
      miss(clientX, clientY, "MISS");
      return;
    }

    if (absDelta <= windowMs * 0.45) {
      perfect(clientX, clientY);
    } else if (absDelta <= windowMs) {
      great(clientX, clientY);
    } else {
      miss(clientX, clientY, "MISS");
    }
  }

  function perfect(x, y) {
    state.combo++;
    state.streak++;
    state.score += 35 + Math.min(65, state.combo);
    state.energy = clamp(state.energy + 4.6, 0, 100);
    state.coins += 1;

    ring.classList.remove("is-miss");
    ring.classList.add("is-hit");
    setTimeout(() => ring.classList.remove("is-hit"), 120);

    setJudge("perfect", "PERFECT!");
    spawnConfetti(x, y, 22);
    haptic(18);
    beepHit("perfect");

    unlock("first_hit");
    if (state.combo >= 10) unlock("combo_10");
    if (state.combo >= 25) unlock("combo_25");
    if (state.coins >= 50) unlock("coins_50");

    persistSaveCoins();
  }

  function great(x, y) {
    state.combo++;
    state.streak++;
    state.score += 18 + Math.min(40, state.combo);
    state.energy = clamp(state.energy + 2.4, 0, 100);
    if (state.combo % 3 === 0) state.coins += 1;

    ring.classList.remove("is-miss");
    ring.classList.add("is-hit");
    setTimeout(() => ring.classList.remove("is-hit"), 120);

    setJudge("great", "GREAT!");
    spawnConfetti(x, y, 12);
    haptic(12);
    beepHit("great");

    if (state.combo >= 10) unlock("combo_10");
    if (state.combo >= 25) unlock("combo_25");

    persistSaveCoins();
  }

  function miss(x, y, text) {
    state.combo = 0;
    state.streak = 0;
    state.energy = clamp(state.energy - 8, 0, 100);

    // lives system (no full reset!)
    state.lives -= 1;
    updateHearts();

    ring.classList.remove("is-hit");
    ring.classList.add("is-miss");
    setTimeout(() => ring.classList.remove("is-miss"), 140);

    setJudge("miss", text);
    spawnConfetti(x, y, 6);
    haptic(30);
    beepHit("miss");

    if (state.lives <= 0) {
      endRun("dead");
    }
  }

  // ---------- Input ----------
  function attachInput() {
    // pointerdown gives best iOS behavior
    field.addEventListener("pointerdown", (e) => {
      // prevent page gestures
      e.preventDefault();
      onTap(e.clientX, e.clientY);
    }, { passive: false });

    // also allow touchstart fallback
    field.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      onTap(t.clientX, t.clientY);
    }, { passive: false });
  }

  // ---------- Save ----------
  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }
  function persistSave() {
    const payload = {
      coins: state.coins,
      ach: Array.from(unlocked),
      hitWindowMs: state.hitWindowMs,
      musicOn: state.musicOn,
      hapticsOn: state.hapticsOn,
      skin: state.skin,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }
  function persistSaveCoins() {
    save.coins = state.coins;
    persistSave();
  }

  // ---------- Wire UI ----------
  function init() {
    resizeFx();
    stepFx();

    // initial settings
    optMusic.checked = state.musicOn;
    optHaptics.checked = state.hapticsOn;
    optWindow.value = String(state.hitWindowMs);
    renderSkins();
    applySkin();
    renderAch();
    updateHearts();

    // Events
    btnPlay.addEventListener("click", () => {
      showScreen(game);
      startRun();
    });

    btnSettings.addEventListener("click", () => {
      openModal(modalSettings);
    });

    btnShop.addEventListener("click", () => {
      openModal(modalShop);
    });

    btnAch.addEventListener("click", () => {
      renderAch();
      openModal(modalAch);
    });

    gear.addEventListener("click", () => {
      openModal(modalSettings);
    });

    btnBackMenu.addEventListener("click", () => {
      closeModal();
      endRun("menu");
    });

    optMusic.addEventListener("change", () => {
      state.musicOn = optMusic.checked;
      persistSave();
      // resume audio context if turning on
      if (state.musicOn) {
        const a = ensureAudio();
        if (a && a.ac.state === "suspended") a.ac.resume().catch(()=>{});
      }
    });

    optHaptics.addEventListener("change", () => {
      state.hapticsOn = optHaptics.checked;
      persistSave();
    });

    optWindow.addEventListener("input", () => {
      state.hitWindowMs = Number(optWindow.value);
      persistSave();
    });

    attachInput();

    // Show splash then menu (a bit longer)
    showScreen(splash);
    setTimeout(() => {
      showScreen(menu);
      updateMenuHudFromState();
    }, 1500);
  }

  // Prevent iOS double-tap zoom on buttons / field
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // Start
  init();

})();