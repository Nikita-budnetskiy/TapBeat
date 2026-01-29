/* TapBeat — game.js
   Works with BOTH layouts:
   A) Old:  #intro #menu #game #field #target + #settings modal + #skins
   B) New:  #splash #mainMenu #gameUI #gameCanvas + panels (#settingsPanel etc)

   Fixes:
   - splash/intro no longer "hangs" if markup differs
   - wider timing window (leniency)
   - tap counts anywhere inside the target circle (full area)
   - smooth target glide
   - 3 lives (hearts), misses don't restart the whole music/progress
   - haptics + sound toggles
   - simple music synth (WebAudio) so "music exists" without files
   - achievements + localStorage
*/

(() => {
  "use strict";

  /********************
   * Helpers
   ********************/
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const nowMs = () => performance.now();

  function safeOn(el, ev, fn, opts) {
    if (!el) return;
    el.addEventListener(ev, fn, opts);
  }

  /********************
   * Detect layout (old vs new)
   ********************/
  const layoutOld = {
    intro: $("#intro"),
    menu: $("#menu"),
    game: $("#game"),
    target: $("#target"),
    field: $("#field"),
    feedback: $("#feedback"),
    lives: $("#lives"),
    settingsModal: $("#settings"),
    closeSettings: $("#closeSettings"),
    gear: $("#gear"),
    playBtn: $("#playBtn"),
    openSettingsFromMenu: $("#openSettingsFromMenu"),
    vibe: $("#vibe"),
    bpm: $("#bpm"),
    lvl: $("#lvl"),
    score: $("#score"),
    combo: $("#combo"),
    coins: $("#coins"),
    energyFill: $("#energyFill"),
    energyPct: $("#energyPct"),
    streak: $("#streak"),
    particles: $("#particles"),
    flash: $("#flash"),
    flybys: $("#flybys"),
    skinsWrap: $("#skins"),
    vibrationToggle: $("#vibrationToggle"),
    musicToggle: $("#musicToggle"),
    volume: $("#volume"),
  };

  const layoutNew = {
    splash: $("#splash"),
    mainMenu: $("#mainMenu"),
    gameUI: $("#gameUI"),
    canvas: $("#gameCanvas"),
    feedback: $("#feedback"),
    overlayDim: $("#overlayDim"),
    settingsPanel: $("#settingsPanel"),
    tutorialPanel: $("#tutorialPanel"),
    achPanel: $("#achPanel"),
    shopPanel: $("#shopPanel"),
    btnPlay: $("#btnPlay"),
    btnTutorial: $("#btnTutorial"),
    btnAchievements: $("#btnAchievements"),
    btnShop: $("#btnShop"),
    btnGear: $("#btnGear"),
    btnCloseSettings: $("#btnCloseSettings"),
    btnResume: $("#btnResume"),
    btnBackToMenu: $("#btnBackToMenu"),
    toggleHaptics: $("#toggleHaptics"),
    toggleSound: $("#toggleSound"),
    coinsHome: $("#coinsHome"),
    bestComboHome: $("#bestComboHome"),
    hudScore: $("#hudScore"),
    hudCombo: $("#hudCombo"),
    hudCoins: $("#hudCoins"),
    hudBpm: $("#hudBpm"),
    hudLv: $("#hudLv"),
    hudVibe: $("#hudVibe"),
    hudEnergy: $("#hudEnergy"),
    btnCloseTutorial: $("#btnCloseTutorial"),
    btnStartFromTutorial: $("#btnStartFromTutorial"),
    btnCloseAch: $("#btnCloseAch"),
    btnAchOk: $("#btnAchOk"),
    achList: $("#achList"),
    btnCloseShop: $("#btnCloseShop"),
    btnShopOk: $("#btnShopOk"),
  };

  const isNew = !!layoutNew.splash || !!layoutNew.mainMenu || !!layoutNew.gameUI;
  const isOld = !!layoutOld.menu || !!layoutOld.game || !!layoutOld.target;

  // If both exist somehow, prefer old (since your CSS currently targets #target etc).
  const mode = isOld ? "old" : "new";

  /********************
   * Screen / panel control
   ********************/
  function showOldScreen(name) {
    const screens = [layoutOld.intro, layoutOld.menu, layoutOld.game].filter(Boolean);
    screens.forEach((s) => s.classList.remove("active"));
    if (name === "intro" && layoutOld.intro) layoutOld.intro.classList.add("active");
    if (name === "menu" && layoutOld.menu) layoutOld.menu.classList.add("active");
    if (name === "game" && layoutOld.game) layoutOld.game.classList.add("active");
  }

  function showNewScreen(name) {
    // new uses "hidden" class
    const { splash, mainMenu, gameUI } = layoutNew;
    if (splash) splash.classList.toggle("hidden", name !== "splash");
    if (mainMenu) mainMenu.classList.toggle("hidden", name !== "menu");
    if (gameUI) gameUI.classList.toggle("hidden", name !== "game");

    if (splash) splash.setAttribute("aria-hidden", name !== "splash" ? "true" : "false");
    if (mainMenu) mainMenu.setAttribute("aria-hidden", name !== "menu" ? "true" : "false");
    if (gameUI) gameUI.setAttribute("aria-hidden", name !== "game" ? "true" : "false");
  }

  function openOldSettings(open) {
    if (!layoutOld.settingsModal) return;
    layoutOld.settingsModal.classList.toggle("active", !!open);
  }

  function openNewPanel(panelEl, open) {
    if (!panelEl) return;
    const dim = layoutNew.overlayDim;
    panelEl.classList.toggle("hidden", !open);
    panelEl.setAttribute("aria-hidden", open ? "false" : "true");
    if (dim) {
      dim.classList.toggle("hidden", !open);
      dim.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  /********************
   * Persistent state
   ********************/
  const STORE_KEY = "tapbeat_save_v1";
  const ACH_KEY = "tapbeat_ach_v1";

  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveSave(obj) {
    localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  }

  function loadAch() {
    try {
      return JSON.parse(localStorage.getItem(ACH_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveAch(obj) {
    localStorage.setItem(ACH_KEY, JSON.stringify(obj));
  }

  const save = loadSave();
  const achUnlocked = loadAch();

  /********************
   * Settings
   ********************/
  let settings = {
    haptics: save.haptics ?? true,
    sound: save.sound ?? true,
    volume: clamp(save.volume ?? 0.7, 0, 1),
    skin: save.skin ?? "neo",
  };

  function persistSettings() {
    save.haptics = settings.haptics;
    save.sound = settings.sound;
    save.volume = settings.volume;
    save.skin = settings.skin;
    saveSave(save);
  }

  function doHaptic(ms = 20) {
    if (!settings.haptics) return;
    // iOS Safari: navigator.vibrate often unsupported; but harmless to call.
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  /********************
   * Skins (CSS variables)
   ********************/
  const SKINS = [
    { id: "neo", name: "Neo Cyan", border: "#2de2e6", glow: "rgba(45,226,230,0.9)", core: "#f72585" },
    { id: "mint", name: "Mint Pop", border: "#7cff6b", glow: "rgba(124,255,107,0.9)", core: "#2de2e6" },
    { id: "pink", name: "Candy Pink", border: "#ff2d86", glow: "rgba(255,45,134,0.9)", core: "#ffd166" },
    { id: "sky", name: "Sky Blue", border: "#4cc9f0", glow: "rgba(76,201,240,0.9)", core: "#ff2d86" },
    { id: "sun", name: "Sun Gold", border: "#ffd166", glow: "rgba(255,209,102,0.9)", core: "#7cff6b" },
  ];

  function applySkin(id) {
    const s = SKINS.find(x => x.id === id) || SKINS[0];
    document.documentElement.style.setProperty("--skinBorder", s.border);
    document.documentElement.style.setProperty("--skinGlow", s.glow);
    document.documentElement.style.setProperty("--skinCore", s.core);
    settings.skin = s.id;
    persistSettings();
  }
  applySkin(settings.skin);

  /********************
   * Achievements
   ********************/
  const ACH = [
    { id: "first_hit", title: "First Hit!", desc: "Land your first GREAT or PERFECT." },
    { id: "first_perfect", title: "Perfect!", desc: "Get a PERFECT once." },
    { id: "combo_10", title: "Combo x10", desc: "Reach combo 10." },
    { id: "combo_25", title: "Combo x25", desc: "Reach combo 25." },
    { id: "survive_60", title: "Stayin’ Alive", desc: "Play for 60 seconds." },
    { id: "rich_vibe", title: "Into the Drop", desc: "Fill energy to 100% once." },
  ];

  function unlockAch(id) {
    if (achUnlocked[id]) return;
    achUnlocked[id] = { t: Date.now() };
    saveAch(achUnlocked);
    // show tiny toast using feedback
    showFeedback("ACHIEVEMENT!", "WOW", 1400);
    // If new layout, also refresh list if open
    renderAchList();
  }

  function renderAchList() {
    // old layout doesn't have a panel list; new layout has #achList
    if (!layoutNew.achList) return;
    const wrap = layoutNew.achList;
    wrap.innerHTML = "";
    ACH.forEach(a => {
      const isOn = !!achUnlocked[a.id];
      const row = document.createElement("div");
      row.className = "achRow";
      row.innerHTML = `
        <div class="achLeft">
          <div class="achTitle">${isOn ? "✅" : "⬜️"} ${a.title}</div>
          <div class="achDesc">${a.desc}</div>
        </div>
        <div class="achRight">${isOn ? "Unlocked" : "Locked"}</div>
      `;
      wrap.appendChild(row);
    });
  }

  /********************
   * UI pointers (old + new)
   ********************/
  // Common score state
  let coins = save.coins ?? 0;
  let bestCombo = save.bestCombo ?? 0;

  function persistStats() {
    save.coins = coins;
    save.bestCombo = bestCombo;
    saveSave(save);
  }

  function setHomeStats() {
    if (layoutNew.coinsHome) layoutNew.coinsHome.textContent = String(coins);
    if (layoutNew.bestComboHome) layoutNew.bestComboHome.textContent = String(bestCombo);
  }

  setHomeStats();

  /********************
   * Audio (simple synth)
   ********************/
  let audioCtx = null;
  let masterGain = null;

  function ensureAudio() {
    if (!settings.sound) return;
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = settings.volume;
    masterGain.connect(audioCtx.destination);
  }

  function setVolume(v01) {
    settings.volume = clamp(v01, 0, 1);
    persistSettings();
    if (masterGain) masterGain.gain.value = settings.volume;
  }

  function ping(freq, dur = 0.06, type = "sine", gain = 0.25) {
    if (!settings.sound) return;
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(masterGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function thump(dur = 0.08, gain = 0.35) {
    if (!settings.sound) return;
    ensureAudio();
    if (!audioCtx || !masterGain) return;

    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(70, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(masterGain);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  /********************
   * Game state
   ********************/
  let running = false;

  // Timing windows (THIS is what you wanted to tweak)
  // Сделал больше, чтобы "иногда мисс" ушло:
  const PERFECT_WINDOW_MS = 95;   // было уже (обычно 60-80) — расширили
  const GREAT_WINDOW_MS   = 175;  // расширили
  const HIT_WINDOW_MS     = GREAT_WINDOW_MS; // всё что <= GREAT считается попаданием

  // Beat / difficulty
  let bpm = 88;          // старт медленнее
  let level = 1;
  let vibe = "Verse";
  let energy = 0;        // 0..100
  let score = 0;
  let combo = 0;
  let streak = 0;

  // lives
  const MAX_LIVES = 3;
  let lives = MAX_LIVES;

  // Beat scheduling
  let beatIndex = 0;
  let nextBeatTimeMs = 0;     // in performance.now() ms
  let beatIntervalMs = 0;

  // Target motion
  let targetX = 0;
  let targetY = 0;
  let targetTX = 0;
  let targetTY = 0;
  let targetR = 75;

  // RAF loop
  let rafId = 0;

  /********************
   * Old layout particle helpers (uses #particles/#flash/#flybys)
   ********************/
  function spawnParticles(x, y, kind = "good") {
    if (!layoutOld.particles) return;
    const n = kind === "perfect" ? 22 : kind === "good" ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("div");
      p.className = "p";
      const ang = Math.random() * Math.PI * 2;
      const dist = (kind === "perfect" ? 90 : 60) * (0.4 + Math.random() * 0.8);
      const dx = Math.cos(ang) * dist;
      const dy = Math.sin(ang) * dist;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);
      // color via inline
      const c = kind === "perfect" ? "rgba(124,255,107,0.95)" : kind === "good" ? "rgba(45,226,230,0.95)" : "rgba(255,45,134,0.95)";
      p.style.background = c;
      layoutOld.particles.appendChild(p);
      setTimeout(() => p.remove(), 700);
    }
  }

  function flashOn() {
    if (!layoutOld.flash) return;
    layoutOld.flash.classList.remove("on");
    // force reflow
    void layoutOld.flash.offsetWidth;
    layoutOld.flash.classList.add("on");
  }

  function spawnFlyby() {
    if (!layoutOld.flybys) return;
    const f = document.createElement("div");
    f.className = "fly";
    f.style.top = `${10 + Math.random() * 40}vh`;
    layoutOld.flybys.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  /********************
   * Feedback text (anime-ish)
   ********************/
  let feedbackTimer = 0;
  function showFeedback(text, style = "GREAT", ms = 520) {
    const el = (mode === "old") ? layoutOld.feedback : layoutNew.feedback;
    if (!el) return;

    el.textContent = `${text}`;
    el.classList.remove("f-miss", "f-good", "f-perfect", "f-wow");
    if (style === "MISS") el.classList.add("f-miss");
    if (style === "GREAT") el.classList.add("f-good");
    if (style === "PERFECT") el.classList.add("f-perfect");
    if (style === "WOW") el.classList.add("f-wow");

    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");

    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      el.classList.remove("pop");
      el.textContent = "";
    }, ms);
  }

  /********************
   * UI updates
   ********************/
  function renderLives() {
    if (!layoutOld.lives) return;
    layoutOld.lives.innerHTML = "";
    for (let i = 0; i < MAX_LIVES; i++) {
      const img = document.createElement("div");
      img.className = "heart" + (i < lives ? "" : " off");
      // Pure CSS heart via background (no files)
      img.style.background =
        "radial-gradient(circle at 30% 35%, #fff 0 20%, transparent 21%)," +
        "radial-gradient(circle at 70% 35%, #fff 0 20%, transparent 21%)," +
        "conic-gradient(from 220deg, transparent 0 40deg, #ff2d86 40deg 320deg, transparent 320deg 360deg)";
      img.style.borderRadius = "8px";
      img.style.boxShadow = "0 10px 18px rgba(0,0,0,0.25)";
      layoutOld.lives.appendChild(img);
    }
  }

  function updateHUD() {
    if (mode === "old") {
      if (layoutOld.score) layoutOld.score.textContent = String(score);
      if (layoutOld.combo) layoutOld.combo.textContent = String(combo);
      if (layoutOld.coins) layoutOld.coins.textContent = String(coins);
      if (layoutOld.bpm) layoutOld.bpm.textContent = String(Math.round(bpm));
      if (layoutOld.lvl) layoutOld.lvl.textContent = String(level);
      if (layoutOld.vibe) layoutOld.vibe.textContent = vibe;
      if (layoutOld.energyFill) layoutOld.energyFill.style.width = `${energy}%`;
      if (layoutOld.energyPct) layoutOld.energyPct.textContent = String(Math.round(energy));
      if (layoutOld.streak) layoutOld.streak.textContent = String(streak);
      renderLives();
    } else {
      if (layoutNew.hudScore) layoutNew.hudScore.textContent = String(score);
      if (layoutNew.hudCombo) layoutNew.hudCombo.textContent = String(combo);
      if (layoutNew.hudCoins) layoutNew.hudCoins.textContent = String(coins);
      if (layoutNew.hudBpm) layoutNew.hudBpm.textContent = String(Math.round(bpm));
      if (layoutNew.hudLv) layoutNew.hudLv.textContent = String(level);
      if (layoutNew.hudVibe) layoutNew.hudVibe.textContent = vibe;
      if (layoutNew.hudEnergy) layoutNew.hudEnergy.textContent = `${Math.round(energy)}%`;
    }
  }

  /********************
   * Target positioning (OLD layout)
   ********************/
  function resizeTargetRadius() {
    if (!layoutOld.target) return;
    const rect = layoutOld.target.getBoundingClientRect();
    targetR = Math.min(rect.width, rect.height) / 2;
  }

  function setTargetPos(x, y) {
    if (!layoutOld.target) return;
    layoutOld.target.style.transform = `translate(${x - targetR}px, ${y - targetR}px)`;
  }

  function pickNewTarget() {
    if (!layoutOld.field) return;

    const fr = layoutOld.field.getBoundingClientRect();
    const pad = 90;
    targetTX = fr.left + pad + Math.random() * (fr.width - pad * 2);
    targetTY = fr.top + pad + Math.random() * (fr.height - pad * 2);
  }

  /********************
   * Hit detection (full area of circle)
   ********************/
  function isPointInTarget(clientX, clientY) {
    if (!layoutOld.target) return false;
    const r = layoutOld.target.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return (dx * dx + dy * dy) <= (targetR * targetR);
  }

  /********************
   * Beat / scoring
   ********************/
  function resetRun() {
    running = false;

    bpm = 88;
    level = 1;
    vibe = "Verse";
    energy = 0;
    score = 0;
    combo = 0;
    streak = 0;
    lives = MAX_LIVES;

    beatIndex = 0;
    beatIntervalMs = (60_000 / bpm);
    nextBeatTimeMs = nowMs() + 900; // старт чуть медленнее, чтобы не "сразу"
    pickNewTarget();

    updateHUD();
  }

  function calcDifficulty() {
    // BPM grows with combo, but not crazy
    const base = 88;
    const add = Math.min(52, combo * 1.1);
    bpm = base + add;

    // level rises every ~12 combo
    level = 1 + Math.floor(combo / 12);

    // vibe progression using energy
    if (energy < 35) vibe = "Verse";
    else if (energy < 70) vibe = "Build";
    else if (energy < 100) vibe = "Chorus";
    else vibe = "DROP";
  }

  function awardCoins(amount) {
    coins += amount;
    persistStats();
    setHomeStats();
  }

  function onHit(kind) {
    // kind: "perfect" | "good"
    if (kind === "perfect") {
      score += 180 + combo * 2;
      combo += 1;
      streak += 1;
      energy = clamp(energy + 6, 0, 100);
      awardCoins(2);
      doHaptic(18);
      ping(880, 0.05, "triangle", 0.22);
      ping(1320, 0.05, "sine", 0.12);
      showFeedback("PERFECT!", "PERFECT", 520);
      unlockAch("first_perfect");
    } else {
      score += 110 + combo;
      combo += 1;
      streak += 1;
      energy = clamp(energy + 3.5, 0, 100);
      awardCoins(1);
      doHaptic(12);
      ping(660, 0.05, "triangle", 0.18);
      showFeedback("GREAT!", "GREAT", 480);
    }

    if (combo === 1) unlockAch("first_hit");
    if (combo === 10) unlockAch("combo_10");
    if (combo === 25) unlockAch("combo_25");
    if (energy >= 100) unlockAch("rich_vibe");

    bestCombo = Math.max(bestCombo, combo);
    persistStats();
    setHomeStats();

    // Old layout FX
    if (mode === "old") {
      const tr = layoutOld.target.getBoundingClientRect();
      const cx = tr.left + tr.width / 2;
      const cy = tr.top + tr.height / 2;
      spawnParticles(cx, cy, kind === "perfect" ? "perfect" : "good");
      flashOn();
      if (Math.random() < 0.28) spawnFlyby();
      layoutOld.target.classList.remove("pulse");
      void layoutOld.target.offsetWidth;
      layoutOld.target.classList.add("pulse");
    }

    // After some hits, gently speed up scheduler
    calcDifficulty();
    beatIntervalMs = (60_000 / bpm);

    updateHUD();
    pickNewTarget();
  }

  function onMiss() {
    // Important: do NOT restart whole music/progress — just penalty
    lives = Math.max(0, lives - 1);
    combo = 0;
    streak = 0;
    energy = clamp(energy - 10, 0, 100);

    doHaptic(35);
    thump(0.08, 0.38);
    showFeedback("MISS!", "MISS", 560);

    updateHUD();

    if (lives <= 0) {
      // Game over → back to menu
      running = false;
      cancelAnimationFrame(rafId);

      // small delay so player sees miss/game over feel
      setTimeout(() => {
        if (mode === "old") showOldScreen("menu");
        else showNewScreen("menu");
      }, 450);
    }
  }

  function judgeTap(tapMs) {
    // Find nearest beat time.
    // We'll judge against nextBeatTimeMs and previous beat too, so taps slightly early/late are OK.
    const prev = nextBeatTimeMs - beatIntervalMs;
    const d1 = Math.abs(tapMs - prev);
    const d2 = Math.abs(tapMs - nextBeatTimeMs);
    const d = Math.min(d1, d2);

    if (d <= PERFECT_WINDOW_MS) return "perfect";
    if (d <= GREAT_WINDOW_MS) return "good";
    return "miss";
  }

  /********************
   * Game loop (OLD layout)
   ********************/
  function step() {
    if (!running) return;

    const t = nowMs();

    // Advance beat schedule
    while (t >= nextBeatTimeMs) {
      // beat tick sound varies by vibe (richer later)
      if (settings.sound) {
        if (vibe === "Verse") ping(220, 0.04, "sine", 0.10);
        else if (vibe === "Build") { ping(220, 0.04, "sine", 0.11); ping(440, 0.04, "triangle", 0.08); }
        else if (vibe === "Chorus") { ping(330, 0.04, "triangle", 0.12); ping(660, 0.04, "sine", 0.10); }
        else { ping(440, 0.04, "sawtooth", 0.12); ping(880, 0.04, "triangle", 0.10); ping(1320, 0.03, "sine", 0.07); }
      }

      beatIndex++;
      nextBeatTimeMs += beatIntervalMs;

      // passive energy decay
      energy = clamp(energy - 0.25, 0, 100);
      updateHUD();
    }

    // Smooth glide target toward targetTX/TY
    if (mode === "old") {
      if (!layoutOld.field || !layoutOld.target) {
        // if markup changed mid-flight
        running = false;
        return;
      }

      // on first frame ensure sizes
      resizeTargetRadius();

      // current position in screen coords
      if (targetX === 0 && targetY === 0) {
        const fr = layoutOld.field.getBoundingClientRect();
        targetX = fr.left + fr.width * 0.5;
        targetY = fr.top + fr.height * 0.5;
        targetTX = targetX;
        targetTY = targetY;
      }

      // glide
      const glide = 0.08; // smooth, not jerky
      targetX = lerp(targetX, targetTX, glide);
      targetY = lerp(targetY, targetTY, glide);

      setTargetPos(targetX, targetY);
    }

    rafId = requestAnimationFrame(step);
  }

  /********************
   * Input (OLD layout: tap must be inside target)
   ********************/
  function onPointerDown(e) {
    if (!running) return;
    // If settings open — ignore
    if (mode === "old" && layoutOld.settingsModal?.classList.contains("active")) return;

    const pt = (e.touches && e.touches[0]) ? e.touches[0] : e;
    const inside = isPointInTarget(pt.clientX, pt.clientY);

    if (!inside) {
      onMiss();
      return;
    }

    const res = judgeTap(nowMs());
    if (res === "perfect") onHit("perfect");
    else if (res === "good") onHit("good");
    else onMiss();
  }

  /********************
   * Skins UI (OLD settings modal)
   ********************/
  function buildSkinsUI() {
    if (!layoutOld.skinsWrap) return;
    layoutOld.skinsWrap.innerHTML = "";

    SKINS.forEach(s => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "skinBtn";
      b.textContent = s.name;
      b.style.border = `2px solid ${s.border}`;
      b.style.background = "rgba(255,255,255,0.06)";
      b.style.color = "#fff";
      b.style.padding = "10px 12px";
      b.style.borderRadius = "14px";
      b.style.cursor = "pointer";
      b.style.margin = "6px 8px 0 0";
      b.onclick = () => applySkin(s.id);
      layoutOld.skinsWrap.appendChild(b);
    });
  }

  /********************
   * Wiring: OLD layout
   ********************/
  function initOld() {
    buildSkinsUI();

    // Set toggles
    if (layoutOld.vibrationToggle) layoutOld.vibrationToggle.checked = settings.haptics;
    if (layoutOld.musicToggle) layoutOld.musicToggle.checked = settings.sound;
    if (layoutOld.volume) layoutOld.volume.value = String(Math.round(settings.volume * 100));

    safeOn(layoutOld.vibrationToggle, "change", (e) => {
      settings.haptics = !!e.target.checked;
      persistSettings();
      doHaptic(20);
    });

    safeOn(layoutOld.musicToggle, "change", (e) => {
      settings.sound = !!e.target.checked;
      persistSettings();
      if (settings.sound) ensureAudio();
    });

    safeOn(layoutOld.volume, "input", (e) => {
      const v = Number(e.target.value) / 100;
      setVolume(v);
    });

    // intro -> menu
    showOldScreen("intro");
    setTimeout(() => showOldScreen("menu"), 1200);

    // play
    safeOn(layoutOld.playBtn, "click", async () => {
      ensureAudio();
      // iOS needs user gesture to start audio context
      if (audioCtx && audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }

      resetRun();
      showOldScreen("game");
      running = true;
      // schedule from "now"
      nextBeatTimeMs = nowMs() + 900;
      rafId = requestAnimationFrame(step);
    });

    // settings
    safeOn(layoutOld.openSettingsFromMenu, "click", () => openOldSettings(true));
    safeOn(layoutOld.gear, "click", () => openOldSettings(true));
    safeOn(layoutOld.closeSettings, "click", () => openOldSettings(false));

    // tap handler on whole document for reliability, but we check circle area anyway
    safeOn(document, "pointerdown", onPointerDown, { passive: true });
    safeOn(document, "touchstart", onPointerDown, { passive: true });

    updateHUD();
    renderLives();

    // survive achievement timer
    let startMs = 0;
    setInterval(() => {
      if (!running) { startMs = 0; return; }
      if (!startMs) startMs = nowMs();
      if (nowMs() - startMs >= 60_000) unlockAch("survive_60");
    }, 1000);
  }

  /********************
   * Wiring: NEW layout (fallback)
   * (If you later switch to canvas version again, you won't "hang")
   ********************/
  function initNew() {
    // sync toggles
    if (layoutNew.toggleHaptics) layoutNew.toggleHaptics.checked = settings.haptics;
    if (layoutNew.toggleSound) layoutNew.toggleSound.checked = settings.sound;

    safeOn(layoutNew.toggleHaptics, "change", (e) => {
      settings.haptics = !!e.target.checked;
      persistSettings();
      doHaptic(20);
    });

    safeOn(layoutNew.toggleSound, "change", (e) => {
      settings.sound = !!e.target.checked;
      persistSettings();
      if (settings.sound) ensureAudio();
    });

    function closeAllPanels() {
      openNewPanel(layoutNew.settingsPanel, false);
      openNewPanel(layoutNew.tutorialPanel, false);
      openNewPanel(layoutNew.achPanel, false);
      openNewPanel(layoutNew.shopPanel, false);
    }

    // splash -> menu
    showNewScreen("splash");
    setTimeout(() => showNewScreen("menu"), 1200);

    safeOn(layoutNew.btnPlay, "click", async () => {
      ensureAudio();
      if (audioCtx && audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }
      resetRun();
      showNewScreen("game");
      running = true;
      nextBeatTimeMs = nowMs() + 900;
      rafId = requestAnimationFrame(step); // step only moves target if old; new just runs beats/HUD
    });

    safeOn(layoutNew.btnGear, "click", () => openNewPanel(layoutNew.settingsPanel, true));
    safeOn(layoutNew.btnCloseSettings, "click", () => openNewPanel(layoutNew.settingsPanel, false));
    safeOn(layoutNew.btnResume, "click", () => openNewPanel(layoutNew.settingsPanel, false));
    safeOn(layoutNew.btnBackToMenu, "click", () => {
      running = false;
      cancelAnimationFrame(rafId);
      closeAllPanels();
      showNewScreen("menu");
    });

    safeOn(layoutNew.btnTutorial, "click", () => openNewPanel(layoutNew.tutorialPanel, true));
    safeOn(layoutNew.btnCloseTutorial, "click", () => openNewPanel(layoutNew.tutorialPanel, false));
    safeOn(layoutNew.btnStartFromTutorial, "click", async () => {
      openNewPanel(layoutNew.tutorialPanel, false);
      ensureAudio();
      if (audioCtx && audioCtx.state === "suspended") {
        try { await audioCtx.resume(); } catch {}
      }
      resetRun();
      showNewScreen("game");
      running = true;
      nextBeatTimeMs = nowMs() + 900;
      rafId = requestAnimationFrame(step);
    });

    safeOn(layoutNew.btnAchievements, "click", () => {
      renderAchList();
      openNewPanel(layoutNew.achPanel, true);
    });
    safeOn(layoutNew.btnCloseAch, "click", () => openNewPanel(layoutNew.achPanel, false));
    safeOn(layoutNew.btnAchOk, "click", () => openNewPanel(layoutNew.achPanel, false));

    safeOn(layoutNew.btnShop, "click", () => openNewPanel(layoutNew.shopPanel, true));
    safeOn(layoutNew.btnCloseShop, "click", () => openNewPanel(layoutNew.shopPanel, false));
    safeOn(layoutNew.btnShopOk, "click", () => openNewPanel(layoutNew.shopPanel, false));

    // For new layout we don't know your canvas gameplay yet;
    // but at least it won't hang and menus/settings will work.
    updateHUD();
    setHomeStats();
  }

  /********************
   * Boot
   ********************/
  // If you accidentally have mismatched HTML/CSS, at least don't hard-crash:
  try {
    if (mode === "old") initOld();
    else initNew();
  } catch (e) {
    console.error("TapBeat init error:", e);
    // Fallback: show whichever menu exists
    if (layoutOld.menu) showOldScreen("menu");
    if (layoutNew.mainMenu) showNewScreen("menu");
  }

  /********************
   * IMPORTANT: where to tweak leniency (what you asked)
   ********************
   * PERFECT_WINDOW_MS / GREAT_WINDOW_MS at top of game state.
   * Increase GREAT_WINDOW_MS if you still see random MISS while on beat.
   * Example: change GREAT_WINDOW_MS from 175 to 210.
   */
})();