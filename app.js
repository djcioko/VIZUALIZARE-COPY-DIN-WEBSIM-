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

// Elemente Interfață (UI) preluate exact din index.html
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

// Elemente fundal UI
const bgTypeSel = document.getElementById("bg-type");
const bgColor1 = document.getElementById("bg-color1");
const bgColor2 = document.getElementById("bg-color2");
const bgImageInput = document.getElementById("bg-image");
const bgImageWrap = document.getElementById("bg-image-wrap");
const bgColor1Wrap = document.getElementById("bg-color1-wrap");
const bgColor2Wrap = document.getElementById("bg-color2-wrap");

// Structura Audio Context globală
let ac = null;
let analyser = null;
let gainA = null;
let mediaDest = null;
let recorder = null;
let recChunks = [];

let current = { index: -1, audio: null, sourceNode: null };
const clips = [];

// Stare Microfoane Hardware Laptop
let micStream = null;
let micSource = null;
let micListening = false;

// Stare Text de pe Ecran (Overlay)
let overlayText = "";
let overlayAlpha = 0;
let overlayFadeDir = 0; // 0=idle, 1=fade-in, -1=fade-out
let overlayTimer = null;

// Stare Manager Vumetre
let viz = null;
let playing = false;
let lastT = performance.now();
let exportMode = false;

// Inițializarea curată a fluxului audio
function ensureAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  
  gainA = ac.createGain();
  gainA.gain.value = 1;
  
  // Conectăm sursele prin gain direct în analizator
  gainA.connect(analyser);
  analyser.connect(ac.destination);
  
  // Destinația pentru înregistrare video/export webm
  mediaDest = ac.createMediaStreamDestination();
  analyser.connect(mediaDest);

  // Instanțiem managerul de vumetre grafice
  viz = new VisualizerManager(ctx, analyser, {
    mode: modeSel.value,
    intensity: parseFloat(intensityEl.value),
    strobe: strobeEl.checked,
    color: colorInput?.value || "#ffffff",
    background: { type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }
  });
}

// ── CITIREA HARDWARE A MICROFOANELOR DIN LAPTOP ──────────────────────────────
async function populateAudioDevices() {
  try {
    // Cerem o permisiune temporară pentru a determina sistemul de operare să ne dea etichetele (numele) reale ale microfoanelor
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop()); // le oprim imediat, a fost doar pentru deblocare listă
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    
    audioDeviceSel.innerHTML = "";
    
    // Adăugăm opțiunea implicită a sistemului
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "";
    defaultOpt.textContent = "🎤 Default Mic";
    audioDeviceSel.appendChild(defaultOpt);

    // Populăm lista cu toate microfoanele fizice detectate în laptop
    audioInputs.forEach((device) => {
      if (device.deviceId !== 'default') {
        const opt = document.createElement("option");
        opt.value = device.deviceId;
        opt.textContent = device.label || `Microfon Laptop (${device.deviceId.slice(0, 5)})`;
        audioDeviceSel.appendChild(opt);
      }
    });
  } catch (err) {
    console.warn("Nu s-au putut accesa dispozitivele audio din laptop:", err);
  }
}

// Apelăm scanarea la încărcarea paginii
populateAudioDevices();
// Dacă utilizatorul bagă în laptop o cască sau un microfon nou pe USB în timp ce aplicația e deschisă, reîmprospătăm lista automat
navigator.mediaDevices.addEventListener("devicechange", populateAudioDevices);

// Oprire completă placă/microfon hardware
function stopMicHardware() {
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micListening = false;
  btnMicListen.textContent = "🎤 Listen Mic";
  btnMicListen.classList.remove("active");
}

// Ascultare Microfon Selectat din Laptop
btnMicListen.addEventListener("click", async () => {
  ensureAudio();
  if (ac.state === "suspended") await ac.resume();

  // Dacă era deja pornit, îl oprim la click secundar
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
    
    // Conectăm microfonul nativ direct la analizatorul vumetrului
    micSource.connect(analyser);
    
    micListening = true;
    btnMicListen.textContent = "🛑 Stop Mic";
    btnMicListen.classList.add("active");
  } catch (err) {
    alert("Eroare hardware la deschiderea sursei din laptop: " + err.message);
  }
});

// Schimbare automată pe noul microfon ales din listă
audioDeviceSel.addEventListener("change", () => {
  if (micListening) {
    stopMicHardware();
    btnMicListen.click();
  }
});

// ── GESTIONARE TEXT OVERLAY MULT MAI MARE ────────────────────────────────────
btnApplyText.addEventListener("click", () => {
  const txt = overlayTextInput.value.trim();
  if (!txt) return;
  overlayText = txt; 
  overlayAlpha = 0; 
  overlayFadeDir = 1;
  clearTimeout(overlayTimer);
  // Textul rămâne vizibil 5 secunde, apoi face fade-out progresiv
  overlayTimer = setTimeout(() => { overlayFadeDir = -1; }, 5000);
});

// Suport pentru tasta Enter în căsuța de text
overlayTextInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") btnApplyText.click();
});

function drawOverlay(w, h, dt) {
  if (!overlayText) return;
  if (overlayFadeDir === 1) overlayAlpha = Math.min(1, overlayAlpha + dt * 2.5);
  if (overlayFadeDir === -1) {
    overlayAlpha = Math.max(0, overlayAlpha - dt * 1.5);
    if (overlayAlpha === 0) { overlayText = ""; overlayFadeDir = 0; }
  }
  if (overlayAlpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = overlayAlpha;
  
  // Dimensiune mărită considerabil pentru lizibilitate excelentă la ecrane mari
  const calculatedFontSize = Math.max(32, Math.min(90, w / 12));
  ctx.font = `700 ${calculatedFontSize}px "Noto Sans", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Contur negru pronunțat (Drop shadow) ca să se vadă pe orice culoare de vumetru
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#ffffff";
  
  ctx.fillText(overlayText, w / 2, h * 0.75);
  ctx.restore();
}

// ── PLAYLIST ȘI ELEMENTE ADĂUGATE ─────────────────────────────────────────────
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

// Redare melodie după indexul ei din listă
async function playIndex(index) {
  ensureAudio();
  const clip = clips[index];
  if (!clip) return;

  // Oprim piesa curentă dacă există
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

  // Legăm piesa la sistemul Audio global prin gainA
  const sourceNode = ac.createMediaElementSource(media);
  sourceNode.connect(gainA);

  if (playing || ac.state === "running") {
    try {
      if (ac.state === "suspended") await ac.resume();
      await media.play();
      playing = true;
      btnPlay.textContent = "Pause";
    } catch (err) {
      console.warn("Redarea necesită interacțiune user:", err);
    }
  }

  current = { index, audio: media, sourceNode };
  renderList();
}

// Construirea listei vizuale cu butoanele Play și Stop pe fiecare track
function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li");
    if (i === current.index && playing) li.className = "active";
    
    // Numele fișierului
    const nameSpan = document.createElement("span");
    nameSpan.textContent = c.name.length > 35 ? c.name.slice(0, 32) + "…" : c.name;
    li.appendChild(nameSpan);

    const actions = document.createElement("div");
    actions.style.display = "inline-flex";
    actions.style.gap = "8px";
    actions.style.marginLeft = "15px";

    // Buton individual de Play (▶) pentru track
    const itemPlay = document.createElement("button");
    itemPlay.textContent = "▶";
    itemPlay.style.cursor = "pointer";
    itemPlay.style.padding = "2px 8px";
    itemPlay.addEventListener("click", (e) => { 
      e.stopPropagation(); 
      playing = true; 
      playIndex(i); 
    });

    // Buton individual de Stop (⏹) pentru track
    const itemStop = document.createElement("button");
    itemStop.textContent = "⏹";
    itemStop.style.cursor = "pointer";
    itemStop.style.padding = "2px 8px";
    itemStop.style.color = "#ff4d4d";
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

// Controale principale bară centrală
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
  renderList();
});

btnStop.addEventListener("click", () => {
  if (current.audio) {
    current.audio.pause();
    try { current.audio.currentTime = 0; } catch {}
  }
  playing = false;
  btnPlay.textContent = "Play";
  renderList();
});

btnPrev.addEventListener("click", () => { if (clips.length) playIndex((current.index - 1 + clips.length) % clips.length); });
btnNext.addEventListener("click", () => { if (clips.length) playIndex((current.index + 1) % clips.length); });

// Media element (Imagini centrate și fundaluri)
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
  if (file && viz) viz.setScrollingImage(URL.createObjectURL(file));
  scrollImageInput.value = "";
});
btnSuggestion.addEventListener("click", () => { ensureAudio(); if (viz) viz.setScrollingImage("./websimsuggestionimage.png"); });

// Opțiuni Interfață Vumetre live
modeSel.addEventListener("change", () => viz && viz.setOptions({ mode: modeSel.value }));
intensityEl.addEventListener("input", () => viz && viz.setOptions({ intensity: parseFloat(intensityEl.value) }));
strobeEl.addEventListener("change", () => viz && viz.setOptions({ strobe: strobeEl.checked }));
colorInput.addEventListener("input", () => viz && viz.setOptions({ color: colorInput.value }));

// Control Dinamic Vizibilitate Culoare Fundal / Imagine
bgTypeSel.addEventListener("change", () => {
  if (bgTypeSel.value === 'solid') { bgColor1Wrap.style.display = 'inline-flex'; bgColor2Wrap.style.display = 'none'; bgImageWrap.style.display = 'none'; }
  else if (bgTypeSel.value === 'gradient') { bgColor1Wrap.style.display = 'inline-flex'; bgColor2Wrap.style.display = 'inline-flex'; bgImageWrap.style.display = 'none'; }
  else { bgColor1Wrap.style.display = 'none'; bgColor2Wrap.style.display = 'none'; bgImageWrap.style.display = 'inline-flex'; }
  viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value });
});
bgColor1.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgColor2.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgImageInput.addEventListener("change", (e) => { const f = e.target.files[0]; if (f && viz) { viz.setBackground({ type: 'image' }); viz.setBackgroundImage(URL.createObjectURL(f)); } });

// ── INREGISTRARE VIDEO ȘI EXPORT CURAT ────────────────────────────────────────
function startRecording() {
  recChunks = [];
  const stream = canvas.captureStream(30);
  if (mediaDest) {
    const audioTracks = mediaDest.stream.getAudioTracks();
    if (audioTracks.length) stream.addTrack(audioTracks[0]);
  }
  recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recChunks, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = exportMode ? "export.webm" : "recording.webm";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    exportMode = false;
  };
  recorder.start();
  btnRecord.textContent = "Stop Rec";
}
function stopRecording() { if (recorder) recorder.stop(); btnRecord.textContent = "Record"; }

btnRecord.addEventListener("click", async () => {
  ensureAudio(); if (!recorder || recorder.state === "inactive") { await ac.resume(); startRecording(); } else stopRecording();
});

btnExport.addEventListener("click", async () => {
  ensureAudio(); if (!clips.length) return; await ac.resume(); exportMode = true;
  if (current.index === -1) await playIndex(0);
  if (current.audio) {
    try { current.audio.pause(); } catch {}
    current.audio.currentTime = 0;
    await current.audio.play();
    playing = true; btnPlay.textContent = "Pause";
  }
  if (!recorder || recorder.state === "inactive") startRecording();
});

// Loop-ul principal de randare grafică în Canvas
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  if (viz) viz.render(w, h, dt);
  drawOverlay(w, h, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
