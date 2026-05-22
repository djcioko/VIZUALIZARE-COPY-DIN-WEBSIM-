import { VisualizerManager } from "./visualizers.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
function resize() {
  const { innerWidth: w, innerHeight: h } = window;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// UI elements
const fileInput = document.getElementById("file-input");
const listEl = document.getElementById("clip-list");
const btnPlay = document.getElementById("playpause");
const btnStop = document.getElementById("stop");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");
const modeSel = document.getElementById("mode");
const intensityEl = document.getElementById("intensity");
const strobeEl = document.getElementById("strobe");
const imageInput = document.getElementById("image-input");
const scrollImageInput = document.getElementById("scroll-image");
const btnSuggestion = document.getElementById("add-suggestion");
const btnRecord = document.getElementById("record");
const btnExport = document.getElementById("export");
const colorInput = document.getElementById("viz-color");
const audioDeviceSel = document.getElementById("audio-device");
const btnMicListen = document.getElementById("mic-listen");
const overlayTextInput = document.getElementById("overlay-text");
const btnApplyText = document.getElementById("apply-text");
// Background UI
const bgTypeSel = document.getElementById("bg-type");
const bgColor1 = document.getElementById("bg-color1");
const bgColor2 = document.getElementById("bg-color2");
const bgImageInput = document.getElementById("bg-image");
const bgImageWrap = document.getElementById("bg-image-wrap");
const bgColor1Wrap = document.getElementById("bg-color1-wrap");
const bgColor2Wrap = document.getElementById("bg-color2-wrap");

// Audio graph
let ac;
let analyser;
let gainA, gainB;
let current = { index: -1, audio: null, src: null };
let nextAudio = null;
const clips = [];
let mediaDest, recorder = null, recChunks = [];

// Mic state
let micStream = null;
let micSource = null;
let micListening = false;

// Text overlay state
let overlayText = "";
let overlayAlpha = 0;
let overlayFadeDir = 0; // 0=idle, 1=in, -1=out
let overlayTimer = null;

// Visualizer
let viz;

// State
let playing = false;
let lastT = performance.now();
let exportMode = false;

// Show popup on load
const popup = document.createElement("div");
popup.className = "modal-overlay";
popup.innerHTML = `<div class="modal-card"><strong>WE'RE ON THE HOT PAGE!</strong><button class="button close">OK</button></div>`;
document.body.appendChild(popup);
popup.querySelector(".close").addEventListener("click", () => popup.remove());

function ensureAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  gainA = ac.createGain();
  gainB = ac.createGain();
  gainA.gain.value = 1;
  gainB.gain.value = 0;

  const merger = ac.createGain();
  gainA.connect(merger);
  gainB.connect(merger);
  merger.connect(analyser);
  analyser.connect(ac.destination);
  mediaDest = ac.createMediaStreamDestination();
  analyser.connect(mediaDest);

  viz = new VisualizerManager(ctx, analyser, {
    mode: modeSel.value,
    intensity: parseFloat(intensityEl.value),
    strobe: strobeEl.checked,
    color: colorInput?.value || "#ffffff",
    background: {
      type: bgTypeSel.value,
      color1: bgColor1.value,
      color2: bgColor2.value,
    }
  });
}

// ── Audio device enumeration ──────────────────────────────────────────────────
async function populateAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    audioDeviceSel.innerHTML = "";
    audioInputs.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microfon ${i + 1}`;
      audioDeviceSel.appendChild(opt);
    });
  } catch (err) {
    console.warn("Could not enumerate audio devices:", err);
  }
}
populateAudioDevices();

navigator.mediaDevices.addEventListener("devicechange", populateAudioDevices);

// ── Mic listen ────────────────────────────────────────────────────────────────
btnMicListen.addEventListener("click", async () => {
  ensureAudio();
  if (ac.state === "suspended") await ac.resume();

  if (micListening) {
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    micListening = false;
    btnMicListen.textContent = "🎤 Listen Mic";
    btnMicListen.classList.remove("active");
    return;
  }

  const deviceId = audioDeviceSel.value;
  const constraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true
  };

  try {
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    micSource = ac.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    micListening = true;
    btnMicListen.textContent = "🛑 Stop Mic";
    btnMicListen.classList.add("active");
  } catch (err) {
    alert("Nu s-a putut accesa microfonul: " + err.message);
  }
});

// ── Text overlay ──────────────────────────────────────────────────────────────
btnApplyText.addEventListener("click", () => {
  const txt = overlayTextInput.value.trim();
  if (!txt) return;
  overlayText = txt;
  overlayAlpha = 0;
  overlayFadeDir = 1;
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { overlayFadeDir = -1; }, 4000);
});

overlayTextInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnApplyText.click();
});

function drawOverlay(w, h, dt) {
  if (!overlayText) return;
  if (overlayFadeDir === 1) overlayAlpha = Math.min(1, overlayAlpha + dt * 2);
  if (overlayFadeDir === -1) {
    overlayAlpha = Math.max(0, overlayAlpha - dt * 1.2);
    if (overlayAlpha === 0) { overlayText = ""; overlayFadeDir = 0; }
  }
  if (overlayAlpha <= 0) return;

  const fontSize = Math.max(24, Math.min(72, w / 14));
  ctx.save();
  ctx.globalAlpha = overlayAlpha * 0.92;
  ctx.font = `600 ${fontSize}px "Noto Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(overlayText, w / 2, h * 0.82, w * 0.9);
  ctx.restore();
}

// ── Clips ─────────────────────────────────────────────────────────────────────
function addClip(file) {
  const url = URL.createObjectURL(file);
  const isVideo = (file.type || "").startsWith("video") || /\.mp4$/i.test(file.name);
  clips.push({ name: file.name, url, file, isVideo });
  renderList();
  if (current.index === -1) playIndex(0);
}

fileInput.addEventListener("change", (e) => {
  ensureAudio();
  const files = Array.from(e.target.files || []);
  files.forEach(addClip);
  fileInput.value = "";
});

imageInput.addEventListener("change", (e) => {
  ensureAudio();
  const file = (e.target.files || [])[0];
  if (file && viz) {
    const url = URL.createObjectURL(file);
    if ((file.type || "").startsWith("video")) viz.setCenterMedia(url, "video");
    else viz.setCenterMedia(url, "image");
  }
  imageInput.value = "";
});

scrollImageInput.addEventListener("change", (e) => {
  ensureAudio();
  const file = (e.target.files || [])[0];
  if (file && viz) {
    const url = URL.createObjectURL(file);
    viz.setScrollingImage(url);
  }
  scrollImageInput.value = "";
});

btnSuggestion.addEventListener("click", () => {
  ensureAudio();
  if (viz) viz.setScrollingImage("./websimsuggestionimage.png");
});

// ── Play / Pause ──────────────────────────────────────────────────────────────
btnPlay.addEventListener("click", async () => {
  ensureAudio();
  if (!clips.length) return;
  if (ac.state === "suspended") await ac.resume();
  if (!playing) {
    if (current.audio) current.audio.play();
    btnPlay.textContent = "Pause";
    playing = true;
  } else {
    if (current.audio) current.audio.pause();
    if (nextAudio) nextAudio.pause();
    btnPlay.textContent = "Play";
    playing = false;
  }
});

// ── Stop ──────────────────────────────────────────────────────────────────────
btnStop.addEventListener("click", () => {
  if (current.audio) {
    current.audio.pause();
    try { current.audio.currentTime = 0; } catch {}
  }
  if (nextAudio) {
    nextAudio.pause();
    try { nextAudio.currentTime = 0; } catch {}
  }
  playing = false;
  btnPlay.textContent = "Play";
});

// ── Prev / Next ───────────────────────────────────────────────────────────────
btnPrev.addEventListener("click", () => {
  if (!clips.length) return;
  const idx = (current.index - 1 + clips.length) % clips.length;
  playIndex(idx);
});

btnNext.addEventListener("click", () => {
  if (!clips.length) return;
  const idx = (current.index + 1) % clips.length;
  playIndex(idx);
});

// ── Heavy mode warning ────────────────────────────────────────────────────────
const heavyModes = new Set(["jumbled","particles"]);
const acknowledged = new Set();
function askHeavy(mode) {
  if (acknowledged.has(mode)) return Promise.resolve(true);
  return new Promise(res => {
    const o = document.createElement("div"); o.className = "modal-overlay";
    o.innerHTML = `<div class="modal-card"><strong>This mode can be heavy.</strong><p style="margin:8px 0 14px">"${mode === "jumbled" ? "Jumbled Mess" : "Particles"}" may be laggy on low-end devices.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="button cancel">Cancel</button><button class="button proceed">Proceed</button></div></div>`;
    document.body.appendChild(o);
    o.querySelector(".cancel").onclick = () => { o.remove(); res(false); };
    o.querySelector(".proceed").onclick = () => { acknowledged.add(mode); o.remove(); res(true); };
  });
}

modeSel.addEventListener("change", async (e) => {
  const val = modeSel.value;
  if (heavyModes.has(val)) {
    const ok = await askHeavy(val);
    if (!ok) { modeSel.value = viz?.mode || "bars"; return; }
  }
  viz && viz.setOptions({ mode: val });
});

intensityEl.addEventListener("input", () => viz && viz.setOptions({ intensity: parseFloat(intensityEl.value) }));
strobeEl.addEventListener("change", () => viz && viz.setOptions({ strobe: strobeEl.checked }));
colorInput.addEventListener("input", () => viz && viz.setOptions({ color: colorInput.value }));

// ── Background controls ───────────────────────────────────────────────────────
function updateBgControlVisibility() {
  const t = bgTypeSel.value;
  if (t === "solid") {
    bgImageWrap.style.display = "none";
    bgColor1Wrap.style.display = "inline-flex";
    bgColor2Wrap.style.display = "none";
  } else if (t === "gradient") {
    bgImageWrap.style.display = "none";
    bgColor1Wrap.style.display = "inline-flex";
    bgColor2Wrap.style.display = "inline-flex";
  } else {
    bgImageWrap.style.display = "inline-flex";
    bgColor1Wrap.style.display = "none";
    bgColor2Wrap.style.display = "none";
  }
}
updateBgControlVisibility();

bgTypeSel.addEventListener("change", () => {
  updateBgControlVisibility();
  viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value });
});
bgColor1.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgColor2.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgImageInput.addEventListener("change", (e) => {
  const file = (e.target.files || [])[0];
  if (file && viz) {
    const url = URL.createObjectURL(file);
    viz.setBackground({ type: "image" });
    viz.setBackgroundImage(url);
  }
  bgImageInput.value = "";
});

// ── Clip list render ──────────────────────────────────────────────────────────
function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li");
    if (i === current.index) li.classList.add("active");
    const name = document.createElement("span");
    name.textContent = truncate(c.name, 28);
    const playBtn = document.createElement("button");
    playBtn.className = "play";
    playBtn.textContent = "Play";
    playBtn.addEventListener("click", () => playIndex(i));
    const dlBtn = document.createElement("button");
    dlBtn.className = "download";
    dlBtn.textContent = "Download";
    dlBtn.addEventListener("click", () => downloadClip(c));
    li.appendChild(playBtn);
