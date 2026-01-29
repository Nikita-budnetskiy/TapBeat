/* TAPBEAT — minimal rhythm game with WebAudio (no external assets)
   - One tap target, clear ring cue
   - Electronic/club groove generated via oscillators + noise
   - Combo unlocks layers
*/

(() => {
  const $ = (id) => document.getElementById(id);

  const el = {
    stage: $("stage"),
    target: $("target"),
    ringOuter: $("ringOuter"),
    ringInner: $("ringInner"),
    hint: $("hint"),
    judge: $("judge"),
    score: $("score"),
    combo: $("combo"),
    bpm: $("bpm"),
    lvl: $("lvl"),
    bar: $("bar"),
    trackState: $("trackState"),

    startOverlay: $("startOverlay"),
    pauseOverlay: $("pauseOverlay"),
    btnStart: $("btnStart"),
    btnPause: $("btnPause"),
    btnResume: $("btnResume"),
    btnRestart: $("btnRestart"),

    modeSelect: $("modeSelect"),
    bpmSelect: $("bpmSelect"),
    haptics: $("haptics"),
    sound: $("sound"),
  };

  // ---------- Game State ----------
  const state = {
    running: false,
    paused: false,

    bpm: 128,
    beatMs: 468.75, // computed
    startAt: 0,
    nowMs: 0,

    // hit windows (ms) — tuned for “feels fair”
    perfect: 40,
    great: 85,
    ok: 130,

    score: 0,
    combo: 0,
    level: 1,
    beatsThisRun: 0,
    beatsPerLevel: 32,

    // timing
    nextBeatAtMs: 0,
    lastBeatAtMs: 0,
    phase: 0, // 0..1

    // mode
    mode: "classic", // or "drift"
    drift: 0,        // slowly shifts beat for difficulty

    // audio
    audioOn: true,
    hapticsOn: true,
    audio: null,
    layers: {
      kick: true,
      hat: false,
      bass: false,
      clap: false,
    },
  };

  // ---------- WebAudio Engine ----------
  function makeAudioEngine() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();

    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    // gentle limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.01;
    comp.release.value = 0.16;
    comp.connect(master);

    const bus = ctx.createGain();
    bus.gain.value = 0.9;
    bus.connect(comp);

    // Noise source (for hats/clap)
    const noiseBuf = (() => {
      const len = ctx.sampleRate * 1.0;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1);
      return buffer;
    })();

    function env(g, t, a, d, s, r) {
      // ADSR-ish (a,d,r in seconds)
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(1.0, t + a);
      g.gain.exponentialRampToValueAtTime(Math.max(s, 0.0001), t + a + d);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
    }

    function kick(t) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.10);
      env(g, t, 0.001, 0.04, 0.3, 0.12);
      osc.connect(g);
      g.connect(bus);
      osc.start(t);
      osc.stop(t + 0.20);
    }

    function hat(t) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 9000;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.55, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

      src.connect(hp);
      hp.connect(g);
      g.connect(bus);

      src.start(t);
      src.stop(t + 0.08);
    }

    function clap(t) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;

      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2200;
      bp.Q.value = 0.9;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.85, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

      src.connect(bp);
      bp.connect(g);
      g.connect(bus);

      src.start(t);
      src.stop(t + 0.16);
    }

    // simple bass: short pluck on offbeats
    function bass(t, freq = 55) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 700;

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, t);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.75, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);

      osc.start(t);
      osc.stop(t + 0.22);
    }

    return { ctx, kick, hat, clap, bass, master };
  }

  function updateTrackStateLabel() {
    const parts = [];
    if (state.layers.kick) parts.push("Kick");
    if (state.layers.hat) parts.push("Hat");
    if (state.layers.bass) parts.push("Bass");
    if (state.layers.clap) parts.push("Clap");
    el.trackState.textContent = `Track: ${parts.join(" + ")}`;
  }

  function recomputeBeat() {
    state.beatMs = 60000 / state.bpm;
    el.bpm.textContent = String(state.bpm);
  }

  // ---------- Visual Ring Animation ----------
  // We animate rings by setting opacity and scale based on phase-to-next-beat.
  function renderRing(phase) {
    // phase: 0..1 where 1 = exact beat moment
    // ring shrinks into sweet zone; we want it visible most of the beat
    const p = Math.max(0, Math.min(1, phase));

    // Outer ring: big -> sweet
    const outerScale = 1.35 - 0.55 * p;
    const innerScale = 1.15 - 0.30 * p;

    const outerOpacity = 0.15 + 0.85 * Math.pow(p, 0.8);
    const innerOpacity = 0.10 + 0.65 * Math.pow(p, 0.8);

    el.ringOuter.style.opacity = String(outerOpacity);
    el.ringOuter.style.transform = `scale(${outerScale})`;

    el.ringInner.style.opacity = String(innerOpacity);
    el.ringInner.style.transform = `scale(${innerScale})`;
  }

  function flashPerfect(color) {
    el.target.animate(
      [
        { boxShadow: "0 18px 60px rgba(0,0,0,0.55)" },
        { boxShadow: `0 18px 70px ${color}` },
        { boxShadow: "0 18px 60px rgba(0,0,0,0.55)" }
      ],
      { duration: 240, easing: "ease-out" }
    );
  }

  function setJudge(text, kind) {
    el.judge.textContent = text;
    const map = {
      perfect: "var(--accent)",
      great: "var(--good)",
      ok: "var(--ok)",
      miss: "var(--miss)"
    };
    el.judge.style.color = map[kind] || "var(--text)";
  }

  function vibrate(ms) {
    if (!state.hapticsOn) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------- Beat Scheduling ----------
  // We'll do a simple scheduler that triggers sounds close to beat boundaries.
  // Visual cue uses rAF based on nextBeatAtMs.
  let rafId = 0;
  let schedTimer = 0;

  function scheduleAudio() {
    if (!state.audioOn || !state.audio) return;
    const { ctx } = state.audio;

    const lookAhead = 0.12; // seconds
    const interval = 25; // ms
    const now = ctx.currentTime;

    // state.nextBeatAtMs is based on performance.now() (ms)
    // convert to ctx time by estimating offset between perfNow and audio ctx:
    // We'll store a mapping: audioZeroPerf = performance.now() at ctx.currentTime ~ 0
    // simplest: compute at start: state.audioPerfZeroMs = performance.now() - ctx.currentTime*1000
    const perfNow = performance.now();
    const audioNowMs = (now * 1000);
    const audioPerfZeroMs = state.audioPerfZeroMs;
    const audioTimeFromPerf = (ms) => (Math.max(0, (ms - audioPerfZeroMs)) / 1000);

    // schedule beats that will happen within lookahead window
    const windowEndPerf = perfNow + lookAhead * 1000;

    while (state.nextBeatAtMs <= windowEndPerf) {
      const t = audioTimeFromPerf(state.nextBeatAtMs);

      // pattern: 4/4; kick on 1 & 3, optional hat on 8ths, clap on 2 & 4, bass on offbeats
      const beatIndex = state.beatsThisRun % 4; // 0..3

      // Drift mode: tiny random drift each bar (hard)
      if (state.mode === "drift" && (state.beatsThisRun % 8 === 0)) {
        state.drift += (Math.random() * 2 - 1) * 8; // +/- 8ms
        state.drift = Math.max(-26, Math.min(26, state.drift));
      }

      // Kick
      if (state.layers.kick && (beatIndex === 0 || beatIndex === 2)) state.audio.kick(t);

      // Clap on 2 & 4
      if (state.layers.clap && (beatIndex === 1 || beatIndex === 3)) state.audio.clap(t);

      // Hat on 8ths: schedule an extra hat in between beats
      if (state.layers.hat) {
        state.audio.hat(t);
        // off-hat at half beat
        const tOff = t + (state.beatMs / 1000) * 0.5;
        state.audio.hat(tOff);
      }

      // Bass on offbeats
      if (state.layers.bass) {
        const freq = (beatIndex === 0 || beatIndex === 2) ? 55 : 65;
        const tBass = t + (state.beatMs / 1000) * 0.5;
        state.audio.bass(tBass, freq);
      }

      state.lastBeatAtMs = state.nextBeatAtMs;
      state.nextBeatAtMs += state.beatMs + state.drift;
      state.beatsThisRun += 1;

      // Level progress
      const progress = (state.beatsThisRun % state.beatsPerLevel) / state.beatsPerLevel;
      el.bar.style.width = `${Math.floor(progress * 100)}%`;

      if (state.beatsThisRun % state.beatsPerLevel === 0) {
        state.level += 1;
        el.lvl.textContent = String(state.level);
        // small difficulty scaling
        state.perfect = Math.max(28, state.perfect - 2);
        state.great = Math.max(70, state.great - 1);
        state.ok = Math.max(105, state.ok - 1);
      }
    }

    schedTimer = window.setTimeout(scheduleAudio, interval);
  }

  function startLoops() {
    cancelAnimationFrame(rafId);
    if (schedTimer) window.clearTimeout(schedTimer);

    // visual loop
    const loop = () => {
      if (!state.running || state.paused) return;

      const nowMs = performance.now();
      state.nowMs = nowMs;

      const timeToNext = state.nextBeatAtMs - nowMs; // ms
      const phase = 1 - (timeToNext / state.beatMs); // near 1 at beat
      state.phase = phase;

      // ring visible throughout beat, but reset after beat
      renderRing(((phase % 1) + 1) % 1);

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    // audio loop
    scheduleAudio();
  }

  function stopLoops() {
    cancelAnimationFrame(rafId);
    if (schedTimer) window.clearTimeout(schedTimer);
    schedTimer = 0;
  }

  // ---------- Judgement ----------
  function judgeTap() {
    if (!state.running || state.paused) return;

    const nowMs = performance.now();
    // compute nearest beat time (the lastBeatAt or nextBeatAt)
    const last = state.lastBeatAtMs;
    const next = state.nextBeatAtMs;
    const dLast = Math.abs(nowMs - last);
    const dNext = Math.abs(next - nowMs);
    const delta = Math.min(dLast, dNext);

    let kind = "miss";
    let add = 0;

    if (delta <= state.perfect) { kind = "perfect"; add = 120; }
    else if (delta <= state.great) { kind = "great"; add = 70; }
    else if (delta <= state.ok) { kind = "ok"; add = 35; }
    else { kind = "miss"; add = 0; }

    if (kind === "miss") {
      state.combo = 0;
      setJudge("MISS", "miss");
      vibrate(20);
      // small visual “drop”
      el.target.animate(
        [{ transform: "scale(1)" }, { transform: "scale(0.985)" }, { transform: "scale(1)" }],
        { duration: 160, easing: "ease-out" }
      );
    } else {
      state.combo += 1;
      const comboMult = 1 + Math.min(2.5, state.combo / 25);
      const earned = Math.floor(add * comboMult);
      state.score += earned;

      if (kind === "perfect") {
        setJudge("PERFECT", "perfect");
        vibrate(10);
        flashPerfect("rgba(181,31,58,0.35)");
      } else if (kind === "great") {
        setJudge("GREAT", "great");
        vibrate(6);
      } else {
        setJudge("OK", "ok");
        vibrate(4);
      }
    }

    // unlock layers by combo thresholds (feels like “building the track”)
    if (state.combo >= 6) state.layers.hat = true;
    if (state.combo >= 12) state.layers.clap = true;
    if (state.combo >= 18) state.layers.bass = true;

    updateTrackStateLabel();

    el.score.textContent = String(state.score);
    el.combo.textContent = String(state.combo);

    // Make hint fade once player starts
    if (state.score > 0) el.hint.textContent = "KEEP THE PULSE";
  }

  // ---------- Controls ----------
  async function startGame() {
    state.mode = el.modeSelect.value;
    state.bpm = parseInt(el.bpmSelect.value, 10);
    state.hapticsOn = !!el.haptics.checked;
    state.audioOn = !!el.sound.checked;

    recomputeBeat();

    state.running = true;
    state.paused = false;
    state.score = 0;
    state.combo = 0;
    state.level = 1;
    state.beatsThisRun = 0;
    state.perfect = 40;
    state.great = 85;
    state.ok = 130;
    state.drift = 0;

    state.layers.kick = true;
    state.layers.hat = false;
    state.layers.clap = false;
    state.layers.bass = false;
    updateTrackStateLabel();

    el.score.textContent = "0";
    el.combo.textContent = "0";
    el.lvl.textContent = "1";
    el.judge.textContent = "";
    el.hint.textContent = "TAP ON THE BEAT";
    el.bar.style.width = "0%";

    // init audio only on user gesture
    if (state.audioOn) {
      if (!state.audio) state.audio = makeAudioEngine();
      try {
        if (state.audio.ctx.state !== "running") await state.audio.ctx.resume();
      } catch (_) {}
      // map perf time to audio time
      state.audioPerfZeroMs = performance.now() - (state.audio.ctx.currentTime * 1000);
    }

    // start beat grid
    const nowMs = performance.now();
    state.startAt = nowMs;
    state.lastBeatAtMs = nowMs;
    state.nextBeatAtMs = nowMs + state.beatMs;

    // show ring immediately
    el.ringOuter.style.opacity = "0.6";
    el.ringInner.style.opacity = "0.35";
    renderRing(0);

    el.startOverlay.classList.add("hidden");
    el.pauseOverlay.classList.add("hidden");

    startLoops();
  }

  function pauseGame() {
    if (!state.running) return;
    if (state.paused) return;

    state.paused = true;
    stopLoops();

    if (state.audio && state.audio.ctx && state.audio.ctx.state === "running") {
      // keep audio context running; we simply stop scheduling
    }

    el.pauseOverlay.classList.remove("hidden");
  }

  function resumeGame() {
    if (!state.running) return;
    if (!state.paused) return;

    state.paused = false;

    // re-anchor timing to avoid jumps
    const nowMs = performance.now();
    state.lastBeatAtMs = nowMs;
    state.nextBeatAtMs = nowMs + state.beatMs;

    if (state.audio && state.audio.ctx) {
      state.audioPerfZeroMs = performance.now() - (state.audio.ctx.currentTime * 1000);
    }

    el.pauseOverlay.classList.add("hidden");
    startLoops();
  }

  function restartGame() {
    stopLoops();
    state.running = false;
    state.paused = false;
    el.pauseOverlay.classList.add("hidden");
    el.startOverlay.classList.remove("hidden");
  }

  // ---------- Event Listeners ----------
  // Tap anywhere on stage (including target)
  function onPointerDown(ev) {
    // Avoid taps on overlay buttons triggering judgement
    const overlayVisible = !el.startOverlay.classList.contains("hidden") || !el.pauseOverlay.classList.contains("hidden");
    if (overlayVisible) return;

    ev.preventDefault();
    judgeTap();
  }

  el.btnStart.addEventListener("click", startGame);
  el.btnPause.addEventListener("click", () => state.paused ? resumeGame() : pauseGame());
  el.btnResume.addEventListener("click", resumeGame);
  el.btnRestart.addEventListener("click", restartGame);

  el.stage.addEventListener("pointerdown", onPointerDown, { passive: false });

  // Space/Enter for desktop
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      const overlayVisible = !el.startOverlay.classList.contains("hidden") || !el.pauseOverlay.classList.contains("hidden");
      if (!overlayVisible) judgeTap();
    }
    if (e.code === "Escape") {
      if (!state.running) return;
      if (state.paused) resumeGame();
      else pauseGame();
    }
  });

  // iOS Safari sometimes “selects” on long press; prevent
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  // Set defaults
  recomputeBeat();
  updateTrackStateLabel();
})();