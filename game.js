/* TAPBEAT — game.js (bright / smooth / target-only / anime HUD / single menu button / main menu / auto BPM ramp)

WHAT THIS FILE DOES (so you don’t need to rewire everything):
- Works even if your HTML differs a bit: it looks for IDs, and if some UI nodes are missing it creates minimal ones.
- Tap must be ON the moving circle. Tap outside = MISS.
- Target movement is SMOOTH (glides using rAF interpolation).
- Judgement text is NOT inside the circle; it’s a top-left “anime-style” HUD with cartoon sparks.
- One gear button opens a single menu overlay (Play / Settings / Shop / Goals).
- Splash screen stays longer, then shows Main Menu (game does NOT start immediately).
- No BPM picker: BPM starts slower and ramps up with time + combo.
- Music is more “alive”: multiple voices from the start, then evolves toward a “chorus” as combo/energy grows.
- Haptics toggle + Sound toggle persist in localStorage.
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  // ---------- Find/Create UI safely ----------
  const el = {
    stage: $("stage") || document.body,
    playfield: document.querySelector(".playfield") || document.querySelector(".target-wrap") || document.body,
    target: $("target") || document.querySelector(".target"),
    ringOuter: $("ringOuter") || document.querySelector(".ring-outer"),
    ringInner: $("ringInner") || document.querySelector(".ring-inner"),

    // overlays (optional)
    splashOverlay: $("splashOverlay"),
    splashPresents: $("splashPresents"),

    startOverlay: $("startOverlay"),     // old start
    pauseOverlay: $("pauseOverlay"),     // optional
    tutorialOverlay: $("tutorialOverlay"),
    shopOverlay: $("shopOverlay"),
    achOverlay: $("achOverlay"),
    settingsOverlay: $("settingsOverlay"),

    // top buttons (we’ll consolidate under gear)
    btnPause: $("btnPause"),
    btnShop: $("btnShop"),
    btnAchievements: $("btnAchievements"),
    btnSettings: $("btnSettings"),

    // settings toggles (optional)
    setHaptics: $("setHaptics"),
    setSound: $("setSound"),
    setTutorial: $("setTutorial"),

    // score UI (optional)
    score: $("score"),
    combo: $("combo"),
    coins: $("coins"),
    bpm: $("bpm"),
    lvl: $("lvl"),
    bar: $("bar"),
    trackState: $("trackState"),
    energy: $("energy"),

    toast: $("toast")
  };

  // If target element is missing, create a minimal one so game still runs.
  if (!el.target) {
    const t = document.createElement("div");
    t.id = "target";
    t.className = "target";
    t.innerHTML = `
      <div class="sweet" aria-hidden="true"></div>
      <div class="ring ring-outer" id="ringOuter"></div>
      <div class="ring ring-inner" id="ringInner"></div>
      <div class="core"><div class="core-dot"></div></div>
    `;
    el.playfield.appendChild(t);
    el.target = t;
    el.ringOuter = $("ringOuter") || t.querySelector(".ring-outer");
    el.ringInner = $("ringInner") || t.querySelector(".ring-inner");
  }

  // ---------- Inject missing HUD/menus/styles (so your saved index/style don’t need to be perfect) ----------
  function injectStylesOnce() {
    if (document.querySelector("style[data-tapbeat-v3]")) return;
    const s = document.createElement("style");
    s.dataset.tapbeatV3 = "1";
    s.textContent = `
      /* Anime HUD (top-left) */
      .anime-hud{
        position: fixed;
        left: 14px;
        top: calc(12px + env(safe-area-inset-top));
        z-index: 120;
        pointer-events: none;
        display: grid;
        gap: 6px;
      }
      .anime-judge{
        font-weight: 1000;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-size: 1.05rem;
        line-height: 1;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.16);
        backdrop-filter: blur(10px);
        transform: translateY(-2px);
        opacity: 0;
        filter: blur(1px);
      }
      .anime-judge.show{
        animation: judgePop 520ms cubic-bezier(.2,1,.2,1) both;
      }
      @keyframes judgePop{
        0%{ opacity:0; transform: translateY(6px) scale(0.98); filter: blur(2px); }
        35%{ opacity:1; transform: translateY(0) scale(1.05); filter: blur(0); }
        100%{ opacity:1; transform: translateY(0) scale(1); }
      }
      .anime-judge.perfect{
        color: rgba(255,255,255,0.98);
        box-shadow: 0 18px 60px rgba(0,0,0,0.55), 0 0 0 2px rgba(80,255,200,0.18) inset;
        text-shadow:
          0 2px 0 rgba(0,0,0,0.65),
          0 0 18px rgba(80,255,200,0.55);
      }
      .anime-judge.great{
        color: rgba(255,255,255,0.98);
        box-shadow: 0 18px 60px rgba(0,0,0,0.55), 0 0 0 2px rgba(120,190,255,0.18) inset;
        text-shadow:
          0 2px 0 rgba(0,0,0,0.65),
          0 0 18px rgba(120,190,255,0.55);
      }
      .anime-judge.ok{
        color: rgba(255,255,255,0.92);
        box-shadow: 0 18px 60px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,170,190,0.16) inset;
        text-shadow:
          0 2px 0 rgba(0,0,0,0.6),
          0 0 14px rgba(255,170,190,0.45);
      }
      .anime-judge.miss{
        color: rgba(255,255,255,0.9);
        box-shadow: 0 18px 60px rgba(0,0,0,0.45), 0 0 0 2px rgba(255,120,140,0.16) inset;
        text-shadow:
          0 2px 0 rgba(0,0,0,0.6),
          0 0 14px rgba(255,120,140,0.45);
      }

      /* Sparks */
      .spark{
        position: fixed;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        left: 0; top: 0;
        z-index: 130;
        pointer-events: none;
        opacity: 0.95;
        transform: translate(-50%,-50%);
        animation: sparkFly 520ms ease-out forwards;
        filter: drop-shadow(0 10px 20px rgba(0,0,0,0.45));
      }
      @keyframes sparkFly{
        to{
          transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.7);
          opacity: 0;
        }
      }

      /* Floating gear button (top-right) */
      .gear-btn{
        position: fixed;
        right: 14px;
        top: calc(12px + env(safe-area-inset-top));
        z-index: 140;
        width: 46px;
        height: 46px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(0,0,0,0.35);
        backdrop-filter: blur(10px);
        color: rgba(255,255,255,0.9);
        font-size: 18px;
        display: grid;
        place-items: center;
        box-shadow: 0 18px 60px rgba(0,0,0,0.55);
      }
      .gear-btn:active{ transform: scale(0.98); }

      /* Main menu overlay with big buttons */
      .menu-card{
        width: min(560px, 92vw);
        border-radius: 22px;
        padding: 18px 16px;
        border: 1px solid rgba(255,255,255,0.14);
        background:
          radial-gradient(700px 420px at 30% 20%, rgba(80,255,200,0.18), transparent 55%),
          radial-gradient(700px 420px at 80% 70%, rgba(120,190,255,0.16), transparent 55%),
          radial-gradient(600px 420px at 50% 50%, rgba(255,170,190,0.14), transparent 60%),
          rgba(0,0,0,0.55);
        backdrop-filter: blur(14px);
        box-shadow: 0 18px 70px rgba(0,0,0,0.65);
      }
      .menu-title{
        text-align: center;
        font-weight: 1000;
        letter-spacing: 0.18em;
        font-size: 1.05rem;
        margin: 6px 0 14px;
      }
      .menu-sub{
        text-align: center;
        color: rgba(255,255,255,0.70);
        font-size: 0.95rem;
        line-height: 1.5;
        margin: 0 0 14px;
      }
      .menu-grid{
        display: grid;
        gap: 10px;
      }
      .menu-btn{
        width: 100%;
        min-height: 52px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.16);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.92);
        font-weight: 900;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 14px;
      }
      .menu-btn strong{ font-size: 0.95rem; }
      .menu-btn span{ color: rgba(255,255,255,0.65); font-weight: 800; }
      .menu-btn.play{
        background: linear-gradient(135deg, rgba(80,255,200,0.22), rgba(120,190,255,0.16), rgba(255,170,190,0.14));
        border-color: rgba(255,255,255,0.18);
      }
      .menu-btn:active{ transform: scale(0.99); }

      /* Make target glow more colorful */
      .target{
        will-change: left, top, transform;
        background:
          radial-gradient(circle at 50% 50%, rgba(255,255,255,0.10), transparent 55%),
          radial-gradient(circle at 20% 30%, rgba(80,255,200,0.20), transparent 60%),
          radial-gradient(circle at 70% 40%, rgba(120,190,255,0.18), transparent 62%),
          radial-gradient(circle at 50% 70%, rgba(255,170,190,0.16), transparent 65%);
      }
      .ring-outer{ border-color: rgba(80,255,200,0.58) !important; }
      .ring-inner{ border-color: rgba(120,190,255,0.24) !important; }
    `;
    document.head.appendChild(s);
  }

  function createAnimeHUD() {
    if (document.querySelector(".anime-hud")) return;
    const hud = document.createElement("div");
    hud.className = "anime-hud";
    hud.innerHTML = `<div class="anime-judge" id="animeJudge">READY</div>`;
    document.body.appendChild(hud);
  }

  function createGearButton() {
    if ($("gearBtn")) return;
    const b = document.createElement("button");
    b.id = "gearBtn";
    b.className = "gear-btn";
    b.type = "button";
    b.setAttribute("aria-label", "Menu");
    b.textContent = "⚙️";
    document.body.appendChild(b);
  }

  function createMainMenuOverlay() {
    if ($("mainMenuOverlay")) return;
    const ov = document.createElement("div");
    ov.id = "mainMenuOverlay";
    ov.className = "overlay hidden";
    ov.innerHTML = `
      <div class="menu-card">
        <div class="menu-title">TAPBEAT</div>
        <div class="menu-sub">Tap the moving circle on the beat. Build energy. Unlock new vibes.</div>
        <div class="menu-grid">
          <button class="menu-btn play" id="menuPlay"><strong>Play</strong><span>▶</span></button>
          <button class="menu-btn" id="menuSettings"><strong>Settings</strong><span>⚙</span></button>
          <button class="menu-btn" id="menuShop"><strong>Shop</strong><span>🛍</span></button>
          <button class="menu-btn" id="menuGoals"><strong>Goals</strong><span>🏆</span></button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);
  }

  function toast(msg) {
    if (!el.toast) {
      // create lightweight toast if missing
      const t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
      el.toast = t;

      const st = document.createElement("style");
      st.textContent = `
        .toast{
          position: fixed;
          left: 50%;
          bottom: calc(18px + env(safe-area-inset-bottom));
          transform: translateX(-50%);
          background: rgba(0,0,0,0.55);
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(255,255,255,0.92);
          padding: 10px 12px;
          border-radius: 999px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.55);
          opacity: 0;
          transition: opacity 200ms ease, transform 200ms ease;
          pointer-events: none;
          font-size: 0.92rem;
          z-index: 160;
          white-space: nowrap;
        }
        .toast.show{ opacity: 1; transform: translateX(-50%) translateY(-2px); }
      `;
      document.head.appendChild(st);
    }

    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("show"), 1400);
  }

  function setAnimeJudge(text, kind) {
    const j = $("animeJudge");
    if (!j) return;

    j.className = `anime-judge ${kind || ""} show`;
    j.textContent = text;

    // re-trigger animation
    j.classList.remove("show");
    void j.offsetWidth;
    j.classList.add("show");

    // sparks
    spawnSparks(kind);

    // auto fade after a moment
    clearTimeout(setAnimeJudge._t);
    setAnimeJudge._t = setTimeout(() => {
      j.style.opacity = "0";
      setTimeout(() => (j.style.opacity = ""), 10);
    }, 520);
  }

  function spawnSparks(kind) {
    const j = $("animeJudge");
    if (!j) return;
    const r = j.getBoundingClientRect();
    const baseX = r.left + 18;
    const baseY = r.top + r.height / 2;

    const palette = {
      perfect: ["rgba(80,255,200,0.95)", "rgba(120,190,255,0.95)"],
      great: ["rgba(120,190,255,0.95)", "rgba(255,170,190,0.92)"],
      ok: ["rgba(255,170,190,0.92)", "rgba(255,255,255,0.85)"],
      miss: ["rgba(255,120,140,0.95)", "rgba(255,170,190,0.92)"]
    };

    const colors = palette[kind] || ["rgba(255,255,255,0.85)"];
    const count = kind === "perfect" ? 10 : kind === "great" ? 8 : kind === "ok" ? 6 : 7;

    for (let i = 0; i < count; i++) {
      const sp = document.createElement("div");
      sp.className = "spark";
      sp.style.left = `${baseX}px`;
      sp.style.top = `${baseY}px`;
      sp.style.background = colors[i % colors.length];

      const ang = (Math.random() * Math.PI * 1.2) - Math.PI * 0.15; // mostly right/up
      const dist = 90 + Math.random() * 80;
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist - 10;

      sp.style.setProperty("--dx", `${dx}px`);
      sp.style.setProperty("--dy", `${dy}px`);

      document.body.appendChild(sp);
      sp.addEventListener("animationend", () => sp.remove(), { once: true });
    }
  }

  // ---------- Game State ----------
  const state = {
    running: false,
    paused: false,

    // dynamic bpm
    bpm: 108,
    baseBpm: 108,
    bpmMax: 168,
    beatMs: 60000 / 108,

    // judgement windows (ms)
    perfect: 36,
    great: 80,
    ok: 125,

    score: 0,
    combo: 0,
    coins: 0,
    level: 1,

    // time
    runStartMs: 0,
    lastBeatAtMs: 0,
    nextBeatAtMs: 0,

    // movement (smooth glide)
    pos: { x: 0.5, y: 0.5 },
    posTarget: { x: 0.5, y: 0.5 },
    glide: 0.10, // lower = smoother & slower
    moveEnabled: true,
    moveEveryBeats: 3,
    beatsCount: 0,

    // settings
    hapticsOn: true,
    audioOn: true,

    // audio engine
    audio: null,
    audioPerfZeroMs: 0,

    // music progression
    energy: 0, // 0..1
    chorus: 0, // 0..1
    pack: "default",
  };

  function loadSettings() {
    state.hapticsOn = storage.get("tapbeat_haptics", true);
    state.audioOn = storage.get("tapbeat_sound", true);
    state.coins = storage.get("tapbeat_coins", 0);
    if (el.coins) el.coins.textContent = String(state.coins);

    // sync settings overlay toggles if present
    if (el.setHaptics) el.setHaptics.checked = state.hapticsOn;
    if (el.setSound) el.setSound.checked = state.audioOn;
  }

  function saveSettings() {
    storage.set("tapbeat_haptics", state.hapticsOn);
    storage.set("tapbeat_sound", state.audioOn);
    storage.set("tapbeat_coins", state.coins);
  }

  function vibrate(ms) {
    if (!state.hapticsOn) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function recomputeBeat() {
    state.beatMs = 60000 / state.bpm;
    if (el.bpm) el.bpm.textContent = String(Math.round(state.bpm));
  }

  // ---------- Target movement + hit test ----------
  function playfieldRect() {
    return el.playfield.getBoundingClientRect();
  }

  function applyTargetCSS(x, y) {
    const rect = playfieldRect();
    const px = rect.width * x;
    const py = rect.height * y;

    const size = Math.min(rect.width, rect.height) * 0.56; // approximate
    const pad = Math.max(18, size * 0.18);
    const cx = Math.max(pad, Math.min(rect.width - pad, px));
    const cy = Math.max(pad, Math.min(rect.height - pad, py));

    el.target.style.left = `${(cx / rect.width) * 100}%`;
    el.target.style.top  = `${(cy / rect.height) * 100}%`;
  }

  function pickNextPosition() {
    // colorful “arena” movement — choose among 5-ish anchors + slight randomness
    const anchors = [
      { x: 0.50, y: 0.50 },
      { x: 0.22, y: 0.30 },
      { x: 0.78, y: 0.30 },
      { x: 0.28, y: 0.72 },
      { x: 0.72, y: 0.72 },
      { x: 0.50, y: 0.18 },
      { x: 0.50, y: 0.86 },
    ];
    const pick = anchors[Math.floor(Math.random() * anchors.length)];
    // small drift for “alive” feel
    const dx = (Math.random() * 0.10) - 0.05;
    const dy = (Math.random() * 0.10) - 0.05;
    state.posTarget.x = Math.max(0.12, Math.min(0.88, pick.x + dx));
    state.posTarget.y = Math.max(0.14, Math.min(0.86, pick.y + dy));
  }

  function stepGlide() {
    // smooth interpolation towards target
    const k = state.glide;
    state.pos.x += (state.posTarget.x - state.pos.x) * k;
    state.pos.y += (state.posTarget.y - state.pos.y) * k;
    applyTargetCSS(state.pos.x, state.pos.y);
  }

  function pointInsideTarget(clientX, clientY) {
    const tr = el.target.getBoundingClientRect();
    const cx = tr.left + tr.width / 2;
    const cy = tr.top + tr.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const radius = Math.min(tr.width, tr.height) * 0.48; // “circle”
    return (dx * dx + dy * dy) <= (radius * radius);
  }

  // ---------- Ring animation ----------
  function renderRing(phase) {
    if (!el.ringOuter || !el.ringInner) return;
    const p = Math.max(0, Math.min(1, phase));
    const outerScale = 1.42 - 0.62 * p;
    const innerScale = 1.18 - 0.34 * p;

    // brighter / more visible
    const outerOpacity = 0.18 + 0.82 * Math.pow(p, 0.8);
    const innerOpacity = 0.12 + 0.62 * Math.pow(p, 0.8);

    el.ringOuter.style.opacity = String(outerOpacity);
    el.ringOuter.style.transform = `scale(${outerScale})`;
    el.ringInner.style.opacity = String(innerOpacity);
    el.ringInner.style.transform = `scale(${innerScale})`;
  }

  // ---------- Audio (WebAudio) — more dynamic from the start ----------
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

    const bus = ctx.createGain();
    bus.gain.value = 0.95;
    bus.connect(comp);
    comp.connect(master);

    // noise buffer
    const noiseBuf = (() => {
      const len = ctx.sampleRate * 1.0;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
      return b;
    })();

    // global filter for “chorus lift”
    const glue = ctx.createBiquadFilter();
    glue.type = "lowpass";
    glue.frequency.value = 1200;
    glue.Q.value = 0.6;
    glue.connect(bus);

    function kick(t, amp = 1.0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.10);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      o.connect(g);
      g.connect(glue);
      o.start(t);
      o.stop(t + 0.22);
    }

    function hat(t, tone = 9800, amp = 0.45, dur = 0.06) {
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
      g.connect(glue);

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
      g.connect(glue);

      src.start(t);
      src.stop(t + 0.16);
    }

    function bass(t, freq = 55, amp = 0.9) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;

      o.type = "sawtooth";
      o.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);

      o.connect(lp);
      lp.connect(g);
      g.connect(glue);

      o.start(t);
      o.stop(t + 0.24);
    }

    function pad(t, freq = 220, amp = 0.16, len = 0.28) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;

      o.type = "triangle";
      o.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);

      o.connect(lp);
      lp.connect(g);
      g.connect(glue);

      o.start(t);
      o.stop(t + len + 0.02);
    }

    function lead(t, freq = 440, amp = 0.18, len = 0.12) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1400;
      bp.Q.value = 0.8;

      o.type = "triangle";
      o.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);

      o.connect(bp);
      bp.connect(g);
      g.connect(glue);

      o.start(t);
      o.stop(t + len + 0.02);
    }

    return { ctx, master, glue, kick, hat, clap, bass, pad, lead };
  }

  async function ensureAudio() {
    if (!state.audioOn) return;
    if (!state.audio) state.audio = makeAudioEngine();
    try {
      if (state.audio.ctx.state !== "running") await state.audio.ctx.resume();
    } catch {}
    state.audioPerfZeroMs = performance.now() - state.audio.ctx.currentTime * 1000;
  }

  function audioTimeFromPerf(ms) {
    const ctx = state.audio?.ctx;
    if (!ctx) return 0;
    return Math.max(0, (ms - state.audioPerfZeroMs) / 1000);
  }

  // ---------- Scheduling ----------
  let rafId = 0;
  let schedTimer = 0;

  function scheduleAudio() {
    if (!state.running || state.paused || !state.audioOn || !state.audio) return;

    const lookAhead = 0.16; // seconds
    const interval = 25; // ms
    const perfNow = performance.now();
    const windowEnd = perfNow + lookAhead * 1000;

    while (state.nextBeatAtMs <= windowEnd) {
      const t = audioTimeFromPerf(state.nextBeatAtMs);
      const beat = state.beatsCount;
      const beatInBar = beat % 4;
      const beatIn8 = beat % 8;

      // energy and “chorus” progression
      // - energy rises with combo (fast)
      // - chorus rises with time + energy (slower)
      const elapsed = (performance.now() - state.runStartMs) / 1000;
      state.energy = Math.max(0, Math.min(1, state.combo / 28));
      state.chorus = Math.max(0, Math.min(1, (elapsed / 45) * 0.55 + state.energy * 0.65));

      // lift the lowpass cutoff as we approach chorus
      const cutoff = 900 + state.chorus * 4200;
      state.audio.glue.frequency.setValueAtTime(cutoff, t);

      // Base groove: kick + hats start immediately (less boring)
      state.audio.kick(t, 1.0);

      // hats (8ths, with small humanization)
      const hatTone = 9800 + state.chorus * 1200;
      const hatAmp = 0.32 + state.energy * 0.22;
      state.audio.hat(t + (Math.random() * 0.004), hatTone, hatAmp, 0.055);

      const offTime = t + (state.beatMs / 1000) * 0.5;
      const skip = (beatIn8 === 3 || beatIn8 === 7) && Math.random() < (0.15 - state.chorus * 0.10);
      if (!skip) state.audio.hat(offTime, hatTone, hatAmp * 0.75, 0.05);

      // clap enters early but “breathes” (drops occasionally)
      const clapOn = state.energy > 0.20 || elapsed > 8;
      if (clapOn && (beatInBar === 1 || beatInBar === 3)) {
        const drop = (state.chorus > 0.55) && (beatInBar === 1) && Math.random() < 0.25;
        if (!drop) state.audio.clap(t, 0.75 + state.chorus * 0.25);
      }

      // bass enters with energy
      if (state.energy > 0.25 || elapsed > 12) {
        const tBass = t + (state.beatMs / 1000) * 0.5;
        const base = (beatInBar === 0 || beatInBar === 2) ? 55 : 65;
        const lift = state.chorus > 0.70 && beatInBar === 3 ? 73 : base;
        state.audio.bass(tBass, lift, 0.75 + state.chorus * 0.35);
      }

      // pad/lead motifs to stop boredom
      if (elapsed > 6) {
        const chord = [220, 277.18, 329.63, 392.00]; // A, C#, E, G-ish vibe
        const idx = (beat + Math.floor(elapsed / 8)) % chord.length;
        const pFreq = chord[idx];
        if (beatInBar === 0) state.audio.pad(t, pFreq, 0.10 + state.chorus * 0.10, 0.24);
      }

      if (state.chorus > 0.35) {
        // lead on 2 & 4-ish, more frequent toward chorus
        const scale = [392, 440, 523.25, 587.33, 659.25]; // G A C D E
        const pick = scale[(beat + Math.floor(state.energy * 10)) % scale.length];
        const chance = 0.18 + state.chorus * 0.22;
        if ((beatIn8 === 1 || beatIn8 === 5) || Math.random() < chance) {
          state.audio.lead(t, pick, 0.12 + state.chorus * 0.10, 0.11);
        }
      }

      // Beat bookkeeping
      state.lastBeatAtMs = state.nextBeatAtMs;
      state.beatsCount += 1;

      // Move target every N beats
      if (state.moveEnabled && state.beatsCount % state.moveEveryBeats === 0) pickNextPosition();

      // Dynamic BPM ramp: time + combo → faster
      const elapsed2 = (performance.now() - state.runStartMs) / 1000;
      const ramp = (elapsed2 * 0.55) + (state.combo * 0.45);
      const newBpm = Math.min(state.bpmMax, state.baseBpm + ramp);
      state.bpm = newBpm;
      recomputeBeat();

      state.nextBeatAtMs += state.beatMs;

      // UI
      if (el.lvl) el.lvl.textContent = String(1 + Math.floor(elapsed2 / 20));
      if (el.energy) el.energy.textContent = `Energy: ${Math.floor(state.energy * 100)}%`;
      if (el.trackState) el.trackState.textContent = `Vibe: ${state.chorus > 0.65 ? "Chorus" : "Verse"}`;
    }

    schedTimer = window.setTimeout(scheduleAudio, interval);
  }

  function startLoops() {
    cancelAnimationFrame(rafId);
    if (schedTimer) clearTimeout(schedTimer);

    const loop = () => {
      if (!state.running || state.paused) return;

      // ring phase based on next beat
      const ttn = state.nextBeatAtMs - performance.now();
      const phase = 1 - (ttn / state.beatMs);
      renderRing(((phase % 1) + 1) % 1);

      // smooth glide step
      stepGlide();

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

  // ---------- Scoring / judgement ----------
  function awardCoins(n) {
    if (n <= 0) return;
    state.coins += n;
    if (el.coins) el.coins.textContent = String(state.coins);
    saveSettings();
  }

  function judgeTap(perfDeltaMs, wasInside) {
    if (!wasInside) {
      // Tap outside the circle = MISS (meaningful)
      state.combo = 0;
      if (el.combo) el.combo.textContent = "0";
      setAnimeJudge("MISS", "miss");
      vibrate(18);
      return;
    }

    let kind = "miss";
    let base = 0;

    if (perfDeltaMs <= state.perfect) { kind = "perfect"; base = 120; }
    else if (perfDeltaMs <= state.great) { kind = "great"; base = 70; }
    else if (perfDeltaMs <= state.ok) { kind = "ok"; base = 35; }
    else { kind = "miss"; base = 0; }

    if (kind === "miss") {
      state.combo = 0;
      if (el.combo) el.combo.textContent = "0";
      setAnimeJudge("MISS", "miss");
      vibrate(18);
      return;
    }

    state.combo += 1;
    const mult = 1 + Math.min(2.5, state.combo / 26);
    const earned = Math.floor(base * mult);
    state.score += earned;

    if (el.score) el.score.textContent = String(state.score);
    if (el.combo) el.combo.textContent = String(state.combo);

    // coin rewards: Perfect feels juicy
    const coin = (kind === "perfect") ? 4 : (kind === "great") ? 2 : 1;
    awardCoins(coin + (state.combo >= 18 ? 1 : 0));

    if (kind === "perfect") {
      setAnimeJudge("PERFECT!", "perfect");
      vibrate(8);
    } else if (kind === "great") {
      setAnimeJudge("GREAT!", "great");
      vibrate(5);
    } else {
      setAnimeJudge("OK!", "ok");
      vibrate(3);
    }
  }

  // ---------- Input (tap ONLY on circle) ----------
  function onPointerDown(e) {
    if (!state.running || state.paused) return;

    // Use touch point
    const x = e.clientX;
    const y = e.clientY;

    const inside = pointInsideTarget(x, y);

    // delta to nearest beat
    const t = performance.now();
    const dLast = Math.abs(t - state.lastBeatAtMs);
    const dNext = Math.abs(state.nextBeatAtMs - t);
    const delta = Math.min(dLast, dNext);

    judgeTap(delta, inside);
  }

  // Attach pointerdown ONLY to playfield so taps outside playfield don’t matter
  function bindInput() {
    el.playfield.addEventListener("pointerdown", (e) => {
      // Prevent accidental scroll
      e.preventDefault();
      onPointerDown(e);
    }, { passive: false });
  }

  // ---------- Menus (single gear) ----------
  function hideOldTopButtons() {
    // If your old topbar still exists, we visually hide it (we don’t delete to avoid breaking your HTML)
    const topbar = document.querySelector(".topbar");
    if (topbar) topbar.style.display = "none";
  }

  function showOverlay(id) {
    const ov = $(id);
    if (!ov) return;
    ov.classList.remove("hidden");
  }
  function hideOverlay(id) {
    const ov = $(id);
    if (!ov) return;
    ov.classList.add("hidden");
  }

  function openMenu() {
    showOverlay("mainMenuOverlay");
  }
  function closeMenu() {
    hideOverlay("mainMenuOverlay");
  }

  // ---------- Game lifecycle ----------
  async function startRun() {
    state.running = true;
    state.paused = false;
    state.score = 0;
    state.combo = 0;

    state.baseBpm = 108;
    state.bpm = state.baseBpm;
    recomputeBeat();

    state.runStartMs = performance.now();
    state.beatsCount = 0;

    if (el.score) el.score.textContent = "0";
    if (el.combo) el.combo.textContent = "0";

    // initial beat anchors
    const n = performance.now();
    state.lastBeatAtMs = n;
    state.nextBeatAtMs = n + state.beatMs;

    // movement start
    state.pos.x = 0.5; state.pos.y = 0.5;
    state.posTarget.x = 0.5; state.posTarget.y = 0.5;
    applyTargetCSS(0.5, 0.5);
    pickNextPosition();

    // audio
    await ensureAudio();

    closeMenu();
    setAnimeJudge("GO!", "great");

    startLoops();
  }

  function stopRun() {
    stopLoops();
    state.running = false;
    state.paused = false;
    closeMenu();
  }

  // ---------- Splash longer, then main menu ----------
  function runSplashIfPresent() {
    const splash = el.splashOverlay;
    if (!splash) {
      // no splash in HTML — just show menu immediately
      openMenu();
      return;
    }

    // hide any old start overlay
    if (el.startOverlay) el.startOverlay.classList.add("hidden");

    // “presents” appears
    setTimeout(() => {
      if (el.splashPresents) el.splashPresents.classList.add("show");
    }, 850);

    // keep splash longer
    setTimeout(() => {
      splash.classList.add("fade-out");
    }, 2550);

    setTimeout(() => {
      splash.classList.add("hidden");
      openMenu();
    }, 3200);
  }

  // ---------- Settings overlay minimal (if your HTML has it, we use it; if not, we use menu buttons) ----------
  function bindMenuButtons() {
    const gear = $("gearBtn");
    if (gear) gear.addEventListener("click", () => {
      if (!state.running) openMenu();
      else openMenu(); // same menu during game
    });

    const play = $("menuPlay");
    const settingsBtn = $("menuSettings");
    const shopBtn = $("menuShop");
    const goalsBtn = $("menuGoals");

    if (play) play.addEventListener("click", startRun);

    if (settingsBtn) settingsBtn.addEventListener("click", () => {
      // If you already have settingsOverlay in HTML, show it; else simple quick toggles via confirm-like UI
      if (el.settingsOverlay) showOverlay(el.settingsOverlay.id);
      else {
        state.hapticsOn = !state.hapticsOn;
        state.audioOn = !state.audioOn;
        saveSettings();
        toast(`Haptics ${state.hapticsOn ? "ON" : "OFF"} • Sound ${state.audioOn ? "ON" : "OFF"}`);
      }
    });

    if (shopBtn) shopBtn.addEventListener("click", () => {
      if (el.shopOverlay) showOverlay(el.shopOverlay.id);
      else toast("Shop coming soon (stub).");
    });

    if (goalsBtn) goalsBtn.addEventListener("click", () => {
      if (el.achOverlay) showOverlay(el.achOverlay.id);
      else toast("Goals coming soon (stub).");
    });

    // Close overlays if your HTML has close buttons
    const closeButtons = document.querySelectorAll("[data-close-overlay]");
    closeButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close-overlay");
        hideOverlay(id);
      });
    });
  }

  // If your settings overlay exists, wire toggles if present
  function bindSettingsToggles() {
    if (el.setHaptics) {
      el.setHaptics.checked = state.hapticsOn;
      el.setHaptics.addEventListener("change", () => {
        state.hapticsOn = !!el.setHaptics.checked;
        saveSettings();
        toast(state.hapticsOn ? "Haptics ON" : "Haptics OFF");
      });
    }
    if (el.setSound) {
      el.setSound.checked = state.audioOn;
      el.setSound.addEventListener("change", async () => {
        state.audioOn = !!el.setSound.checked;
        saveSettings();
        if (state.audioOn) await ensureAudio();
        toast(state.audioOn ? "Sound ON" : "Sound OFF");
      });
    }
  }

  // ---------- Boot ----------
  injectStylesOnce();
  createAnimeHUD();
  createGearButton();
  createMainMenuOverlay();
  hideOldTopButtons();

  loadSettings();
  bindInput();
  bindMenuButtons();
  bindSettingsToggles();

  // Keep target positioned correctly on resize/orientation
  window.addEventListener("resize", () => applyTargetCSS(state.pos.x, state.pos.y));

  // Splash → menu
  runSplashIfPresent();
})();