/* =========================
   TapBeat — upgraded
   - slower start (BPM 72 + ramp)
   - correct hit judgement (nearest beat, not only lastBeat)
   - pointer events (mobile reliable)
   - 3 lives + hearts
   - energy system (music + difficulty doesn't reset on 1 miss)
   - anime feedback + fx sprites (CSS)
   - flyby distractions as progress grows
   ========================= */

let score = 0;
let combo = 0;
let coins = 0;
let bpm = 72;
let lvl = 1;

let playing = false;
let vibrationOn = true;
let musicOn = true;

let lives = 3;
let streak = 0;          // keeps “momentum” even if combo breaks a bit
let energy = 0;          // 0..100, decays slowly, miss reduces but not to zero

const intro = document.getElementById("intro");
const menu = document.getElementById("menu");
const game = document.getElementById("game");

const field = document.getElementById("field");
const target = document.getElementById("target");
const feedback = document.getElementById("feedback");
const particles = document.getElementById("particles");
const flash = document.getElementById("flash");
const flybys = document.getElementById("flybys");

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const coinsEl = document.getElementById("coins");
const bpmEl = document.getElementById("bpm");
const lvlEl = document.getElementById("lvl");

const livesEl = document.getElementById("lives");
const energyFill = document.getElementById("energyFill");
const energyPct = document.getElementById("energyPct");
const vibeEl = document.getElementById("vibe");
const streakEl = document.getElementById("streak");

const settings = document.getElementById("settings");
const gear = document.getElementById("gear");
const closeSettings = document.getElementById("closeSettings");
const vibrationToggle = document.getElementById("vibrationToggle");
const musicToggle = document.getElementById("musicToggle");
const volumeSlider = document.getElementById("volume");
const skinsWrap = document.getElementById("skins");

const playBtn = document.getElementById("playBtn");
const openSettingsFromMenu = document.getElementById("openSettingsFromMenu");

// ===== INTRO FLOW =====
setTimeout(() => {
  intro.classList.remove("active");
  menu.classList.add("active");
}, 2600);

// ===== SETTINGS =====
gear.addEventListener("click", (e) => { e.stopPropagation(); openSettings(); });
closeSettings.addEventListener("click", (e) => { e.stopPropagation(); closeSettingsModal(); });
openSettingsFromMenu.addEventListener("click", () => openSettings());
settings.addEventListener("click", (e) => { if (e.target === settings) closeSettingsModal(); });

vibrationToggle.addEventListener("change", (e) => { vibrationOn = e.target.checked; });

musicToggle.addEventListener("change", async (e) => {
  musicOn = e.target.checked;
  if (musicOn) { await ensureAudio(); music.setMuted(false); }
  else { if (music) music.setMuted(true); }
});

volumeSlider.addEventListener("input", () => {
  if (music) music.setVolume(Number(volumeSlider.value) / 100);
});

function openSettings(){ settings.classList.add("active"); }
function closeSettingsModal(){ settings.classList.remove("active"); }

// ===== PLAY BUTTON =====
playBtn.addEventListener("click", async () => {
  menu.classList.remove("active");
  game.classList.add("active");
  await startGame();
});

// ===== SKINS =====
const SKINS = [
  { id:"neonMint", name:"Neon Mint", border:"#2de2e6", glow:"rgba(45,226,230,0.95)", core:"#ff2d86", bg:["#2de2e6","#1b1b3a","#09091a"] },
  { id:"softCandy", name:"Soft Candy", border:"#7cff6b", glow:"rgba(124,255,107,0.85)", core:"#ff7aa2", bg:["#7cff6b","#2de2e6","#1b1b3a"] },
  { id:"sunsetPop", name:"Sunset Pop", border:"#ff2d86", glow:"rgba(255,45,134,0.85)", core:"#ffd166", bg:["#ff2d86","#2de2e6","#09091a"] },
  { id:"iceBlue", name:"Ice Blue", border:"#7aa7ff", glow:"rgba(122,167,255,0.85)", core:"#2de2e6", bg:["#7aa7ff","#1b1b3a","#09091a"] },
  { id:"goldPunch", name:"Gold Punch", border:"#ffd166", glow:"rgba(255,209,102,0.85)", core:"#ff2d86", bg:["#ffd166","#ff2d86","#1b1b3a"] },
  { id:"berryLime", name:"Berry Lime", border:"#b7ff3c", glow:"rgba(183,255,60,0.80)", core:"#8a2be2", bg:["#b7ff3c","#2de2e6","#1b1b3a"] }
];

let currentSkin = "neonMint";

function renderSkins(){
  skinsWrap.innerHTML = "";
  SKINS.forEach(s => {
    const el = document.createElement("div");
    el.className = "skin" + (s.id === currentSkin ? " active" : "");
    const sw = document.createElement("div");
    sw.className = "sw";
    sw.style.background = `linear-gradient(90deg, ${s.border}, ${s.core})`;
    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = s.name;
    el.appendChild(sw);
    el.appendChild(nm);
    el.addEventListener("click", () => { setSkin(s.id); renderSkins(); });
    skinsWrap.appendChild(el);
  });
}

function setSkin(id){
  const s = SKINS.find(x => x.id === id);
  if (!s) return;
  currentSkin = id;
  document.documentElement.style.setProperty("--skinBorder", s.border);
  document.documentElement.style.setProperty("--skinGlow", s.glow);
  document.documentElement.style.setProperty("--skinCore", s.core);
  document.documentElement.style.setProperty("--bg1", s.bg[0]);
  document.documentElement.style.setProperty("--bg2", s.bg[1]);
  document.documentElement.style.setProperty("--bg3", s.bg[2]);
}

renderSkins();
setSkin(currentSkin);

// ===== LIVES UI =====
function renderLives(){
  livesEl.innerHTML = "";
  for (let i=0; i<3; i++){
    const img = document.createElement("img");
    img.className = "heart" + (i < lives ? "" : " off");
    img.alt = "heart";
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <path d="M32 56s-18-10.6-26.3-22.7C-1.8 21.5 6.3 6 20.3 8.2c5 0.8 8.2 4.1 11.7 8 3.5-3.9 6.7-7.2 11.7-8C57.7 6 65.8 21.5 58.3 33.3 50 45.4 32 56 32 56z"
              fill="#ff2d86" stroke="#050616" stroke-width="4" stroke-linejoin="round"/>
        <path d="M20 18c4-6 10-6 12-2" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="4" stroke-linecap="round"/>
      </svg>
    `);
    livesEl.appendChild(img);
  }
}

// ===== MUSIC (WebAudio) =====
let music = null;

async function ensureAudio(){
  if (music) return;
  music = createMusicEngine();
  music.setVolume(Number(volumeSlider.value) / 100);
  if (!musicOn) music.setMuted(true);
  await music.resume();
}

function createMusicEngine(){
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();

  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 18;
  comp.ratio.value = 6;
  comp.attack.value = 0.005;
  comp.release.value = 0.14;
  comp.connect(master);

  let muted = false;
  let volume = 0.7;

  const tick = (t, freq, dur, type, gainVal, detune=0) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gainVal, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    g.connect(comp);

    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const noise = (t, dur, gainVal) => {
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random()*2-1);

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 2500;

    const g = ctx.createGain();
    g.gain.value = gainVal;

    src.connect(bp);
    bp.connect(g);
    g.connect(comp);

    src.start(t);
    src.stop(t + dur);
  };

  function setVolume(v){
    volume = Math.max(0, Math.min(1, v));
    master.gain.value = muted ? 0 : volume;
  }
  function setMuted(m){
    muted = !!m;
    master.gain.value = muted ? 0 : volume;
  }
  async function resume(){
    if (ctx.state !== "running") await ctx.resume();
  }

  // harmonic palette
  const base = 220;
  const scale = [0, 3, 5, 7, 10]; // minor-ish
  let step = 0;

  function scheduleBeat(t, intensity){
    if (muted) return;

    // kick + hat
    tick(t, 60, 0.08, "sine", 0.42);
    tick(t, 48, 0.10, "sine", 0.18);
    if (step % 2 === 1) noise(t, 0.04, 0.09);

    // bass (energy unlock)
    if (intensity >= 2){
      const n = [0,0,3,0,5,0,3,0][step % 8];
      tick(t, base * Math.pow(2, n/12), 0.16, "triangle", 0.20, -6);
    }

    // chords-ish pulse (mid energy)
    if (intensity >= 4 && step % 2 === 0){
      const chord = [0, 7, 10];
      chord.forEach((c, i) => tick(t, base * Math.pow(2, (12 + c)/12), 0.12, "sine", 0.06, i*4));
    }

    // lead (high energy)
    if (intensity >= 6){
      const n = 12 + scale[(step + intensity) % scale.length];
      tick(t, base * Math.pow(2, n/12), 0.11, "square", 0.08);
    }

    // sparkle (drop)
    if (intensity >= 8 && step % 4 === 0){
      const n = 24 + scale[(step/2) % scale.length];
      tick(t, base * Math.pow(2, n/12), 0.08, "sine", 0.08);
    }

    step++;
  }

  return { ctx, resume, scheduleBeat, setVolume, setMuted };
}

// ===== GAME LOOP =====
let pos = { x: 80, y: 260 };
let goal = { x: 80, y: 260 };
let rafId = null;

function lerp(a,b,t){ return a + (b-a)*t; }

function animate(){
  pos.x = lerp(pos.x, goal.x, 0.10);
  pos.y = lerp(pos.y, goal.y, 0.10);
  target.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  rafId = requestAnimationFrame(animate);
}

function randomGoal(){
  const safeTop = 110;
  const safeBottom = 80;
  const safeSides = 16;

  const w = window.innerWidth;
  const h = window.innerHeight;

  const x = Math.random() * (w - 150 - safeSides*2) + safeSides;
  const y = Math.random() * (h - 150 - safeTop - safeBottom) + safeTop;

  goal.x = x;
  goal.y = y;
}

// ===== TIMING: nearest beat =====
let beatTimer = null;
let gameStartPerf = 0;     // performance.now() at game start
let beatIndex = 0;

function getBeatInterval(){ return 60 / bpm; }

function nearestBeatDeltaSec(nowSec){
  // nowSec is relative to game start
  const interval = getBeatInterval();
  const nearest = Math.round(nowSec / interval) * interval;
  return Math.abs(nowSec - nearest);
}

// ===== JUDGEMENT WINDOWS =====
function judgeTap(nowSec){
  // widen slightly so “in time” feels fair on mobile
  const perfectWindow = Math.max(0.075, 0.15 - (bpm-72)*0.0009);
  const greatWindow = perfectWindow + 0.09;

  const d = nearestBeatDeltaSec(nowSec);
  if (d <= perfectWindow) return "perfect";
  if (d <= greatWindow) return "great";
  return "miss";
}

// ===== INPUT (mobile reliable) =====
// Use pointerdown for immediate response (no click delay)
target.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!playing) return;
  const nowSec = (performance.now() - gameStartPerf) / 1000;
  const res = judgeTap(nowSec);
  if (res === "perfect") onHitPerfect();
  else if (res === "great") onHitGreat();
  else onMiss();
}, { passive:false });

field.addEventListener("pointerdown", (e) => {
  // if tap anywhere else -> miss
  if (!playing) return;
  // avoid counting if user actually tapped target but propagation bug
  if (e.target && (e.target.id === "target")) return;
  onMiss();
}, { passive:true });

// ===== EFFECTS =====
function popText(text, color, withFx=true){
  feedback.textContent = text;
  feedback.style.color = color;

  feedback.classList.remove("pop");
  feedback.classList.add("anime");
  feedback.classList.toggle("fx", !!withFx);

  void feedback.offsetWidth;
  feedback.classList.add("pop");
  setTimeout(() => feedback.classList.remove("pop"), 420);
}

function burst(x, y, palette){
  const count = 22;
  for (let i=0; i<count; i++){
    const p = document.createElement("div");
    p.className = "p";
    p.style.background = palette[i % palette.length];
    p.style.left = (x + 75) + "px";
    p.style.top = (y + 75) + "px";
    const dx = (Math.random()*2-1) * (110 + Math.random()*130);
    const dy = (Math.random()*2-1) * (110 + Math.random()*130);
    p.style.setProperty("--dx", dx + "px");
    p.style.setProperty("--dy", dy + "px");
    particles.appendChild(p);
    setTimeout(() => p.remove(), 560);
  }
}

function screenFlash(){
  flash.classList.remove("on");
  void flash.offsetWidth;
  flash.classList.add("on");
}

function vibe(ms){
  if (!vibrationOn) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ===== PROGRESSION =====
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

function energyToIntensity(){
  // 1..8
  if (energy >= 85) return 8;
  if (energy >= 70) return 7;
  if (energy >= 55) return 6;
  if (energy >= 40) return 5;
  if (energy >= 28) return 4;
  if (energy >= 18) return 3;
  if (energy >= 10) return 2;
  return 1;
}

function updateVibe(){
  if (energy >= 85) vibeEl.textContent = "DROP";
  else if (energy >= 55) vibeEl.textContent = "Chorus";
  else vibeEl.textContent = "Verse";
}

function recalcLevel(){
  lvl = 1 + Math.floor(score / 2500);
}

function updateDifficulty(){
  // BPM increases with energy + level, but starts slow
  const base = 72;
  const targetBpm = base + (energy * 0.55) + (lvl * 1.2);
  bpm = lerp(bpm, clamp(targetBpm, 72, 160), 0.12);
}

function updateUI(){
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  coinsEl.textContent = coins;
  bpmEl.textContent = Math.round(bpm);
  lvlEl.textContent = lvl;

  energyFill.style.width = `${Math.round(energy)}%`;
  energyPct.textContent = Math.round(energy);
  streakEl.textContent = streak;

  updateVibe();
  renderLives();
}

// ===== BEAT LOOP =====
function beatTick(){
  if (!playing) return;

  beatIndex++;
  target.classList.add("pulse");
  setTimeout(() => target.classList.remove("pulse"), 180);

  randomGoal();

  // schedule audio slightly ahead
  if (music && musicOn){
    const t = music.ctx.currentTime + 0.02;
    music.scheduleBeat(t, energyToIntensity());
  }

  // flyby distractions appear as you get stronger
  maybeFlyby();

  updateDifficulty();
  updateUI();

  clearTimeout(beatTimer);
  beatTimer = setTimeout(beatTick, (60 / bpm) * 1000);
}

// ===== LIVES & MISS POLICY =====
function loseLife(){
  lives = Math.max(0, lives - 1);
  if (lives <= 0){
    endRun();
  }
}

function endRun(){
  playing = false;
  clearTimeout(beatTimer);
  popText("GAME OVER", "#ffd166", false);

  // back to menu after a moment
  setTimeout(() => {
    game.classList.remove("active");
    menu.classList.add("active");
  }, 1300);
}

// ===== HIT HANDLERS =====
function onHitPerfect(){
  vibe(26);

  combo += 1;
  streak += 1;

  // score + energy
  score += 130 + Math.min(220, combo * 2.2);
  energy = clamp(energy + 4.0, 0, 100);

  // coins
  if (streak % 6 === 0) coins += 1;

  recalcLevel();
  updateDifficulty();

  popText("PERFECT!", "var(--perfect)", true);
  burst(goal.x, goal.y, ["#7cff6b","#2de2e6","#ffd166","#ff2d86"]);
  if (streak % 10 === 0) screenFlash();

  updateUI();
}

function onHitGreat(){
  vibe(16);

  combo += 1;
  streak += 1;

  score += 80 + Math.min(140, combo * 1.6);
  energy = clamp(energy + 2.5, 0, 100);

  if (streak % 10 === 0) coins += 1;

  recalcLevel();
  updateDifficulty();

  popText("GREAT!", "var(--good)", true);
  burst(goal.x, goal.y, ["#2de2e6","#7aa7ff","#ffd166"]);

  updateUI();
}

function onMiss(){
  vibe(10);

  // IMPORTANT: do NOT reset everything to zero.
  // - combo breaks
  // - energy drops but not to zero
  combo = 0;
  streak = Math.max(0, streak - 3);
  energy = clamp(energy - 14, 0, 100);

  popText("MISS!", "var(--miss)", true);
  burst(goal.x, goal.y, ["#ff2d86","#ff2d86","#2de2e6"]);

  loseLife();
  updateDifficulty();
  updateUI();
}

// ===== PASSIVE ENERGY DECAY (so music breathes) =====
let decayTimer = null;
function startDecay(){
  clearInterval(decayTimer);
  decayTimer = setInterval(() => {
    if (!playing) return;
    // gentle decay; less decay at high energy so it feels rewarding
    const d = (energy >= 70) ? 0.20 : 0.35;
    energy = clamp(energy - d, 0, 100);
    updateDifficulty();
    updateUI();
  }, 250);
}

// ===== FLYBYS =====
function maybeFlyby(){
  // more flybys when energy/level grows
  const chance = (energy / 100) * 0.35 + (lvl * 0.02); // 0..~
  if (Math.random() < chance){
    const el = document.createElement("div");
    el.className = "fly";
    el.style.top = `${Math.random()*60 + 10}vh`;
    el.style.left = `-20vw`;
    el.style.opacity = `${0.55 + Math.random()*0.35}`;
    el.style.transform = `rotate(${(Math.random()*16-8)}deg)`;
    flybys.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
}

// ===== START =====
async function startGame(){
  playing = true;

  await ensureAudio();

  // reset run
  score = 0;
  combo = 0;
  coins = 0;
  bpm = 72;
  lvl = 1;

  lives = 3;
  streak = 0;
  energy = 6; // start with a tiny bit so music feels alive

  updateUI();

  // position
  pos.x = 60;
  pos.y = 260;
  goal.x = 60;
  goal.y = 260;

  if (!rafId) animate();

  // start timebase
  gameStartPerf = performance.now();
  beatIndex = 0;

  // slower start: give player a tiny “ready” gap
  popText("READY!", "#ffd166", false);
  setTimeout(() => popText("GO!", "#7cff6b", false), 520);

  clearTimeout(beatTimer);
  setTimeout(() => {
    beatTick();
    startDecay();
  }, 900);
}

// smooth on resize
window.addEventListener("resize", () => {
  randomGoal();
});