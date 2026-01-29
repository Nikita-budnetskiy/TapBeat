/* TAPBEAT — v2
   - Moving target (after tutorial)
   - Tutorial overlay
   - Achievements + coin rewards (localStorage)
   - Shop stub (unlock with coins)
   - Settings overlay (Haptics/Sound/Tutorial) + persistence
   - More “alive” music (layers + variation) via WebAudio (no external assets)

   Files expected:
   - index.html includes elements with ids used below
   - style.css includes classes used below (.tap-ripple, .particle etc.)
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
  splashOverlay: $("splashOverlay"),
splashPresents: $("splashPresents"),
    stage: $("stage"),
    playfield: document.querySelector(".playfield"),
    target: $("target"),
    ringOuter: $("ringOuter"),
    ringInner: $("ringInner"),
    hint: $("hint"),
    judge: $("judge"),

    score: $("score"),
    combo: $("combo"),
    coins: $("coins"),
    bpm: $("bpm"),
    lvl: $("lvl"),
    bar: $("bar"),
    trackState: $("trackState"),
    energy: $("energy"),

    startOverlay: $("startOverlay"),
    pauseOverlay: $("pauseOverlay"),
    tutorialOverlay: $("tutorialOverlay"),
    achOverlay: $("achOverlay"),
    shopOverlay: $("shopOverlay"),
    settingsOverlay: $("settingsOverlay"),
    toast: $("toast"),

    btnStart: $("btnStart"),
    btnPause: $("btnPause"),
    btnResume: $("btnResume"),
    btnRestart: $("btnRestart"),

    btnShop: $("btnShop"),
    btnAchievements: $("btnAchievements"),
    btnSettings: $("btnSettings"),

    btnShopClose: $("btnShopClose"),
    btnAchClose: $("btnAchClose"),
    btnSettingsClose: $("btnSettingsClose"),

    modeSelect: $("modeSelect"),
    bpmSelect: $("bpmSelect"),
    haptics: $("haptics"),
    sound: $("sound"),
    tutorial: $("tutorial"),

    setHaptics: $("setHaptics"),
    setSound: $("setSound"),
    setTutorial: $("setTutorial"),

    tTitle: $("tTitle"),
    tText: $("tText"),
    btnTBack: $("btnTBack"),
    btnTNext: $("btnTNext"),
    btnTSkip: $("btnTSkip"),

    achList: $("achList"),
    shopGrid: $("shopGrid"),
    trail: $("trail"),
  };

  // ---------- Storage ----------
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    },
  };

  // ---------- State ----------
  const state = {
    running: false,
    paused: false,

    bpm: 128,
    beatMs: 60000 / 128,

    // judgement windows (ms)
    perfect: 42,
    great: 90,
    ok: 135,

    score: 0,
    combo: 0,
    coins: 0,
    level: 1,

    beatsThisRun: 0,
    beatsPerLevel: 24,

    // beat timing (perf ms)
    nextBeatAtMs: 0,
    lastBeatAtMs: 0,
    drift: 0,
    mode: "classic", // classic | drift

    // progression
    perfectStreak: 0,
    totalPerfectThisRun: 0,
    runStartedAt: 0,

    // settings
    audioOn: true,
    hapticsOn: true,
    tutorialOn: true,

    // target movement
    moveEnabled: false,
    moveEveryBeats: 4,
    positions: [
      { x: 0.50, y: 0.50 }, // center
      { x: 0.27, y: 0.32 },
      { x: 0.73, y: 0.32 },
      { x: 0.30, y: 0.70 },
      { x: 0.70, y: 0.70 },
    ],
    posIndex: 0,
    targetX: 0.5,
    targetY: 0.5,

    // audio
    audio: null,
    audioPerfZeroMs: 0,
    layers: {
      kick: true,
      hat: false,
      clap: false,
      bass: false,
      lead: false,
    },

    // achievements & shop
    achieved: {}, // id -> true
    owned: {}, // shop item id -> true
    selectedPack: "starter",
  };

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowMs = () => performance.now();

  function toast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("show"), 1600);
  }

  function vibrate(ms) {
    if (!state.hapticsOn) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  }

  function recomputeBeat() {
    state.beatMs = 60000 / state.bpm;
    el.bpm.textContent = String(state.bpm);
  }

  function updateEnergyUI() {
    // energy 0..100 based on combo
    const e = Math.floor(clamp((state.combo / 30) * 100, 0, 100));
    if (el.energy) el.energy.textContent = `Energy: ${e}%`;
  }

  function updateTrackStateLabel() {
    const parts = [];
    if (state.layers.kick) parts.push("Kick");
    if (state.layers.hat) parts.push("Hat");
    if (state.layers.clap) parts.push("Clap");
    if (state.layers.bass) parts.push("Bass");
    if (state.layers.lead) parts.push("Lead");
    el.trackState.textContent = `Track: ${parts.join(" + ")}`;
  }

  function setJudge(text, kind) {
    el.judge.textContent = text;
    const map = {
      perfect: "var(--accent)",
      great: "var(--good)",
      ok: "var(--ok)",
      miss: "var(--miss)",
      info: "var(--muted)",
    };
    el.judge.style.color = map[kind] || "var(--text)";
  }

  // ---------- Settings persistence ----------
  function loadSettings() {
    state.hapticsOn = storage.get("tapbeat_haptics", true);
    state.audioOn = storage.get("tapbeat_sound", true);
    state.tutorialOn = storage.get("tapbeat_tutorial", true);

    state.coins = storage.get("tapbeat_coins", 0);
    state.achieved = storage.get("tapbeat_achievements", {});
    state.owned = storage.get("tapbeat_owned", { starter: true });
    state.selectedPack = storage.get("tapbeat_selectedPack", "starter");

    if (el.haptics) el.haptics.checked = state.hapticsOn;
    if (el.sound) el.sound.checked = state.audioOn;
    if (el.tutorial) el.tutorial.checked = state.tutorialOn;

    if (el.setHaptics) el.setHaptics.checked = state.hapticsOn;
    if (el.setSound) el.setSound.checked = state.audioOn;
    if (el.setTutorial) el.setTutorial.checked = state.tutorialOn;

    el.coins.textContent = String(state.coins);
  }

  function saveSettings() {
    storage.set("tapbeat_haptics", state.hapticsOn);
    storage.set("tapbeat_sound", state.audioOn);
    storage.set("tapbeat_tutorial", state.tutorialOn);

    storage.set("tapbeat_coins", state.coins);
    storage.set("tapbeat_achievements", state.achieved);
    storage.set("tapbeat_owned", state.owned);
    storage.set("tapbeat_selectedPack", state.selectedPack);
  }

  // ---------- Moving target ----------
  function applyTargetPosition(x, y) {
    state.targetX = x;
    state.targetY = y;

    const rect = el.playfield.getBoundingClientRect();
    const px = rect.width * x;
    const py = rect.height * y;

    // Keep target inside playfield
    const size = Math.min(rect.width, rect.height) * 0.56; // approx target size
    const pad = Math.max(14, size * 0.18);
    const cx = clamp(px, pad, rect.width - pad);
    const cy = clamp(py, pad, rect.height - pad);

    el.target.style.left = `${(cx / rect.width) * 100}%`;
    el.target.style.top = `${(cy / rect.height) * 100}%`;

    // trail glow
    if (el.trail) {
      el.trail.style.opacity = "1";
      el.trail.style.background = `radial-gradient(260px 260px at ${(cx / rect.width) * 100}% ${(cy / rect.height) * 100}%, rgba(181,31,58,0.16), transparent 65%)`;
      clearTimeout(applyTargetPosition._t);
      applyTargetPosition._t = setTimeout(() => (el.trail.style.opacity = "0"), 280);
    }
  }

  function moveTargetNext() {
    if (!state.moveEnabled) return;
    // avoid repeating same position too often
    let next = state.posIndex;
    for (let i = 0; i < 6 && next === state.posIndex; i++) {
      next = Math.floor(Math.random() * state.positions.length);
    }
    state.posIndex = next;
    const p = state.positions[next];
    applyTargetPosition(p.x, p.y);
  }

  // ---------- Visual effects ----------
  function spawnRipple() {
    const r = document.createElement("div");
    r.className = "tap-ripple";
    el.target.appendChild(r);
    r.addEventListener("animationend", () => r.remove(), { once: true });
  }

  function spawnParticles(kind) {
    const container = document.createElement("div");
    container.className = "particles";
    el.target.appendChild(container);

    const count = kind === "perfect" ? 12 : kind === "great" ? 9 : 6;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const ang = Math.random() * Math.PI * 2;
      const dist = (kind === "perfect" ? 120 : 90) + Math.random() * 40;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;

      p.style.left = "50%";
      p.style.top = "50%";
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);

      if (kind === "perfect") p.style.background = "rgba(181,31,58,0.95)";
      else if (kind === "great") p.style.background = "rgba(255,209,102,0.95)";
      else p.style.background = "rgba(123,223,242,0.95)";

      container.appendChild(p);
    }

    setTimeout(() => container.remove(), 600);
  }

  function flashTarget(color) {
    el.target.animate(
      [
        { boxShadow: "0 18px 60px rgba(0,0,0,0.55)" },
        { boxShadow: `0 20px 80px ${color}` },
        { boxShadow: "0 18px 60px rgba(0,0,0,0.55)" },
      ],
      { duration: 240, easing: "ease-out" }
    );
    el.target.classList.add("pulse");
    clearTimeout(flashTarget._t);
    flashTarget._t = setTimeout(() => el.target.classList.remove("pulse"), 220);
  }

  // ---------- Achievements ----------
  const ACH = [
    { id: "first_run", title: "First Run", desc: "Start your first game.", coins: 50 },
    { id: "score_1000", title: "1,000 Score", desc: "Reach 1,000 points in a run.", coins: 120 },
    { id: "combo_10", title: "Combo 10", desc: "Hit 10 in a row.", coins: 80 },
    { id: "combo_25", title: "Combo 25", desc: "Hit 25 in a row.", coins: 160 },
    { id: "combo_50", title: "Combo 50", desc: "Hit 50 in a row.", coins: 320 },
    { id: "perfect_8", title: "Perfect Streak", desc: "8 Perfect hits in a row.", coins: 180 },
    { id: "level_5", title: "Level 5", desc: "Reach level 5.", coins: 150 },
  ];

  function awardAchievement(id) {
    if (state.achieved[id]) return;
    state.achieved[id] = true;
    const a = ACH.find((x) => x.id === id);
    if (a) {
      state.coins += a.coins;
      el.coins.textContent = String(state.coins);
      saveSettings();
      toast(`🏆 ${a.title} +${a.coins} coins`);
    }
  }

  function renderAchievements() {
    if (!el.achList) return;
    el.achList.innerHTML = "";
    ACH.forEach((a) => {
      const done = !!state.achieved[a.id];
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="item-row">
          <div>
            <div class="item-title">${done ? "✅" : "⬜"} ${a.title}</div>
            <div class="item-desc">${a.desc}</div>
          </div>
          <div class="item-reward">${a.coins}🪙</div>
        </div>
      `;
      el.achList.appendChild(div);
    });
  }

  // ---------- Shop (stub) ----------
  const SHOP = [
    { id: "starter", name: "Starter Pack", desc: "Default groove. Always owned.", price: 0 },
    { id: "neon", name: "Neon Pack", desc: "Brighter lead + punchier hats.", price: 600 },
    { id: "acid", name: "Acid Pack", desc: "Squishy bass + sharper drops.", price: 900 },
    { id: "night", name: "Night Skin", desc: "Darker UI glow (cosmetic).", price: 450 },
  ];

  function renderShop() {
    if (!el.shopGrid) return;
    el.shopGrid.innerHTML = "";

    SHOP.forEach((it) => {
      const owned = !!state.owned[it.id];
      const selected = state.selectedPack === it.id;

      const card = document.createElement("div");
      card.className = "shop-item";
      card.innerHTML = `
        <div class="shop-name">${it.name}</div>
        <div class="shop-desc">${it.desc}</div>
        <div class="shop-row">
          <div class="shop-price">${it.price === 0 ? "FREE" : `${it.price}🪙`}</div>
          <button class="shop-btn" data-id="${it.id}">
            ${owned ? (selected ? "Selected" : "Select") : "Unlock"}
          </button>
        </div>
      `;
      el.shopGrid.appendChild(card);

      card.querySelector(".shop-btn").addEventListener("click", () => {
        if (it.price === 0) {
          state.owned[it.id] = true;
          state.selectedPack = it.id;
          saveSettings();
          toast("Selected.");
          renderShop();
          return;
        }

        if (!owned) {
          if (state.coins < it.price) {
            toast("Not enough coins.");
            return;
          }
          state.coins -= it.price;
          state.owned[it.id] = true;
          state.selectedPack = it.id;
          el.coins.textContent = String(state.coins);
          saveSettings();
          toast(`Unlocked: ${it.name}`);
          renderShop();
          return;
        }

        state.selectedPack = it.id;
        saveSettings();
        toast("Selected.");
        renderShop();
      });
    });
  }

  // ---------- Tutorial ----------
  const TUTORIAL_STEPS = [
    {
      title: "How to Tap",
      text: "Tap when the moving ring hits the dashed sweet zone.",
      action: () => {
        state.moveEnabled = false;
        applyTargetPosition(0.5, 0.5);
        setJudge("Watch the ring…", "info");
      },
    },
    {
      title: "Perfect Timing",
      text: "Perfect is tight. Great is forgiving. Missing breaks combo.",
      action: () => {
        setJudge("Try to hit PERFECT", "perfect");
      },
    },
    {
      title: "Target Moves",
      text: "After a few beats, the target starts moving. Keep the pulse.",
      action: () => {
        state.moveEnabled = true;
        moveTargetNext();
        setJudge("Now it moves.", "info");
      },
    },
    {
      title: "Unlock the Track",
      text: "Combo unlocks more sound layers and better coin rewards.",
      action: () => {
        setJudge("Build combo!", "great");
      },
    },
  ];

  let tutorialStep = 0;

  function openTutorial() {
    tutorialStep = 0;
    el.tutorialOverlay.classList.remove("hidden");
    updateTutorialUI();
  }

  function closeTutorial() {
    el.tutorialOverlay.classList.add("hidden");
    // After tutorial, allow movement
    state.moveEnabled = true;
  }

  function updateTutorialUI() {
    const s = TUTORIAL_STEPS[tutorialStep];
    el.tTitle.textContent = s.title;
    el.tText.textContent = s.text;

    el.btnTBack.disabled = tutorialStep === 0;
    el.btnTNext.disabled = tutorialStep === TUTORIAL_STEPS.length - 1;

    // run step action (safe)
    try { s.action && s.action(); } catch (_) {}
  }

  // ---------- WebAudio Engine (more variety) ----------
  function makeAudioEngine() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.16;

    comp.connect(master);

    const bus = ctx.createGain();
    bus.gain.value = 0.92;
    bus.connect(comp);

    // noise buffer for hats/claps
    const noiseBuf = (() => {
      const len = ctx.sampleRate * 1.0;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
      return buffer;
    })();

    function kick(t) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.10);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.0, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + 0.22);
    }

    function hat(t, tone = 9000, amp = 0.55, dur = 0.06) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = tone;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      src.connect(hp);
      hp.connect(g);
      g.connect(bus);

      src.start(t);
      src.stop(t + dur + 0.02);
    }

    function clap(t, amp = 0.85) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 0.9;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

      src.connect(bp);
      bp.connect(g);
      g.connect(bus);

      src.start(t);
      src.stop(t + 0.16);
    }

    function bass(t, freq = 55, drive = 0.85) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(drive, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);

      osc.start(t);
      osc.stop(t + 0.22);
    }

    function lead(t, freq = 440, amp = 0.22, len = 0.12) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1200;
      bp.Q.value = 0.9;

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);

      osc.connect(bp);
      bp.connect(g);
      g.connect(bus);

      osc.start(t);
      osc.stop(t + len + 0.02);
    }

    return { ctx, kick, hat, clap, bass, lead };
  }

  // ---------- Scheduling ----------
  let rafId = 0;
  let schedTimer = 0;

  function renderRing(phase) {
    const p = clamp(phase, 0, 1);

    const outerScale = 1.35 - 0.55 * p;
    const innerScale = 1.15 - 0.30 * p;

    const outerOpacity = 0.12 + 0.88 * Math.pow(p, 0.85);
    const innerOpacity = 0.10 + 0.62 * Math.pow(p, 0.85);

    el.ringOuter.style.opacity = String(outerOpacity);
    el.ringOuter.style.transform = `scale(${outerScale})`;

    el.ringInner.style.opacity = String(innerOpacity);
    el.ringInner.style.transform = `scale(${innerScale})`;
  }

  function audioTimeFromPerf(ms) {
    const ctx = state.audio?.ctx;
    if (!ctx) return 0;
    return Math.max(0, (ms - state.audioPerfZeroMs) / 1000);
  }

  function packTuning() {
    // small behavior based on selected pack
    const pack = state.selectedPack;
    if (pack === "neon") return { hatTone: 10500, bassDrive: 0.95, leadAmp: 0.26 };
    if (pack === "acid") return { hatTone: 9800, bassDrive: 1.05, leadAmp: 0.24 };
    return { hatTone: 9000, bassDrive: 0.85, leadAmp: 0.22 };
  }

  function scheduleAudio() {
    if (!state.audioOn || !state.audio || state.paused || !state.running) return;

    const ctx = state.audio.ctx;
    const lookAhead = 0.14; // seconds
    const interval = 25; // ms

    const perfNow = nowMs();
    const windowEndPerf = perfNow + lookAhead * 1000;

    const tune = packTuning();

    while (state.nextBeatAtMs <= windowEndPerf) {
      const t = audioTimeFromPerf(state.nextBeatAtMs);

      const beatInBar = state.beatsThisRun % 4; // 0..3
      const beatIn8 = state.beatsThisRun % 8;

      // difficulty drift
      if (state.mode === "drift" && beatIn8 === 0) {
        state.drift += (Math.random() * 2 - 1) * 10; // +/- 10ms
        state.drift = clamp(state.drift, -30, 30);
      }

      // ----- base pattern -----
      if (state.layers.kick && (beatInBar === 0 || beatInBar === 2)) state.audio.kick(t);

      // hat pattern (varies with level/energy)
      if (state.layers.hat) {
        const energy = clamp(state.combo / 30, 0, 1);
        const hatAmp = 0.45 + energy * 0.25;
        state.audio.hat(t, tune.hatTone, hatAmp, 0.06);

        // off-hat on 8th notes; sometimes skip to create groove
        const tOff = t + (state.beatMs / 1000) * 0.5;
        const skip = (state.level % 3 === 0) && (beatIn8 === 3 || beatIn8 === 7) && Math.random() < 0.35;
        if (!skip) state.audio.hat(tOff, tune.hatTone, hatAmp * 0.7, 0.05);
      }

      // clap on 2 & 4; sometimes “drop” it for tension every few levels
      if (state.layers.clap) {
        const drop = (state.level % 4 === 0) && (beatInBar === 1) && Math.random() < 0.45;
        if (!drop && (beatInBar === 1 || beatInBar === 3)) state.audio.clap(t, 0.85);
      }

      // bass on offbeats; add variation
      if (state.layers.bass) {
        const tBass = t + (state.beatMs / 1000) * 0.5;
        const base = beatInBar === 0 || beatInBar === 2 ? 55 : 65;
        const varHz = (state.level % 5 === 0 && beatInBar === 3) ? 73 : base;
        state.audio.bass(tBass, varHz, tune.bassDrive);
      }

      // lead: tiny motifs to prevent boredom
      if (state.layers.lead) {
        const scale = [392, 440, 523.25, 587.33]; // G4 A4 C5 D5
        const pick = scale[(state.beatsThisRun + state.level) % scale.length];
        const on = (beatIn8 === 1 || beatIn8 === 5) || (Math.random() < 0.12);
        if (on) state.audio.lead(t, pick, tune.leadAmp, 0.11);
      }

      // ----- beat bookkeeping -----
      state.lastBeatAtMs = state.nextBeatAtMs;
      state.nextBeatAtMs += state.beatMs + state.drift;
      state.beatsThisRun += 1;

      // movement cue: move every N beats once enabled
      if (state.moveEnabled && state.beatsThisRun % state.moveEveryBeats === 0) moveTargetNext();

      // progress bar + level up
      const progress = (state.beatsThisRun % state.beatsPerLevel) / state.beatsPerLevel;
      el.bar.style.width = `${Math.floor(progress * 100)}%`;

      if (state.beatsThisRun % state.beatsPerLevel === 0) {
        state.level += 1;
        el.lvl.textContent = String(state.level);

        // tighten windows slowly
        state.perfect = Math.max(28, state.perfect - 2);
        state.great = Math.max(72, state.great - 1);
        state.ok = Math.max(110, state.ok - 1);

        // small “drop” flash
        toast(`Level ${state.level}`);
        awardAchievement("level_5");

        // at higher levels, speed up movement a bit
        if (state.level === 3) state.moveEveryBeats = 3;
        if (state.level === 6) state.moveEveryBeats = 2;
      }
    }

    schedTimer = window.setTimeout(scheduleAudio, interval);
  }

  function startLoops() {
    cancelAnimationFrame(rafId);
    if (schedTimer) clearTimeout(schedTimer);

    const loop = () => {
      if (!state.running || state.paused) return;

      const ttn = state.nextBeatAtMs - nowMs();
      const phase = 1 - ttn / state.beatMs;
      renderRing(((phase % 1) + 1) % 1);

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    scheduleAudio();
  }

  function stopLoops() {
    cancelAnimationFrame(rafId);
    if (schedTimer) clearTimeout(schedTimer);
    schedTimer = 0;
  }

  // ---------- Combo unlocks / progression ----------
  function applyComboUnlocks() {
    if (state.combo >= 4) state.layers.hat = true;
    if (state.combo >= 10) state.layers.clap = true;
    if (state.combo >= 16) state.layers.bass = true;
    if (state.combo >= 22) state.layers.lead = true;
    updateTrackStateLabel();
    updateEnergyUI();
  }

  // ---------- Tap judgement ----------
  function coinReward(kind) {
    if (kind === "perfect") return 4;
    if (kind === "great") return 2;
    if (kind === "ok") return 1;
    return 0;
  }

  function judgeTap() {
    if (!state.running || state.paused) return;

    // visual feedback always
    spawnRipple();

    const t = nowMs();
    const dLast = Math.abs(t - state.lastBeatAtMs);
    const dNext = Math.abs(state.nextBeatAtMs - t);
    const delta = Math.min(dLast, dNext);

    let kind = "miss";
    let base = 0;

    if (delta <= state.perfect) { kind = "perfect"; base = 120; }
    else if (delta <= state.great) { kind = "great"; base = 70; }
    else if (delta <= state.ok) { kind = "ok"; base = 35; }
    else { kind = "miss"; base = 0; }

    if (kind === "miss") {
      state.combo = 0;
      state.perfectStreak = 0;
      setJudge("MISS", "miss");
      vibrate(20);
      flashTarget("rgba(255,92,138,0.25)");
    } else {
      state.combo += 1;
      const mult = 1 + Math.min(2.4, state.combo / 24);
      const earned = Math.floor(base * mult);
      state.score += earned;

      // coins
      const c = coinReward(kind) + (state.combo >= 15 ? 1 : 0);
      state.coins += c;

      el.score.textContent = String(state.score);
      el.combo.textContent = String(state.combo);
      el.coins.textContent = String(state.coins);

      if (kind === "perfect") {
        state.perfectStreak += 1;
        state.totalPerfectThisRun += 1;
        setJudge("PERFECT", "perfect");
        vibrate(10);
        flashTarget("rgba(181,31,58,0.35)");
        spawnParticles("perfect");
      } else if (kind === "great") {
        state.perfectStreak = 0;
        setJudge("GREAT", "great");
        vibrate(6);
        flashTarget("rgba(255,209,102,0.22)");
        spawnParticles("great");
      } else {
        state.perfectStreak = 0;
        setJudge("OK", "ok");
        vibrate(4);
        flashTarget("rgba(123,223,242,0.18)");
        spawnParticles("ok");
      }
    }

    applyComboUnlocks();
    saveSettings();

    // achievements triggers
    if (state.score >= 1000) awardAchievement("score_1000");
    if (state.combo >= 10) awardAchievement("combo_10");
    if (state.combo >= 25) awardAchievement("combo_25");
    if (state.combo >= 50) awardAchievement("combo_50");
    if (state.perfectStreak >= 8) awardAchievement("perfect_8");
  }

  // ---------- Game lifecycle ----------
  async function ensureAudio() {
    if (!state.audioOn) return;
    if (!state.audio) state.audio = makeAudioEngine();
    try {
      if (state.audio.ctx.state !== "running") await state.audio.ctx.resume();
    } catch (_) {}
    state.audioPerfZeroMs = nowMs() - state.audio.ctx.currentTime * 1000;
  }

  async function startGame() {
    state.mode = el.modeSelect.value;
    state.bpm = parseInt(el.bpmSelect.value, 10);

    state.hapticsOn = !!el.haptics.checked;
    state.audioOn = !!el.sound.checked;
    state.tutorialOn = !!el.tutorial.checked;

    // reset run
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.combo = 0;
    state.level = 1;

    state.beatsThisRun = 0;
    state.perfect = 42;
    state.great = 90;
    state.ok = 135;

    state.perfectStreak = 0;
    state.totalPerfectThisRun = 0;
    state.runStartedAt = Date.now();

    state.layers.kick = true;
    state.layers.hat = false;
    state.layers.clap = false;
    state.layers.bass = false;
    state.layers.lead = false;

    state.drift = 0;
    state.moveEveryBeats = 4;

    recomputeBeat();
    updateTrackStateLabel();
    updateEnergyUI();

    el.score.textContent = "0";
    el.combo.textContent = "0";
    el.lvl.textContent = "1";
    el.bar.style.width = "0%";
    el.hint.textContent = "TAP ON THE BEAT";
    el.judge.textContent = "";

    // movement: locked until tutorial completes (or tutorial disabled)
    state.moveEnabled = !state.tutorialOn;
    applyTargetPosition(0.5, 0.5);

    // audio init only on user gesture
    await ensureAudio();

    // set beat anchors
    const n = nowMs();
    state.lastBeatAtMs = n;
    state.nextBeatAtMs = n + state.beatMs;

    el.startOverlay.classList.add("hidden");
    el.pauseOverlay.classList.add("hidden");

    awardAchievement("first_run");

    // optional tutorial overlay
    if (state.tutorialOn) openTutorial();

    startLoops();
  }

  function pauseGame() {
    if (!state.running || state.paused) return;
    state.paused = true;
    stopLoops();
    el.pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!state.running || !state.paused) return;
    state.paused = false;

    // re-anchor timing
    const n = nowMs();
    state.lastBeatAtMs = n;
    state.nextBeatAtMs = n + state.beatMs;

    if (state.audio && state.audio.ctx) {
      state.audioPerfZeroMs = nowMs() - state.audio.ctx.currentTime * 1000;
    }

    el.pauseOverlay.classList.add("hidden");
    startLoops();
  }

  function restartGame() {
    stopLoops();
    state.running = false;
    state.paused = false;

    el.pauseOverlay.classList.add("hidden");
    el.tutorialOverlay.classList.add("hidden");
    el.achOverlay.classList.add("hidden");
    el.shopOverlay.classList.add("hidden");
    el.settingsOverlay.classList.add("hidden");

    el.startOverlay.classList.remove("hidden");
    saveSettings();
  }

  // ---------- Overlays control ----------
  function overlayVisible() {
    const ids = [
      el.startOverlay,
      el.pauseOverlay,
      el.tutorialOverlay,
      el.achOverlay,
      el.shopOverlay,
      el.settingsOverlay,
    ];
    return ids.some((o) => o && !o.classList.contains("hidden"));
  }

  function openAchievements() {
    renderAchievements();
    el.achOverlay.classList.remove("hidden");
  }

  function openShop() {
    renderShop();
    el.shopOverlay.classList.remove("hidden");
  }

  function openSettings() {
    el.setHaptics.checked = state.hapticsOn;
    el.setSound.checked = state.audioOn;
    el.setTutorial.checked = state.tutorialOn;
    el.settingsOverlay.classList.remove("hidden");
  }

  function closeSettings() {
    el.settingsOverlay.classList.add("hidden");
  }

  // ---------- Events ----------
  function onPointerDown(e) {
    // ignore taps on overlays
    if (overlayVisible()) return;
    e.preventDefault();
    judgeTap();
  }

  el.stage.addEventListener("pointerdown", onPointerDown, { passive: false });

  el.btnStart.addEventListener("click", startGame);

  el.btnPause.addEventListener("click", () => {
    if (!state.running) return;
    if (state.paused) resumeGame();
    else pauseGame();
  });

  el.btnResume.addEventListener("click", resumeGame);
  el.btnRestart.addEventListener("click", restartGame);

  el.btnAchievements.addEventListener("click", () => {
    if (!state.running) return;
    openAchievements();
  });
  el.btnAchClose.addEventListener("click", () => el.achOverlay.classList.add("hidden"));

  el.btnShop.addEventListener("click", () => {
    if (!state.running) return;
    openShop();
  });
  el.btnShopClose.addEventListener("click", () => el.shopOverlay.classList.add("hidden"));

  el.btnSettings.addEventListener("click", () => {
    if (!state.running) return;
    openSettings();
  });
  el.btnSettingsClose.addEventListener("click", closeSettings);

  // tutorial buttons
  el.btnTBack.addEventListener("click", () => {
    tutorialStep = Math.max(0, tutorialStep - 1);
    updateTutorialUI();
  });
  el.btnTNext.addEventListener("click", () => {
    tutorialStep = Math.min(TUTORIAL_STEPS.length - 1, tutorialStep + 1);
    updateTutorialUI();
  });
  el.btnTSkip.addEventListener("click", () => {
    closeTutorial();
    toast("Tutorial complete.");
  });

  // Settings toggles
  el.setHaptics.addEventListener("change", () => {
    state.hapticsOn = !!el.setHaptics.checked;
    if (el.haptics) el.haptics.checked = state.hapticsOn;
    saveSettings();
    toast(state.hapticsOn ? "Haptics on" : "Haptics off");
  });

  el.setSound.addEventListener("change", async () => {
    state.audioOn = !!el.setSound.checked;
    if (el.sound) el.sound.checked = state.audioOn;
    saveSettings();

    if (state.audioOn) {
      await ensureAudio();
      toast("Sound on");
      // restart scheduler if running
      if (state.running && !state.paused) scheduleAudio();
    } else {
      toast("Sound off");
    }
  });

  el.setTutorial.addEventListener("change", () => {
    state.tutorialOn = !!el.setTutorial.checked;
    if (el.tutorial) el.tutorial.checked = state.tutorialOn;
    saveSettings();
    toast(state.tutorialOn ? "Tutorial on" : "Tutorial off");
  });

  // Keyboard (desktop)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      if (!overlayVisible()) judgeTap();
    }
    if (e.code === "Escape") {
      if (!state.running) return;
      if (state.paused) resumeGame();
      else pauseGame();
    }
  });

  // iOS Safari sometimes selects on long press; prevent
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  // ---------- Shop/Achievements CSS helpers (inline if missing) ----------
  // If your CSS doesn't define these, the UI still works; it just looks plain.
  // (No action needed.)

  // ---------- Tutorial UI update (needs function defined earlier) ----------
  function updateTutorialUI() {
    const s = TUTORIAL_STEPS[tutorialStep];
    el.tTitle.textContent = s.title;
    el.tText.textContent = s.text;

    el.btnTBack.disabled = tutorialStep === 0;
    el.btnTNext.disabled = tutorialStep === TUTORIAL_STEPS.length - 1;

    try { s.action && s.action(); } catch (_) {}
  }

  // close tutorial when overlay is hidden by outside actions (optional)
  el.tutorialOverlay.addEventListener("click", (e) => {
    // only if user clicks backdrop (not card)
    if (e.target === el.tutorialOverlay) {
      closeTutorial();
      toast("Tutorial complete.");
    }
  });

  // ---------- Initial load ----------
  
  loadSettings();
  recomputeBeat();
  updateTrackStateLabel();
  updateEnergyUI();
  
  // ----- Splash intro -----
(function runSplash(){
  if (!el.splashOverlay) return;

  // На время интро спрячем start overlay, чтобы не мигал под ним
  if (el.startOverlay) el.startOverlay.classList.add("hidden");

  // Показать "presents" чуть позже
  setTimeout(() => {
    if (el.splashPresents) el.splashPresents.classList.add("show");
  }, 650);

  // Убрать splash и показать старт-экран
  setTimeout(() => {
    el.splashOverlay.classList.add("fade-out");
  }, 1550);

  setTimeout(() => {
    el.splashOverlay.classList.add("hidden");
    if (el.startOverlay) el.startOverlay.classList.remove("hidden");
  }, 2050);
})();

  // Set initial target position on load
  requestAnimationFrame(() => applyTargetPosition(0.5, 0.5));

  // -------- Minimal toast CSS hook (if missing) --------
  // If you didn't add toast styles, it still displays as plain text.
  if (el.toast && !document.querySelector("style[data-tapbeat-toast]")) {
    const st = document.createElement("style");
    st.dataset.tapbeatToast = "1";
    st.textContent = `
      .toast{
        position: fixed;
        left: 50%;
        bottom: calc(18px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        background: rgba(10,10,15,0.75);
        border: 1px solid rgba(255,255,255,0.14);
        color: rgba(255,255,255,0.92);
        padding: 10px 12px;
        border-radius: 999px;
        box-shadow: 0 18px 60px rgba(0,0,0,0.55);
        opacity: 0;
        transition: opacity 200ms ease, transform 200ms ease;
        pointer-events: none;
        font-size: 0.9rem;
        white-space: nowrap;
        z-index: 80;
      }
      .toast.show{
        opacity: 1;
        transform: translateX(-50%) translateY(-2px);
      }
      .list .item{
        padding: 12px 10px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.04);
        border-radius: 14px;
        margin: 10px 0;
      }
      .item-row{ display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
      .item-title{ font-weight: 900; letter-spacing: 0.02em; }
      .item-desc{ color: rgba(255,255,255,0.64); font-size: 0.9rem; margin-top: 4px; line-height: 1.35; }
      .item-reward{ color: rgba(255,255,255,0.72); font-weight: 800; white-space: nowrap; }
      .shop-grid{ display:grid; gap: 10px; }
      .shop-item{
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.04);
        border-radius: 14px;
        padding: 12px 12px;
      }
      .shop-name{ font-weight: 900; letter-spacing: 0.02em; }
      .shop-desc{ color: rgba(255,255,255,0.64); font-size: 0.9rem; margin-top: 4px; line-height: 1.35; }
      .shop-row{ display:flex; justify-content:space-between; align-items:center; margin-top: 10px; gap: 10px; }
      .shop-price{ color: rgba(255,255,255,0.72); font-weight: 800; white-space: nowrap; }
      .shop-btn{
        border-radius: 999px;
        padding: 10px 12px;
        min-height: 40px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.9);
        font-weight: 800;
      }
      .shop-btn:active{ transform: scale(0.99); }
    `;
    document.head.appendChild(st);
  }
})();