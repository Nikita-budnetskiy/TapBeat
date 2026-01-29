/* =========================
   TapBeat — "color & fun" build
   - full-screen playfield
   - target glides smoothly
   - must tap inside circle
   - bigger timing window
   - combo + streak + energy
   - 3 lives (hearts)
   - settings modal (music/vibration/skins)
   - achievements + save to localStorage
   - particles background + flyby distractions
   - WebAudio synth music (no external files)
   ========================= */

const $ = (id) => document.getElementById(id);

// Screens
const intro = $("intro");
const menu = $("menu");
const game = $("game");

// UI elements
const playBtn = $("playBtn");
const settingsBtn = $("settingsBtn");
const gearBtn = $("gearBtn");
const modal = $("modal");
const closeModal = $("closeModal");
const musicToggle = $("musicToggle");
const vibeToggle = $("vibeToggle");
const achList = $("achList");

const scoreEl = $("score");
const comboEl = $("combo");
const coinsEl = $("coins");
const bpmEl = $("bpm");
const lvlEl = $("lvl");
const heartsEl = $("hearts");
const vibeEl = $("vibe");
const energyFill = $("energyFill");
const energyPct = $("energyPct");
const streakEl = $("streak");

const field = $("field");
const targetEl = $("target");
const feedbackEl = $("feedback");
const particlesCanvas = $("particles");
const flashEl = $("flash");
const flybys = $("flybys");

// ------------------------
// Game state
// ------------------------
let playing = false;

let score = 0;
let combo = 0;
let coins = 0;
let bpm = 72;            // start slower
let lvl = 1;
let energy = 0;          // 0..100
let streak = 0;

let lives = 3;

let vibrationOn = true;
let musicOn = true;

let startedAt = 0;
let lastBeatTime = 0;
let beatInterval = 60000 / bpm;

let beatCount = 0;

// Timing windows (bigger = easier)
let HIT_WINDOW_MS = 180;       // overall ok window (±180ms)
let PERFECT_WINDOW_MS = 70;    // tight window

// Target movement (glide)
let target = {
  x: 0.5,
  y: 0.58,
  px: 0.5,
  py: 0.58,
  tx: 0.5,
  ty: 0.58,
  radiusPx: 90
};

// Animation
let raf = 0;

// ------------------------
// Achievements
// ------------------------
const ACH = [
  { id:"firstHit", name:"First Tap", desc:"Land your first hit.", test: () => score > 0 },
  { id:"firstPerfect", name:"Perfect!", desc:"Get your first PERFECT.", test: () => stats.perfects >= 1 },
  { id:"combo10", name:"Combo x10", desc:"Reach combo 10.", test: () => stats.maxCombo >= 10 },
  { id:"combo25", name:"Combo x25", desc:"Reach combo 25.", test: () => stats.maxCombo >= 25 },
  { id:"survive60", name:"One Minute", desc:"Survive 60 seconds in a run.", test: () => stats.bestTime >= 60 },
  { id:"coins100", name:"Collector", desc:"Collect 100 coins total.", test: () => stats.totalCoins >= 100 },
];

let unlocked = loadJSON("tapbeat_ach", {});
let stats = loadJSON("tapbeat_stats", {
  perfects: 0,
  greats: 0,
  misses: 0,
  maxCombo: 0,
  bestTime: 0,
  totalCoins: 0,
});

// ------------------------
// Music (WebAudio)
// ------------------------
let audioCtx = null;
let master = null;
let synth = {
  kick: null,
  hat: null,
  chord: null
};
let audioReady = false;
let nextNoteTime = 0;
let schedulerTimer = 0;

function ensureAudio(){
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  master = audioCtx.createGain();
  master.gain.value = 0.55;
  master.connect(audioCtx.destination);
  audioReady = true;
}

function beepKick(time, intensity=1){
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(120, time);
  o.frequency.exponentialRampToValueAtTime(50, time + 0.06);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.6 * intensity, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
  o.connect(g);
  g.connect(master);
  o.start(time);
  o.stop(time + 0.11);
}

function beepHat(time, intensity=1){
  const b = audioCtx.createBufferSource();
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.03, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.exp(-i/900);
  b.buffer = buffer;

  const f = audioCtx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 6000;

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.22 * intensity, time + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);

  b.connect(f); f.connect(g); g.connect(master);
  b.start(time);
  b.stop(time + 0.035);
}

function chordPad(time, vibeLevel){
  // simple triad pad, richer as energy grows
  const base = 220 * (vibeLevel >= 2 ? 1.122 : 1.0); // A -> Bb-ish
  const freqs = vibeLevel >= 3 ? [base, base*1.26, base*1.5, base*2] : [base, base*1.26, base*1.5];

  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(0.12, time + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);
  g.connect(master);

  freqs.forEach((fq, idx)=>{
    const o = audioCtx.createOscillator();
    o.type = idx===0 ? "triangle" : "sine";
    o.frequency.setValueAtTime(fq, time);
    o.detune.setValueAtTime((Math.random()*8-4), time);
    o.connect(g);
    o.start(time);
    o.stop(time + 0.5);
  });
}

function scheduleAudio(){
  if (!audioCtx || !musicOn) return;

  const lookahead = 0.12; // seconds
  while (nextNoteTime < audioCtx.currentTime + lookahead){
    // beat subdivision
    const beatPos = (beatCount % 4);
    const intensity = 0.9 + Math.min(energy/100, 1)*0.4;

    // kick on 1 & 3
    if (beatPos === 0 || beatPos === 2) beepKick(nextNoteTime, intensity);

    // hats: more as energy grows
    beepHat(nextNoteTime + (beatInterval/1000)*0.5, 0.8 + intensity*0.4);

    // chords: appear more when energy is higher (vibe progression)
    const v = getVibe();
    if (beatPos === 0 && v >= 2) chordPad(nextNoteTime, v);

    nextNoteTime += beatInterval/1000;
    beatCount++;
  }
}

function startMusic(){
  ensureAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();
  nextNoteTime = audioCtx.currentTime + 0.05;
  clearInterval(schedulerTimer);
  schedulerTimer = setInterval(scheduleAudio, 40);
}
function stopMusic(){
  clearInterval(schedulerTimer);
  schedulerTimer = 0;
}

// ------------------------
// Particles background
// ------------------------
const P = { w:0, h:0, stars:[] };

function resize(){
  // full-screen canvas
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  particlesCanvas.width = Math.floor(window.innerWidth * dpr);
  particlesCanvas.height = Math.floor(window.innerHeight * dpr);
  particlesCanvas.style.width = "100%";
  particlesCanvas.style.height = "100%";
  P.w = particlesCanvas.width;
  P.h = particlesCanvas.height;
  P.dpr = dpr;

  // field height should be truly tall
  // keep it filling remaining space naturally; CSS has fallback
  updateTargetRadius();
}
window.addEventListener("resize", resize);

function initStars(){
  P.stars = [];
  const count = 120;
  for (let i=0;i<count;i++){
    P.stars.push({
      x: Math.random()*P.w,
      y: Math.random()*P.h,
      r: (Math.random()*1.6+0.6) * P.dpr,
      vx: (Math.random()*0.12+0.02) * P.dpr,
      vy: (Math.random()*0.10+0.02) * P.dpr,
      a: Math.random()*0.55+0.25,
      c: ["rgba(255,255,255,0.9)","rgba(68,255,210,0.9)","rgba(76,198,255,0.9)","rgba(255,74,160,0.9)"][Math.floor(Math.random()*4)]
    });
  }
}

function drawStars(){
  const ctx = particlesCanvas.getContext("2d");
  ctx.clearRect(0,0,P.w,P.h);

  // subtle bokeh rings
  for (let i=0;i<6;i++){
    const x = (0.15 + Math.random()*0.7) * P.w;
    const y = (0.15 + Math.random()*0.7) * P.h;
    const rr = (120 + Math.random()*260) * P.dpr;
    ctx.beginPath();
    ctx.arc(x,y,rr,0,Math.PI*2);
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random()*0.02})`;
    ctx.lineWidth = 2*P.dpr;
    ctx.stroke();
  }

  // stars/confetti
  for (const s of P.stars){
    s.x += s.vx; s.y += s.vy;
    if (s.x > P.w+40) s.x = -40;
    if (s.y > P.h+40) s.y = -40;

    ctx.globalAlpha = s.a;
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------
// Helpers
// ------------------------
function showScreen(el){
  [intro, menu, game].forEach(s => s.classList.remove("show"));
  el.classList.add("show");
}

function setModal(open){
  if (open){
    modal.classList.add("show");
    modal.setAttribute("aria-hidden","false");
  } else {
    modal.classList.remove("show");
    modal.setAttribute("aria-hidden","true");
  }
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  }catch(e){ return fallback; }
}
function saveJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){}
}

function haptic(ms=18){
  if (!vibrationOn) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ------------------------
// UI update
// ------------------------
function renderHearts(){
  heartsEl.innerHTML = "";
  for (let i=0;i<3;i++){
    const d = document.createElement("div");
    d.className = "heart" + (i < lives ? "" : " off");
    heartsEl.appendChild(d);
  }
}

function setFeedback(text, kind){
  feedbackEl.className = "feedback show " + kind;
  feedbackEl.textContent = text;
  setTimeout(()=> feedbackEl.className = "feedback", 240);
}

function flash(){
  flashEl.classList.add("on");
  setTimeout(()=> flashEl.classList.remove("on"), 90);
}

function updateHUD(){
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  coinsEl.textContent = coins;
  bpmEl.textContent = Math.round(bpm);
  lvlEl.textContent = lvl;
  streakEl.textContent = streak;

  const e = clamp(energy,0,100);
  energyFill.style.width = e + "%";
  energyPct.textContent = Math.round(e) + "%";

  // vibe label
  const v = getVibe();
  vibeEl.textContent = v === 1 ? "Verse" : v === 2 ? "Build" : v === 3 ? "Chorus" : "Drop";
}

function getVibe(){
  if (energy < 20) return 1;
  if (energy < 45) return 2;
  if (energy < 75) return 3;
  return 4;
}

function updateTargetRadius(){
  // based on actual element size
  const rect = targetEl.getBoundingClientRect();
  target.radiusPx = rect.width * 0.5;
}

// ------------------------
// Movement + timing
// ------------------------
function newTargetDestination(){
  // keep away from edges + HUD
  const padX = 0.16;
  const padTop = 0.18;     // avoid top HUD
  const padBottom = 0.18;  // avoid bottom HUD

  target.tx = padX + Math.random()*(1 - padX*2);
  target.ty = padTop + Math.random()*(1 - padTop - padBottom);

  // slightly bias towards center early
  if (lvl === 1 && beatCount < 12){
    target.tx = 0.45 + (Math.random()*0.2);
    target.ty = 0.52 + (Math.random()*0.2);
  }
}

function tickBeat(nowMs){
  // move target each beat (destination changes), but actual movement is smoothed in RAF
  newTargetDestination();

  // difficulty ramp: bpm goes up slowly with streak/energy/time
  const t = (nowMs - startedAt) / 1000;
  const ramp = Math.min(1, t / 70);
  const vibeBoost = getVibe() - 1; // 0..3
  bpm = 72 + (38*ramp) + (vibeBoost*6) + Math.min(streak*0.35, 10);
  beatInterval = 60000 / bpm;

  // level changes
  lvl = 1 + Math.floor((energy + t*0.25) / 25);
  lvl = clamp(lvl, 1, 9);

  // occasional flyby distractions as level grows
  if (lvl >= 3 && Math.random() < 0.10 + (lvl-3)*0.02){
    spawnFlyby();
  }
}

function spawnFlyby(){
  const d = document.createElement("div");
  d.className = "fly";
  d.style.setProperty("--y", `${Math.round(40 + Math.random()*(field.clientHeight-120))}px`);
  d.style.top = "0px"; // real Y via transform variable
  flybys.appendChild(d);
  setTimeout(()=> d.remove(), 1200);
}

// nearest beat time (for judgement)
function nearestBeatDeltaMs(nowMs){
  // lastBeatTime is updated; we want nearest beat around now:
  const dt = nowMs - lastBeatTime;
  const mod = dt % beatInterval;
  const prev = mod;
  const next = beatInterval - mod;
  // delta to nearest beat (negative means we are after beat by prev ms, positive means before next beat)
  if (prev <= next) return -prev;
  return next;
}

// ------------------------
// Hit detection (must tap inside circle)
// ------------------------
function tapToFieldCoords(clientX, clientY){
  const r = field.getBoundingClientRect();
  const x = clientX - r.left;
  const y = clientY - r.top;
  return { x, y, w: r.width, h: r.height };
}

function isInsideTarget(px, py){
  // target center in field pixels
  const cx = target.x * field.clientWidth;
  const cy = target.y * field.clientHeight;
  const dx = px - cx;
  const dy = py - cy;
  const dist = Math.hypot(dx, dy);
  return dist <= target.radiusPx; // WHOLE CIRCLE counts (as you asked)
}

function onTap(ev){
  if (!playing) return;

  const p = ("changedTouches" in ev) ? ev.changedTouches[0] : ev;
  const { x, y } = tapToFieldCoords(p.clientX, p.clientY);

  // must tap inside
  if (!isInsideTarget(x, y)){
    registerMiss("OUT");
    return;
  }

  const nowMs = performance.now();
  const delta = Math.abs(nearestBeatDeltaMs(nowMs));

  // Timing judgement
  if (delta <= PERFECT_WINDOW_MS){
    registerHit("PERFECT", delta);
  } else if (delta <= HIT_WINDOW_MS){
    registerHit("GREAT", delta);
  } else {
    registerMiss("LATE");
  }
}

function registerHit(kind){
  haptic(14);
  flash();

  combo += 1;
  streak += 1;

  // scoring
  const base = kind === "PERFECT" ? 120 : 80;
  const mult = 1 + Math.min(combo, 40) * 0.03;
  score += Math.round(base * mult);

  // coins
  const coinGain = kind === "PERFECT" ? 2 : 1;
  coins += coinGain;
  stats.totalCoins += coinGain;

  // energy grows; perfect gives more
  energy += (kind === "PERFECT") ? 6 : 4;
  energy = clamp(energy, 0, 100);

  // feedback
  if (kind === "PERFECT"){
    stats.perfects += 1;
    setFeedback("PERFECT!", "fbPerfect");
  } else {
    stats.greats += 1;
    setFeedback("GREAT!", "fbGreat");
  }

  // update max combo
  stats.maxCombo = Math.max(stats.maxCombo, combo);

  updateHUD();
  checkAchievements();
}

function registerMiss(reason){
  stats.misses += 1;

  // combo breaks, but streak/energy/lives give player room
  combo = 0;
  streak = Math.max(0, streak - 2);
  energy = Math.max(0, energy - 12);

  lives -= 1;
  renderHearts();

  setFeedback("MISS!", "fbMiss");
  haptic(25);

  updateHUD();
  checkAchievements();

  if (lives <= 0){
    endRun();
  }
}

// ------------------------
// Run lifecycle
// ------------------------
function resetRun(){
  score = 0;
  combo = 0;
  coins = 0;
  bpm = 72;
  lvl = 1;
  energy = 0;
  streak = 0;
  lives = 3;

  beatCount = 0;
  beatInterval = 60000 / bpm;

  target.x = 0.5; target.y = 0.58;
  target.px = target.x; target.py = target.y;
  target.tx = target.x; target.ty = target.y;

  renderHearts();
  updateHUD();
}

function startRun(){
  resetRun();

  playing = true;
  showScreen(game);

  startedAt = performance.now();
  lastBeatTime = startedAt;
  newTargetDestination();

  // audio must be started by user gesture; Play button qualifies
  if (musicOn){
    startMusic();
  }

  // pointer handlers
  field.addEventListener("pointerdown", onTap, { passive:true });
  field.addEventListener("touchstart", onTap, { passive:true });

  // start loop
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function endRun(){
  playing = false;

  // clean listeners
  field.removeEventListener("pointerdown", onTap);
  field.removeEventListener("touchstart", onTap);

  stopMusic();

  // update best time
  const t = (performance.now() - startedAt) / 1000;
  stats.bestTime = Math.max(stats.bestTime, Math.floor(t));
  saveJSON("tapbeat_stats", stats);
  saveJSON("tapbeat_ach", unlocked);

  // simple back to menu
  setTimeout(()=>{
    showScreen(menu);
  }, 450);
}

// ------------------------
// Animation loop
// ------------------------
function loop(now){
  if (!playing) return;

  // beat tick (based on time, not frames)
  const dt = now - lastBeatTime;
  if (dt >= beatInterval){
    // catch up if lag
    const steps = Math.floor(dt / beatInterval);
    lastBeatTime += steps * beatInterval;
    tickBeat(now);
  }

  // smooth target glide to new destination
  const glide = 0.08 + Math.min(energy/100, 1)*0.07; // more energy = snappier
  target.px += (target.tx - target.px) * glide;
  target.py += (target.ty - target.py) * glide;

  target.x = target.px;
  target.y = target.py;

  // apply position
  const left = target.x * field.clientWidth;
  const top  = target.y * field.clientHeight;
  targetEl.style.left = left + "px";
  targetEl.style.top  = top + "px";

  // energy decay (slow)
  energy = Math.max(0, energy - 0.018);
  updateHUD();

  // draw particles bg
  drawStars();

  // achievements time
  const t = (now - startedAt) / 1000;
  stats.bestTime = Math.max(stats.bestTime, Math.floor(t));

  raf = requestAnimationFrame(loop);
}

// ------------------------
// Achievements UI + unlock
// ------------------------
function checkAchievements(){
  let changed = false;
  for (const a of ACH){
    if (!unlocked[a.id] && a.test()){
      unlocked[a.id] = true;
      changed = true;
      // little reward
      coins += 25;
      stats.totalCoins += 25;
      setFeedback("ACHIEVED!", "fbGreat");
      flash();
    }
  }
  if (changed){
    saveJSON("tapbeat_ach", unlocked);
    saveJSON("tapbeat_stats", stats);
    renderAchievements();
    updateHUD();
  }
}

function renderAchievements(){
  achList.innerHTML = "";
  for (const a of ACH){
    const div = document.createElement("div");
    const isOn = !!unlocked[a.id];
    div.className = "ach" + (isOn ? " unlocked" : "");
    div.innerHTML = `
      <div class="achTop">
        <div class="achName">${a.name}</div>
        <div class="achState">${isOn ? "UNLOCKED ✓" : "LOCKED"}</div>
      </div>
      <div class="achDesc">${a.desc}</div>
    `;
    achList.appendChild(div);
  }
}

// ------------------------
// Settings (skins + toggles)
// ------------------------
function applySkin(name){
  const all = ["aurora","candy","sky","lava","mint"];
  all.forEach(s => targetEl.classList.remove("skin-"+s));
  targetEl.classList.add("skin-"+name);

  document.querySelectorAll(".skinBtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.skin === name);
  });

  saveJSON("tapbeat_skin", { skin:name });
}

function loadSkin(){
  const saved = loadJSON("tapbeat_skin", { skin:"aurora" });
  applySkin(saved.skin || "aurora");
}

function wireSettings(){
  gearBtn.addEventListener("click", ()=> setModal(true));
  settingsBtn.addEventListener("click", ()=> setModal(true));
  closeModal.addEventListener("click", ()=> setModal(false));
  modal.addEventListener("click", (e)=> {
    if (e.target === modal) setModal(false);
  });

  musicToggle.addEventListener("change", ()=>{
    musicOn = musicToggle.checked;
    if (!musicOn) stopMusic();
    if (musicOn && playing) startMusic();
  });

  vibeToggle.addEventListener("change", ()=>{
    vibrationOn = vibeToggle.checked;
  });

  document.querySelectorAll(".skinBtn").forEach(btn=>{
    btn.addEventListener("click", ()=> applySkin(btn.dataset.skin));
  });
}

// ------------------------
// Boot
// ------------------------
function boot(){
  resize();
  initStars();
  renderHearts();
  renderAchievements();
  loadSkin();
  wireSettings();

  // Intro → Menu
  showScreen(intro);
  setTimeout(()=> showScreen(menu), 1400);

  playBtn.addEventListener("click", ()=>{
    // audio requires gesture; do it here
    if (musicOn) startMusic();
    startRun();
  });

  // defaults
  musicOn = musicToggle.checked;
  vibrationOn = vibeToggle.checked;

  // update radius after first paint
  setTimeout(updateTargetRadius, 120);
}
boot();