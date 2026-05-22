import { VisualizerManager } from "./visualizers.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Starea poziției imaginii centrale (Drag & Drop și Zoom)
let centerMediaPos = { x: window.innerWidth / 2, y: window.innerHeight / 2, baseSize: 180, isDragging: false, hasMoved: false };

function resize() {
  const { innerWidth: w, innerHeight: h } = window;
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!centerMediaPos.hasMoved) { centerMediaPos.x = w / 2; centerMediaPos.y = h / 2; }
}
resize();
window.addEventListener("resize", resize);

// Elemente DOM din UI
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
const bgTypeSel = document.getElementById("bg-type");
const bgColor1 = document.getElementById("bg-color1");
const bgColor2 = document.getElementById("bg-color2");
const bgImageInput = document.getElementById("bg-image");
const bgImageWrap = document.getElementById("bg-image-wrap");
const bgColor1Wrap = document.getElementById("bg-color1-wrap");
const bgColor2Wrap = document.getElementById("bg-color2-wrap");

let ac, analyser, gainA, gainB, mediaDest, recorder = null, recChunks = [];
let current = { index: -1, audio: null, src: null };
const clips = [];
let micStream = null, micSource = null, micListening = false;
let overlayText = "", overlayAlpha = 0, overlayFadeDir = 0, overlayTimer = null;
let viz, playing = false, lastT = performance.now(), exportMode = false;

// ── LOGICĂ INTERACȚIUNE MOUSE (DRAG & DROP ȘI ROȚIȚĂ PENTRU MEDIA CENTRU) ──
window.addEventListener("mousedown", (e) => {
  const dx = e.clientX - centerMediaPos.x;
  const dy = e.clientY - centerMediaPos.y;
  if (Math.sqrt(dx * dx + dy * dy) < centerMediaPos.baseSize / 2) {
    centerMediaPos.isDragging = true;
    centerMediaPos.hasMoved = true;
  }
});

window.addEventListener("mousemove", (e) => {
  if (centerMediaPos.isDragging) {
    centerMediaPos.x = e.clientX;
    centerMediaPos.y = e.clientY;
  }
});

window.addEventListener("mouseup", () => { centerMediaPos.isDragging = false; });

window.addEventListener("wheel", (e) => {
  const dx = e.clientX - centerMediaPos.x;
  const dy = e.clientY - centerMediaPos.y;
  if (Math.sqrt(dx * dx + dy * dy) < centerMediaPos.baseSize / 2) {
    e.preventDefault();
    if (e.deltaY < 0) centerMediaPos.baseSize = Math.min(600, centerMediaPos.baseSize + 15);
    else centerMediaPos.baseSize = Math.max(40, centerMediaPos.baseSize - 15);
  }
}, { passive: false });


function ensureAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  gainA = ac.createGain(); gainB = ac.createGain();
  gainA.gain.value = 1; gainB.gain.value = 0;

  const merger = ac.createGain();
  gainA.connect(merger); gainB.connect(merger);
  merger.connect(analyser); analyser.connect(ac.destination);
  mediaDest = ac.createMediaStreamDestination();
  analyser.connect(mediaDest);

  viz = new VisualizerManager(ctx, analyser, {
    mode: modeSel.value, intensity: parseFloat(intensityEl.value), strobe: strobeEl.checked, color: colorInput?.value || "#ffffff",
    background: { type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }
  });
}

async function populateAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    audioDeviceSel.innerHTML = "";
    audioInputs.forEach((d, i) => {
      const opt = document.createElement("option"); opt.value = d.deviceId;
      opt.textContent = d.label || `Sursă Intrare ${i + 1}`; audioDeviceSel.appendChild(opt);
    });
  } catch (err) { console.warn(err); }
}
populateAudioDevices();
navigator.mediaDevices.addEventListener("devicechange", populateAudioDevices);

btnMicListen.addEventListener("click", async () => {
  ensureAudio(); if (ac.state === "suspended") await ac.resume();
  if (micListening) {
    if (micSource) { micSource.disconnect(); micSource = null; }
    if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    micListening = false; btnMicListen.textContent = "🎤 Listen Mic"; btnMicListen.classList.remove("active");
    return;
  }
  const constraints = { audio: audioDeviceSel.value ? { deviceId: { exact: audioDeviceSel.value } } : true };
  try {
    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    micSource = ac.createMediaStreamSource(micStream); micSource.connect(analyser);
    micListening = true; btnMicListen.textContent = "🛑 Stop Mic"; btnMicListen.classList.add("active");
  } catch (err) { alert(err.message); }
});

audioDeviceSel.addEventListener("change", () => {
  if (micListening) { if (micSource) micSource.disconnect(); btnMicListen.click(); btnMicListen.click(); }
});

btnApplyText.addEventListener("click", () => {
  const txt = overlayTextInput.value.trim(); if (!txt) return;
  overlayText = txt; overlayAlpha = 0; overlayFadeDir = 1;
  clearTimeout(overlayTimer); overlayTimer = setTimeout(() => { overlayFadeDir = -1; }, 4000);
});

function addClip(file) {
  const url = URL.createObjectURL(file);
  const isVideo = (file.type || "").startsWith("video") || /\.mp4$/i.test(file.name);
  clips.push({ name: file.name, url, file, isVideo }); renderList();
  if (current.index === -1) playIndex(0);
}

fileInput.addEventListener("change", (e) => { ensureAudio(); Array.from(e.target.files || []).forEach(addClip); fileInput.value = ""; });
imageInput.addEventListener("change", (e) => {
  ensureAudio(); const file = (e.target.files || [])[0];
  if (file && viz) {
    const url = URL.createObjectURL(file);
    if ((file.type || "").startsWith("video")) viz.setCenterMedia(url, "video"); else viz.setCenterMedia(url, "image");
  }
  imageInput.value = "";
});

scrollImageInput.addEventListener("change", (e) => {
  ensureAudio(); const file = (e.target.files || [])[0];
  if (file && viz) viz.setScrollingImage(URL.createObjectURL(file));
  scrollImageInput.value = "";
});
btnSuggestion.addEventListener("click", () => { ensureAudio(); if (viz) viz.setScrollingImage("./websimsuggestionimage.png"); });

btnPlay.addEventListener("click", async () => {
  ensureAudio(); if (!clips.length) return;
  if (ac.state === "suspended") await ac.resume();
  if (!playing) { if (current.audio) current.audio.play(); btnPlay.textContent = "Pause"; playing = true; } 
  else { if (current.audio) current.audio.pause(); btnPlay.textContent = "Play"; playing = false; }
});

btnStop.addEventListener("click", () => { if (current.audio) { current.audio.pause(); try { current.audio.currentTime = 0; } catch {} } playing = false; btnPlay.textContent = "Play"; });
btnPrev.addEventListener("click", () => { if (clips.length) playIndex((current.index - 1 + clips.length) % clips.length); });
btnNext.addEventListener("click", () => { if (clips.length) playIndex((current.index + 1) % clips.length); });

modeSel.addEventListener("change", () => viz && viz.setOptions({ mode: modeSel.value }));
intensityEl.addEventListener("input", () => viz && viz.setOptions({ intensity: parseFloat(intensityEl.value) }));
strobeEl.addEventListener("change", () => viz && viz.setOptions({ strobe: strobeEl.checked }));
colorInput.addEventListener("input", () => viz && viz.setOptions({ color: colorInput.value }));

bgTypeSel.addEventListener("change", () => {
  if (bgTypeSel.value === 'solid') { bgColor1Wrap.style.display = 'inline-flex'; bgColor2Wrap.style.display = 'none'; bgImageWrap.style.display = 'none'; }
  else if (bgTypeSel.value === 'gradient') { bgColor1Wrap.style.display = 'inline-flex'; bgColor2Wrap.style.display = 'inline-flex'; bgImageWrap.style.display = 'none'; }
  else { bgColor1Wrap.style.display = 'none'; bgColor2Wrap.style.display = 'none'; bgImageWrap.style.display = 'inline-flex'; }
  viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value });
});
bgColor1.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgColor2.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgImageInput.addEventListener("change", (e) => { const f = e.target.files[0]; if (f && viz) { viz.setBackground({ type: 'image' }); viz.setBackgroundImage(URL.createObjectURL(f)); } });

function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li"); if (i === current.index) li.classList.add("active");
    
    const name = document.createElement("span"); 
    name.textContent = c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name;
    
    const actionWrap = document.createElement("div");
    actionWrap.style.display = "inline-flex"; actionWrap.style.gap = "6px"; actionWrap.style.marginLeft = "12px";

    const pBtn = document.createElement("button"); pBtn.textContent = "▶"; pBtn.style.padding = "2px 6px";
    pBtn.onclick = (e) => { e.stopPropagation(); playIndex(i); };

    const sBtn = document.createElement("button"); sBtn.textContent = "⏹"; sBtn.style.padding = "2px 6px"; sBtn.style.color = "#ff6b6b";
    sBtn.onclick = (e) => { e.stopPropagation(); if(current.index === i) btnStop.click(); };

    actionWrap.appendChild(pBtn); actionWrap.appendChild(sBtn);
    li.appendChild(name); li.appendChild(actionWrap); listEl.appendChild(li);
  });
}

async function playIndex(index) {
  ensureAudio(); const clip = clips[index]; if (!clip) return;
  if (current.audio) { current.audio.pause(); try { current.audio.currentTime = 0; } catch {} }
  const media = clip.isVideo ? document.createElement("video") : new Audio();
  Object.assign(media, { src: clip.url, preload: "auto", crossOrigin: "anonymous", loop: false, playsInline: true });
  media.addEventListener("ended", () => { btnNext.click(); });

  const srcNode = ac.createMediaElementSource(media); srcNode.connect(gainA);
  if (playing || ac.state === "running") { try { await media.play(); playing = true; btnPlay.textContent = "Pause"; } catch {} }
  current = { index, audio: media }; renderList();
}

// Înregistrare video logică existentă reținută
function startRecording() {
  recChunks = []; const stream = canvas.captureStream(30);
  if (mediaDest) { const audioTracks = mediaDest.stream.getAudioTracks(); if (audioTracks.length) stream.addTrack(audioTracks[0]); }
  recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recChunks, { type: "video/webm" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = exportMode ? "export.webm" : "recording.webm";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); exportMode = false;
  };
  recorder.start(); if (!exportMode) btnRecord.textContent = "Stop Rec";
}
function stopRecording() { recorder && recorder.stop(); btnRecord.textContent = "Record"; }

btnRecord.addEventListener("click", async () => {
  ensureAudio(); if (!recorder || recorder.state === "inactive") { await ac.resume(); startRecording(); } else stopRecording();
});

btnExport.addEventListener("click", async () => {
  ensureAudio(); if (!clips.length) return; await ac.resume(); exportMode = true;
  if (current.index === -1) await playIndex(0);
  if (current.audio) { try { current.audio.pause(); } catch {} current.audio.currentTime = 0; await current.audio.play(); playing = true; btnPlay.textContent = "Pause"; }
  if (!recorder || recorder.state === "inactive") startRecording();
});

function drawOverlay(w, h, dt) {
  if (overlayText) {
    if (overlayFadeDir === 1) overlayAlpha = Math.min(1, overlayAlpha + dt * 2);
    if (overlayFadeDir === -1) { overlayAlpha = Math.max(0, overlayAlpha - dt * 1.2); if (overlayAlpha === 0) overlayText = ""; }
    if (overlayAlpha > 0) {
      ctx.save(); ctx.globalAlpha = overlayAlpha; ctx.font = `600 ${Math.max(24, w / 16)}px sans-serif`;
      ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.fillText(overlayText, w / 2, h * 0.82); ctx.restore();
    }
  }
}

// ── MAIN LOOP ──
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  
  if (viz) {
    viz.render(w, h, dt);

    // Desenează Media Centrală cu poziție mutabilă + Puls pe bass
    if (viz.centerMedia && viz.centerMedia.el) {
      let bass = 0; for (let i = 0; i < 15; i++) bass += viz.dataArray[i];
      const pulseFactor = 1 + (bass / 15 / 255) * 0.18 * parseFloat(intensityEl.value);
      const dynSize = centerMediaPos.baseSize * pulseFactor;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerMediaPos.x, centerMediaPos.y, dynSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(viz.centerMedia.el, centerMediaPos.x - dynSize / 2, centerMediaPos.y - dynSize / 2, dynSize, dynSize);
      ctx.restore();
    }
  }
  
  drawOverlay(w, h, dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
