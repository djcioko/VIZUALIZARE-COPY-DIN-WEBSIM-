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

// Elemente Interfață (UI)
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

// Elemente fundal
const bgTypeSel = document.getElementById("bg-type");
const bgColor1 = document.getElementById("bg-color1");
const bgColor2 = document.getElementById("bg-color2");
const bgImageInput = document.getElementById("bg-image");
const bgImageWrap = document.getElementById("bg-image-wrap");
const bgColor1Wrap = document.getElementById("bg-color1-wrap");
const bgColor2Wrap = document.getElementById("bg-color2-wrap");

// Variabile Audio
let ac = null;
let analyser = null;
let gainA = null;
let mediaDest = null;
let recorder = null;
let recChunks = [];

let current = { index: -1, audio: null, sourceNode: null };
const clips = [];

// Stare Microfon Laptop
let micStream = null;
let micSource = null;
let micListening = false;

// Stare Text Overlay
let overlayText = "";
let overlayAlpha = 0;
let overlayFadeDir = 0;
let overlayTimer = null;

// Manager Vumetre
let viz = null;
let playing = false;
let lastT = performance.now();
let exportMode = false;

// Funcția principală care pornește sistemul Audio original
function ensureAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  
  gainA = ac.createGain();
  gainA.gain.value = 1;
  
  gainA.connect(analyser);
  analyser.connect(ac.destination);
  
  mediaDest = ac.createMediaStreamDestination();
  analyser.connect(mediaDest);

  viz = new VisualizerManager(ctx, analyser, {
    mode: modeSel.value,
    intensity: parseFloat(intensityEl.value),
    strobe: strobeEl.checked,
    color: colorInput?.value || "#ffffff",
    background: { type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }
  });
}

// ── Citirea și detectarea hardware a microfoanelor din laptop ────────────────
async function populateAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    
    audioDeviceSel.innerHTML = "";
    audioInputs.forEach((device, index) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Microfon/Sursă ${index + 1}`;
      audioDeviceSel.appendChild(opt);
    });
  } catch (err) {
    console.warn("Nu s-au putut citi plăcile audio din laptop:", err);
  }
}
populateAudioDevices();
navigator.mediaDevices.addEventListener("devicechange", populateAudioDevices);

// Oprire hardware microfon
function stopMicHardware() {
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micListening = false;
  btnMicListen.textContent = "🎤 Listen Mic";
  btnMicListen.classList.remove("active");
}

// Ascultare Microfon Laptop
btnMicListen.addEventListener("click", async () => {
  ensureAudio();
  if (ac.state === "suspended") await ac.resume();

  if (micListening) {
    stopMicHardware();
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
    alert("Eroare la deschiderea microfonului din laptop: " + err.message);
  }
});

audioDeviceSel.addEventListener("change", () => {
  if (micListening) {
    stopMicHardware();
    btnMicListen.click();
  }
});

// ── Gestionare Text Overlay ──────────────────────────────────────────────────
btnApplyText.addEventListener("click", () => {
  const txt = overlayTextInput.value.trim();
  if (!txt) return;
  overlayText = txt; overlayAlpha = 0; overlayFadeDir = 1;
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => { overlayFadeDir = -1; }, 4000);
});

function drawOverlay(w, h, dt) {
  if (!overlayText) return;
  if (overlayFadeDir === 1) overlayAlpha = Math.min(1, overlayAlpha + dt * 2);
  if (overlayFadeDir === -1) {
    overlayAlpha = Math.max(0, overlayAlpha - dt * 1.2);
    if (overlayAlpha === 0) { overlayText = ""; overlayFadeDir = 0; }
  }
  if (overlayAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  ctx.font = `600 ${Math.max(24, w / 16)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(overlayText, w / 2, h * 0.82);
  ctx.restore();
}

// ── Playlist Clipiuri / Melodii ────────────────────────────────────────────────
function addClip(file) {
  const url = URL.createObjectURL(file);
  const isVideo = (file.type || "").startsWith("video") || /\.mp4$/i.test(file.name);
  clips.push({ name: file.name, url, file, isVideo });
  renderList();
  if (current.index === -1) playIndex(0);
}

fileInput.addEventListener("change", (e) => {
  ensureAudio();
  Array.from(e.target.files || []).forEach(addClip);
  fileInput.value = "";
});

async function playIndex(index) {
  ensureAudio();
  const clip = clips[index];
  if (!clip) return;

  if (current.audio) {
    current.audio.pause();
    try { current.audio.currentTime = 0; } catch {}
    if (current.sourceNode) { current.sourceNode.disconnect(); }
  }

  const media = clip.isVideo ? document.createElement("video") : new Audio();
  Object.assign(media, { src: clip.url, preload: "auto", crossOrigin: "anonymous", loop: false, playsInline: true });
  
  media.addEventListener("ended", () => {
    if (exportMode) { stopRecording(); exportMode = false; }
    else { btnNext.click(); }
  });

  const sourceNode = ac.createMediaElementSource(media);
  sourceNode.connect(gainA);

  if (playing || ac.state === "running") {
    try {
      if (ac.state === "suspended") await ac.resume();
      await media.play();
      playing = true;
      btnPlay.textContent = "Pause";
    } catch (err) {
      console.error(err);
    }
  }

  current = { index, audio: media, sourceNode };
  renderList();
}

function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li");
    if (i === current.index && !micListening) li.classList.add("active");
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name;
    li.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.style.display = "inline-flex";
    actions.style.gap = "6px";
    actions.style.marginLeft = "12px";

    const itemPlay = document.createElement("button");
    itemPlay.textContent = "▶";
    itemPlay.style.padding = "2px 6px";
    itemPlay.style.fontSize = "11px";
    itemPlay.style.cursor = "pointer";
    itemPlay.addEventListener("click", (e) => { 
      e.stopPropagation(); 
      stopMicHardware(); 
      playing = true; 
      playIndex(i); 
    });

    const itemStop = document.createElement("button");
    itemStop.textContent = "⏹";
    itemStop.style.padding = "2px 6px";
    itemStop.style.fontSize = "11px";
    itemStop.style.color = "#ff6b6b";
    itemStop.style.cursor = "pointer";
    itemStop.addEventListener("click", (e) => { 
      e.stopPropagation(); 
      if (current.index === i && current.audio) {
        current.audio.pause();
        playing = false;
        btnPlay.textContent = "Play";
      }
    });

    actions.appendChild(itemPlay);
    actions.appendChild(itemStop);
    li.appendChild(actions);
    listEl.appendChild(li);
  });
}

btnPlay.addEventListener("click", async () => {
  ensureAudio();
  if (!clips.length) return;
  if (ac.state === "suspended") await ac.resume();

  if (!playing) {
    if (current.audio) current.audio.play();
    btnPlay.textContent = "Pause"; playing = true;
  } else {
    if (current.audio) current.audio.pause();
    btnPlay.textContent = "Play"; playing = false;
  }
});

btnStop.addEventListener("click", () => {
  if (current.audio) {
    current.audio.pause();
    try { current.audio.currentTime = 0; } catch {}
  }
  playing = false;
  btnPlay.textContent = "Play";
});

btnPrev.addEventListener("click", () => { if (clips.length) playIndex((current.index - 1 + clips.length) % clips.length); });
btnNext.addEventListener("click", () => { if (clips.length) playIndex((current.index + 1) % clips.length); });

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
  if (file && viz)
