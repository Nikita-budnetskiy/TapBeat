/* =========================
   TapBeat — full working JS
   - fixed HUD/settings click (z-index + pointer-events)
   - WebAudio music (beat + bass + lead layers)
   - combo effects + particles + flash
   - skins selectable + try all
   - smooth sliding target (lerp each frame)
   ========================= */

let score = 0;
let combo = 0;
let coins = 0;
let bpm = 90;
let lvl = 1;

let playing = false;
let vibrationOn = true;
let musicOn = true;

let beatInterval = 60 / bpm;
let nextBeatTime = 0;
let lastBeatTime = 0;

const intro = document.getElementById("intro");
const menu = document.getElementById("menu");
const game = document.getElementById("game");

const field = document.getElementById("field");
const target = document.getElementById("target");
const feedback = document.getElementById("feedback");
const particles = document.getElementById("particles");
const flash = document.getElementById("flash");

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const coinsEl = document.getElementById("coins");
const bpmEl = document.getElementById("bpm");
const lvlEl = document.getElementById("lvl");

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
gear.addEventListener("click", (e) => {
  e.stopPropagation();
  openSettings();
});

closeSettings.addEventListener("click", (e) => {
  e.stopPropagation();
  closeSettingsModal();
});

openSettingsFromMenu.addEventListener("click", () => {
  openSettings();
});

settings.addEventListener("click", (e) => {
  // click outside modal-card closes
  if (e.target === settings) closeSettingsModal();
});

vibrationToggle.addEventListener("change", (e) => {
  vibrationOn = e.target.checked;
});

musicToggle.addEventListener("change", async (e) => {
  musicOn = e.target.checked;
  if (musicOn) {
    await ensureAudio();
    music.setMuted(false);
  } else {
    music.setMuted(true);
  }
});

volumeSlider.addEventListener("input", () => {
  if (music) music.setVolume(Number(volumeSlider.value) / 100);
});

function openSettings(){
  settings.classList.add("active");
}
function closeSettingsModal(){
  settings.classList.remove("active");
}

// ===== PLAY BUTTON =====
playBtn.addEventListener("click", async () => {
  menu.classList.remove("active");
  game.classList.add("active");
  await startGame();
});

// ===== SKINS =====
const SKINS = [
  {
    id:"neonMint",
    name:"Neon Mint",
    border:"#2de2e6",
    glow:"rgba(45,226,230,0.95)",
    core:"#ff2d86",
    bg:["#2de2e6","#1b1b3a","#09091a"]
  },
  {
    id:"softCandy",
    name:"Soft Candy",
    border:"#7cff6b",
    glow:"rgba(124,255,107,0.85)",
    core:"#ff7aa2",
    bg:["#7cff6b","#2de2e6","#1b1b3a"]
  },
  {
    id:"sunsetPop",
    name:"Sunset Pop",
    border:"#ff2d86",
    glow:"rgba(255,45,134,0.85)",
    core:"#ffd166",
    bg:["#ff2d86","#2de2e6","#09091a"]
  },
  {
    id:"iceBlue",
    name:"Ice Blue",
    border:"#7aa7ff",
    glow:"rgba(122,167,255,0.85)",
    core:"#2de2e6",
    bg:["#7aa7ff","#1b1b3a","#09091a"]
  },
  {
    id:"goldPunch",
    name:"Gold Punch",
    border:"#ffd166",
    glow:"rgba(255,209,102,0.85)",
    core:"#ff2d86",
    bg:["#ffd166","#ff2d86","#1b1b3a"]
  },
  {
    id:"berryLime",
    name:"Berry Lime",
    border:"#b7ff3c",
    glow:"rgba(183,255,60,0.80)",
    core:"#8a2be2",
    bg:["#b7ff3c","#2de2e6","#1b1b3a"]
  }
];

let currentSkin = "neonMint";

function renderSkins(){
  skinsWrap.innerHTML = "";
  SKINS.forEach(s => {
    const el = document.createElement("div");
    el.className = "skin" + (s.id === currentSkin ? " active" : "");
    el.dataset.id = s.id;

    const sw = document.createElement("div");
    sw.className = "sw";
    sw.style.background = `linear-gradient(90deg, ${s.border}, ${s.core})`;

    const nm = document.createElement("div");
    nm.className = "nm";
    nm.textContent = s.name;

    el.appendChild(sw);
    el.appendChild(nm);
    el.addEventListener("click", () => {
      setSkin(s.id);
      renderSkins();
    });

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

  // also update background vibe
  document.documentElement.style.setProperty("--bg1", s.bg[0]);
  document.documentElement.style.setProperty("--bg2", s.bg[1]);
  document.documentElement.style.setProperty("--bg3", s.bg[2]);
}

// init skins UI now
renderSkins();
setSkin(currentSkin);

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
  comp.knee.value = 20;
  comp.ratio.value = 6;
  comp.attack.value = 0.005;
  comp.release.value = 0.12;
  comp.connect(master);

  let muted = false;

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

  let volume = 0.7;

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

  // patterns (simple but dynamic)
  const scale = [0, 3, 5, 7, 10]; // minor pentatonic-ish
  const base = 220;

  function scheduleBeat(t, step, intensity){
    if (muted) return;

    // kick-ish
    tick(t, 60, 0.08, "sine", 0.40);
    tick(t, 48, 0.10, "sine", 0.18);

    // hat
    if (step % 2 === 1) noise(t, 0.04, 0.08);

    // bass layer (unlocks with intensity)
    if (intensity >= 2){
      const n = [0,0,3,0,5,0,3,0][step % 8];
      tick(t, base * Math.pow(2, n/12), 0.14, "triangle", 0.18, -5);
    }

    // lead layer (unlocks with intensity)
    if (intensity >= 4){
      const n = scale[(step + intensity) % scale.length] + 12;
      tick(t, base * Math.pow(2, n/12), 0.12, "square", 0.08);
    }

    // sparkle (high combo)
    if (intensity >= 7 && step % 4 === 0){
      const n = 24 + scale[(step/2) % scale.length];
      tick(t, base * Math.pow(2, n/12), 0.08, "sine", 0.07);
    }
  }

  return { ctx, resume, scheduleBeat, setVolume, setMuted };
}

// ===== GAME LOOP (smooth movement) =====
let pos = { x: 100, y: 200 };
let goal = { x: 100, y: 200 };
let rafId = null;

function lerp(a,b,t){ return a + (b-a)*t; }

function animate(){
  // smooth slide
  pos.x = lerp(pos.x, goal.x, 0.10);
  pos.y = lerp(pos.y, goal.y, 0.10);

  target.style.transform = `translate(${pos.x}px, ${pos.y}px)`;

  rafId = requestAnimationFrame(animate);
}

function randomGoal(){
  const safeTop = 120; // keep under HUD
  const safeBottom = 40;
  const safeSides = 20;
  const w = window.innerWidth;
  const h = window.innerHeight;

  const x = Math.random() * (w - 140 - safeSides*2) + safeSides;
  const y = Math.random() * (h - 140 - safeTop - safeBottom) + safeTop;

  goal.x = x;
  goal.y = y;
}

// ===== HIT JUDGEMENT =====
// taps are judged vs beat timing
function judgeTap(){
  const now = performance.now() / 1000; // seconds
  const delta = Math.abs(now - lastBeatTime);

  // windows depend on bpm a bit
  const perfectWindow = Math.max(0.06, 0.16 - (bpm-90)*0.0012);
  const greatWindow = perfectWindow + 0.08;

  if (delta <= perfectWindow) return "perfect";
  if (delta <= greatWindow) return "great";
  return "miss";
}

// tap only counts on target
target.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!playing) return;

  const res = judgeTap();
  if (res === "perfect") onHitPerfect();
  else if (res === "great") onHitGreat();
  else onMiss();
});

// tapping elsewhere => miss
field.addEventListener("click", () => {
  if (!playing) return;
  onMiss();
});

// ===== EFFECTS =====
function popText(text, color){
  feedback.textContent = text;
  feedback.style.color = color;
  feedback.classList.remove("pop");
  // reflow to restart animation
  void feedback.offsetWidth;
  feedback.classList.add("pop");
  setTimeout(() => feedback.classList.remove("pop"), 420);
}

function burst(x, y, palette){
  const count = 18;
  for (let i=0; i<count; i++){
    const p = document.createElement("div");
    p.className = "p";
    const c = palette[i % palette.length];
    p.style.background = c;
    p.style.left = (x + 70) + "px";
    p.style.top = (y + 70) + "px";
    const dx = (Math.random()*2-1) * (90 + Math.random()*120);
    const dy = (Math.random()*2-1) * (90 + Math.random()*120);
    p.style.setProperty("--dx", dx + "px");
    p.style.setProperty("--dy", dy + "px");
    particles.appendChild(p);
    setTimeout(() => p.remove(), 520);
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

// ===== SCORE / PROGRESSION =====
function updateUI(){
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  coinsEl.textContent = coins;
  bpmEl.textContent = Math.round(bpm);
  lvlEl.textContent = lvl;
}

function recalcLevel(){
  // simple level up by score
  lvl = 1 + Math.floor(score / 2000);
}

function updateDifficulty(){
  // BPM grows with combo but capped
  const targetBpm = 90 + Math.min(65, combo * 0.7 + lvl * 1.2);
  bpm = lerp(bpm, targetBpm, 0.20);
  beatInterval = 60 / bpm;
}

function musicIntensity(){
  // 0..8
  if (combo >= 60) return 8;
  if (combo >= 40) return 7;
  if (combo >= 25) return 6;
  if (combo >= 16) return 5;
  if (combo >= 10) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

// ===== BEAT SCHEDULER =====
let beatStep = 0;
let beatTimer = null;

function beatTick(){
  if (!playing) return;

  // beat moment in "performance time"
  lastBeatTime = performance.now() / 1000;

  // pulse + move
  target.classList.add("pulse");
  setTimeout(() => target.classList.remove("pulse"), 180);
  randomGoal();

  // schedule audio slightly ahead using AudioContext time
  if (music && musicOn){
    const t = music.ctx.currentTime + 0.02;
    music.scheduleBeat(t, beatStep++, musicIntensity());
  }

  updateDifficulty();

  // schedule next beat using current bpm
  clearTimeout(beatTimer);
  beatTimer = setTimeout(beatTick, (60 / bpm) * 1000);
}

// ===== HIT HANDLERS =====
function onHitPerfect(){
  vibe(28);

  combo += 1;
  score += 120 + Math.min(180, combo * 2);
  coins += (combo % 5 === 0) ? 1 : 0;

  recalcLevel();
  updateDifficulty();

  popText("PERFECT!", "var(--perfect)");
  burst(goal.x, goal.y, ["#7cff6b","#2de2e6","#ffd166","#ff2d86"]);

  if (combo % 8 === 0) screenFlash();

  updateUI();
}

function onHitGreat(){
  vibe(18);

  combo += 1;
  score += 70 + Math.min(110, combo * 1.2);
  coins += (combo % 9 === 0) ? 1 : 0;

  recalcLevel();
  updateDifficulty();

  popText("GREAT!", "var(--good)");
  burst(goal.x, goal.y, ["#2de2e6","#7aa7ff","#ffd166"]);

  updateUI();
}

function onMiss(){
  vibe(8);

  combo = 0;
  popText("MISS!", "var(--miss)");
  burst(goal.x, goal.y, ["#ff2d86","#ff2d86","#2de2e6"]);

  updateDifficulty();
  updateUI();
}

// ===== START / STOP =====
async function startGame(){
  playing = true;

  // MUST start audio on user gesture
  await ensureAudio();

  // reset
  score = 0; combo = 0; coins = 0; bpm = 90; lvl = 1;
  beatInterval = 60 / bpm;
  beatStep = 0;
  updateUI();

  // position target via transform (so we can lerp smoothly)
  pos.x = 40;
  pos.y = 180;
  goal.x = 40;
  goal.y = 180;

  if (!rafId) animate();

  // start beat loop
  clearTimeout(beatTimer);
  setTimeout(() => {
    beatTick(); // first beat after short delay
  }, 420);
}

// keep smooth on resize
window.addEventListener("resize", () => {
  randomGoal();
});