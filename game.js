/* ===============================
   TapBeat — game.js
   Nota Bene studio
   =============================== */

(() => {
  /* ---------- DOM ---------- */
  const splash = document.getElementById("splash");
  const mainMenu = document.getElementById("mainMenu");
  const gameUI = document.getElementById("gameUI");
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const feedbackEl = document.getElementById("feedback");

  const hudScore = document.getElementById("hudScore");
  const hudCombo = document.getElementById("hudCombo");
  const hudCoins = document.getElementById("hudCoins");
  const hudBpm = document.getElementById("hudBpm");
  const hudLv = document.getElementById("hudLv");
  const hudVibe = document.getElementById("hudVibe");
  const hudEnergy = document.getElementById("hudEnergy");

  const btnPlay = document.getElementById("btnPlay");
  const btnTutorial = document.getElementById("btnTutorial");
  const btnAchievements = document.getElementById("btnAchievements");
  const btnShop = document.getElementById("btnShop");

  const settingsPanel = document.getElementById("settingsPanel");
  const tutorialPanel = document.getElementById("tutorialPanel");
  const shopPanel = document.getElementById("shopPanel");
  const achPanel = document.getElementById("achPanel");
  const overlay = document.getElementById("overlayDim");

  const btnGear = document.getElementById("btnGear");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const btnResume = document.getElementById("btnResume");
  const btnBackToMenu = document.getElementById("btnBackToMenu");

  const btnCloseTutorial = document.getElementById("btnCloseTutorial");
  const btnStartFromTutorial = document.getElementById("btnStartFromTutorial");

  const btnCloseShop = document.getElementById("btnCloseShop");
  const btnShopOk = document.getElementById("btnShopOk");

  const btnCloseAch = document.getElementById("btnCloseAch");
  const btnAchOk = document.getElementById("btnAchOk");

  const toggleHaptics = document.getElementById("toggleHaptics");
  const toggleSound = document.getElementById("toggleSound");

  /* ---------- STATE ---------- */
  let running = false;
  let score = 0;
  let combo = 0;
  let coins = 0;
  let level = 1;

  let bpm = 88;
  let beatInterval = 60000 / bpm;
  let lastBeat = performance.now();

  let energy = 0;
  let vibe = "Verse";

  let haptics = true;

  /* ---------- CIRCLE ---------- */
  let target = {
    x: 0,
    y: 0,
    r: 70,
    tx: 0,
    ty: 0
  };

  /* ---------- CANVAS ---------- */
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---------- UI HELPERS ---------- */
  function show(el) {
    el.classList.remove("hidden");
    el.setAttribute("aria-hidden", "false");
  }

  function hide(el) {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  }

  function openPanel(panel) {
    show(panel);
    show(overlay);
  }

  function closePanel(panel) {
    hide(panel);
    hide(overlay);
  }

  function vibrate(ms = 20) {
    if (haptics && navigator.vibrate) navigator.vibrate(ms);
  }

  function showFeedback(text, type) {
    const el = document.createElement("div");
    el.className = `fb ${type}`;
    el.textContent = text;
    feedbackEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- GAME LOGIC ---------- */
  function resetGame() {
    score = 0;
    combo = 0;
    coins = 0;
    level = 1;
    bpm = 88;
    beatInterval = 60000 / bpm;
    energy = 0;
    vibe = "Verse";

    move	packetTarget(true);
    updateHUD();
  }

  function moveTarget(initial = false) {
    const margin = 120;
    target.tx = margin + Math.random() * (canvas.width - margin * 2);
    target.ty = margin + Math.random() * (canvas.height - margin * 2);
    if (initial) {
      target.x = target.tx;
      target.y = target.ty;
    }
  }

  function updateHUD() {
    hudScore.textContent = score;
    hudCombo.textContent = combo;
    hudCoins.textContent = coins;
    hudBpm.textContent = Math.round(bpm);
    hudLv.textContent = level;
    hudVibe.textContent = vibe;
    hudEnergy.textContent = `${energy}%`;
  }

  function hit(distance) {
    let result;
    if (distance < target.r * 0.35) result = "perfect";
    else if (distance < target.r * 0.75) result = "great";
    else result = "miss";

    if (result === "miss") {
      combo = 0;
      energy = Math.max(0, energy - 10);
      showFeedback("MISS", "miss");
      vibrate(40);
      return;
    }

    combo++;
    score += result === "perfect" ? 100 : 50;
    coins += result === "perfect" ? 3 : 1;
    energy = Math.min(100, energy + 4);

    showFeedback(result === "perfect" ? "PERFECT!" : "GREAT!", result);
    vibrate(15);

    if (combo % 6 === 0) {
      bpm += 2;
      beatInterval = 60000 / bpm;
    }

    if (combo % 15 === 0) {
      level++;
      vibe = level >= 3 ? "Chorus" : "Pre-Chorus";
    }

    moveTarget();
    updateHUD();
  }

  /* ---------- INPUT ---------- */
  canvas.addEventListener("pointerdown", e => {
    if (!running) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - target.x;
    const dy = y - target.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= target.r) hit(dist);
    else {
      combo = 0;
      showFeedback("MISS", "miss");
      vibrate(40);
    }
  });

  /* ---------- LOOP ---------- */
  function loop(now) {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // smooth movement
    target.x += (target.tx - target.x) * 0.08;
    target.y += (target.ty - target.y) * 0.08;

    // glow
    const g = ctx.createRadialGradient(
      target.x, target.y, target.r * 0.2,
      target.x, target.y, target.r * 1.8
    );
    g.addColorStop(0, "rgba(0,255,200,0.35)");
    g.addColorStop(1, "rgba(0,255,200,0)");

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // circle
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
    ctx.stroke();

    requestAnimationFrame(loop);
  }

  /* ---------- NAV ---------- */
  btnPlay.onclick = () => {
    hide(mainMenu);
    show(gameUI);
    running = true;
    resetGame();
    requestAnimationFrame(loop);
  };

  btnTutorial.onclick = () => openPanel(tutorialPanel);
  btnAchievements.onclick = () => openPanel(achPanel);
  btnShop.onclick = () => openPanel(shopPanel);

  btnGear.onclick = () => openPanel(settingsPanel);

  btnCloseSettings.onclick = () => closePanel(settingsPanel);
  btnResume.onclick = () => closePanel(settingsPanel);

  btnBackToMenu.onclick = () => {
    running = false;
    closePanel(settingsPanel);
    hide(gameUI);
    show(mainMenu);
  };

  btnCloseTutorial.onclick = () => closePanel(tutorialPanel);
  btnStartFromTutorial.onclick = () => {
    closePanel(tutorialPanel);
    btnPlay.click();
  };

  btnCloseShop.onclick = () => closePanel(shopPanel);
  btnShopOk.onclick = () => closePanel(shopPanel);

  btnCloseAch.onclick = () => closePanel(achPanel);
  btnAchOk.onclick = () => closePanel(achPanel);

  toggleHaptics.onchange = e => (haptics = e.target.checked);

  /* ---------- SPLASH ---------- */
  setTimeout(() => {
    hide(splash);
    show(mainMenu);
  }, 2600);
})();