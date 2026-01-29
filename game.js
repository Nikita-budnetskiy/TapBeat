// --- STATE ---
let score = 0;
let combo = 0;
let bpm = 90;
let vibrationOn = true;
let playing = false;

// --- ELEMENTS ---
const intro = document.getElementById("intro");
const menu = document.getElementById("menu");
const game = document.getElementById("game");
const target = document.getElementById("target");
const field = document.getElementById("field");
const feedback = document.getElementById("feedback");

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const bpmEl = document.getElementById("bpm");

// --- INTRO FLOW ---
setTimeout(() => {
  intro.classList.remove("active");
  menu.classList.add("active");
}, 2500);

// --- MENU ---
document.getElementById("playBtn").onclick = () => {
  menu.classList.remove("active");
  game.classList.add("active");
  startGame();
};

// --- SETTINGS ---
document.getElementById("gear").onclick = () => {
  document.getElementById("settings").classList.add("active");
};

document.getElementById("closeSettings").onclick = () => {
  document.getElementById("settings").classList.remove("active");
};

document.getElementById("vibrationToggle").onchange = e => {
  vibrationOn = e.target.checked;
};

// --- GAME LOGIC ---
function startGame() {
  playing = true;
  moveTarget();
}

function moveTarget() {
  if (!playing) return;

  const x = Math.random() * (window.innerWidth - 140);
  const y = Math.random() * (window.innerHeight - 200) + 100;

  target.style.left = `${x}px`;
  target.style.top = `${y}px`;

  setTimeout(moveTarget, 60000 / bpm);
}

// --- TAP ---
target.addEventListener("click", () => {
  hit("perfect");
});

field.addEventListener("click", e => {
  if (e.target !== target && !target.contains(e.target)) {
    hit("miss");
  }
});

function hit(type) {
  if (vibrationOn && navigator.vibrate) navigator.vibrate(30);

  if (type === "perfect") {
    score += 100;
    combo++;
    bpm += 0.5;
    showFeedback("PERFECT", "#2de2e6");
  } else {
    combo = 0;
    showFeedback("MISS", "#f72585");
  }

  updateUI();
}

// --- UI ---
function updateUI() {
  scoreEl.textContent = score;
  comboEl.textContent = combo;
  bpmEl.textContent = Math.round(bpm);
}

function showFeedback(text, color) {
  feedback.textContent = text;
  feedback.style.color = color;
  feedback.style.opacity = 1;
  feedback.style.transform = "scale(1.2)";

  setTimeout(() => {
    feedback.style.opacity = 0;
    feedback.style.transform = "scale(1)";
  }, 400);
}