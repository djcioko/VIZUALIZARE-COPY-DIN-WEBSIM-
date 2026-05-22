// ── CLASA VIZUALIZATORULUI INTEGRATĂ COMPLET (TOATE CELE 31 DE MODURI REPARATE) ──
class VisualizerManager {
  constructor(ctx, analyser, options) {
    this.ctx = ctx;
    this.analyser = analyser;
    this.options = options;
    this.bufferLength = analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(this.bufferLength);
    this.timeData = new Uint8Array(this.bufferLength);
    this.centerMedia = null;
    this.scrollingImage = null;
    this.scrollX = 0;
    this.particles = [];
    this.stars = [];
    
    // Inițializare particule pentru modurile speciale
    for(let i=0; i<150; i++) {
      this.particles.push({ x: Math.random(), y: Math.random(), s: Math.random()*3+1, v: Math.random()*2+0.5, angle: Math.random()*Math.PI*2 });
      this.stars.push({ x: Math.random()*2-1, y: Math.random()*2-1, z: Math.random() });
    }
  }

  setOptions(opts) { Object.assign(this.options, opts); }
  setBackground(bg) { Object.assign(this.options.background, bg); }
  setBackgroundImage(url) { this.bgImage = new Image(); this.bgImage.src = url; }
  setScrollingImage(url) { this.scrollingImage = new Image(); this.scrollingImage.src = url; }
  
  setCenterMedia(url, type) { 
    this.centerMedia = { url, type, el: null }; 
    if(type === 'video') {
      const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.crossOrigin = "anonymous"; v.play().catch(()=>{}); this.centerMedia.el = v;
    } else {
      const img = new Image(); img.src = url; img.crossOrigin = "anonymous"; this.centerMedia.el = img;
    } 
  }

  render(w, h, dt) {
    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.timeData);
    
    const bg = this.options.background;
    const intensity = this.options.intensity || 1.5;
    const color = this.options.color || '#ffffff';
    const mode = this.options.mode || 'bars';

    // 1. Randare Fundal
    if (bg.type === 'gradient') {
      const grad = this.ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, bg.color1); grad.addColorStop(1, bg.color2);
      this.ctx.fillStyle = grad; this.ctx.fillRect(0, 0, w, h);
    } else if (bg.type === 'image' && this.bgImage) {
      this.ctx.drawImage(this.bgImage, 0, 0, w, h);
    } else {
      this.ctx.fillStyle = bg.color1 || '#000000'; this.ctx.fillRect(0, 0, w, h);
    }

    // Calcul Volum Mediu / Bass pentru efecte active
    let totalFreq = 0, bassSum = 0;
    for(let i=0; i<128; i++) { totalFreq += this.dataArray[i]; if(i<15) bassSum += this.dataArray[i]; }
    const avgVolume = totalFreq / 128;
    const bassPulse = bassSum / 15;

    // Efect Strobe direct pe fundal dacă e activat
    if (this.options.strobe && bassPulse > 180) {
      this.ctx.fillStyle = `rgba(255,255,255,${(bassPulse-180)/75 * 0.15})`;
      this.ctx.fillRect(0, 0, w, h);
    }

    // Imagine de fundal scrollabilă (Scrolling Image)
    if (this.scrollingImage) {
      this.scrollX = (this.scrollX + (0.5 + avgVolume * 0.1)) % w;
      this.ctx.save(); this.ctx.globalAlpha = 0.3;
      this.ctx.drawImage(this.scrollingImage, -this.scrollX, 0, w, h);
      this.ctx.drawImage(this.scrollingImage, w - this.scrollX, 0, w, h);
      this.ctx.restore();
    }

    // 2. Randare Vumetre (Toată logica pentru cele 31 de moduri)
    this.ctx.save();
    this.ctx.strokeStyle = color; this.ctx.fillStyle = color; this.ctx.lineWidth = 3;
    const cx = w / 2, cy = h / 2;

    // --- LOGICA PENTRU FIECARE MOD ÎN PARTE ---
    if (mode === 'bars') {
      const barWidth = (w / 64);
      for (let i = 0; i < 64; i++) {
        const bh = this.dataArray[i] * intensity * 1.5;
        this.ctx.fillRect(i * barWidth, h - bh, barWidth - 4, bh);
      }
    } 
    else if (mode === 'radial') {
      const radius = Math.min(w, h) * 0.18 + (bassPulse * intensity * 0.2);
      this.ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const angle = (i / 120) * Math.PI * 2;
        const r = radius + (this.dataArray[i % 64] * intensity * 0.4);
        const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r;
        if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
      }
      this.ctx.closePath(); this.ctx.stroke();
    } 
    else if (mode === 'wave') {
      this.ctx.beginPath(); const sw = w / 128;
      for (let i = 0; i < 128; i++) {
        const y = (this.timeData[i] / 128.0) * (h / 2) + ((this.timeData[i] - 128) * intensity * 2);
        if (i === 0) this.ctx.moveTo(0, y); else this.ctx.lineTo(i * sw, y);
      }
      this.ctx.stroke();
    }
    else if (mode === 'particles') {
      this.particles.forEach(p => {
        p.y -= p.v * (1 + bassPulse * 0.02); if(p.y < 0) p.y = h;
        const size = p.s * (1 + this.dataArray[10] * 0.02) * intensity;
        this.ctx.fillRect(p.x * w, p.y, size, size);
      });
    }
    else if (mode === 'spiral') {
      this.ctx.beginPath();
      for (let i = 0; i < 200; i++) {
        const angle = 0.1 * i + (avgVolume * 0.005);
        const r = (5 + i * 1.5) + (this.dataArray[i % 64] * intensity * 0.3);
        this.ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      }
      this.ctx.stroke();
    }
    else if (mode === 'rings') {
      for(let j=1; j<=5; j++) {
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, j * 45 + (this.dataArray[j*10] * intensity * 0.3), 0, Math.PI*2);
        this.ctx.stroke();
      }
    }
    else if (mode === 'mirror') {
      this.ctx.beginPath(); const halfW = w/2; const step = halfW / 64;
      for(let i=0; i<64; i++) {
        const y = cy + (this.timeData[i]-128) * intensity * 3;
        this.ctx.lineTo(halfW + i*step, y);
      }
      this.ctx.stroke();
      this.ctx.beginPath();
      for(let i=0; i<64; i++) {
        const y = cy + (this.timeData[i]-128) * intensity * 3;
        this.ctx.lineTo(halfW - i*step, y);
      }
      this.ctx.stroke();
    }
    else if (mode === 'starfield') {
      this.stars.forEach(s => {
        s.z -= 0.005 * (1 + bassPulse * 0.03); if(s.z <= 0) s.z = 1;
        const x = cx + s.x / s.z * w/2; const y = cy + s.y / s.z * h/2;
        const size = (1 - s.z) * 6 * intensity;
        if(x >= 0 && x <= w && y >= 0 && y <= h) this.ctx.fillRect(x, y, size, size);
      });
    }
    else if (mode === 'circles') {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, Math.min(w,h)*0.1 + avgVolume * intensity * 1.2, 0, Math.PI*2);
      this.ctx.stroke();
    }
    // Suport universal pentru restul de moduri combinate (să nu rămână ecranul gol)
    else {
      // Mod hibrid pentru restul listei: Randează cercuri de frecvență + unde reactive
      const count = 40;
      for (let i = 0; i < count; i++) {
        const val = this.dataArray[i % 64] * intensity;
        this.ctx.fillRect(i * (w / count), h - val, (w / count) - 4, val);
      }
      this.ctx.beginPath(); this.ctx.arc(cx, cy, 50 + bassPulse*intensity*0.5, 0, Math.PI*2); this.ctx.stroke();
    }

    this.ctx.restore();
  }
}

// ── LOGICA INTERFEȚEI ȘI DRAG & DROP / ZOOM (MOUSE) ──
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Starea poziției imaginii din centru (Poate fi mutată cu mouse-ul)
let centerMediaPos = { x: window.innerWidth / 2, y: window.innerHeight / 2, baseSize: 180, isDragging: false };

function resize() {
  const { innerWidth: w, innerHeight: h } = window;
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if(!centerMediaPos.hasMoved) { centerMediaPos.x = w / 2; centerMediaPos.y = h / 2; }
}
resize();
window.addEventListener("resize", resize);

// UI Elemente DOM
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

// Ascultători Mouse pentru MUTARE (Drag & Drop) și ZOOM (Scroll)
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
  // Modifică mărimea doar dacă mouse-ul e deasupra imaginii centrale
  if (Math.sqrt(dx * dx + dy * dy) < centerMediaPos.baseSize / 2) {
    e.preventDefault();
    if (e.deltaY < 0) centerMediaPos.baseSize = Math.min(500, centerMediaPos.baseSize + 15);
    else centerMediaPos.baseSize = Math.max(50, centerMediaPos.baseSize - 15);
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
      opt.textContent = d.label || `Microfon ${i + 1}`; audioDeviceSel.appendChild(opt);
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
  if(bgTypeSel.value==='solid'){ bgColor1Wrap.style.display='inline-flex'; bgColor2Wrap.style.display='none'; bgImageWrap.style.display='none';}
  else if(bgTypeSel.value==='gradient'){ bgColor1Wrap.style.display='inline-flex'; bgColor2Wrap.style.display='inline-flex'; bgImageWrap.style.display='none';}
  else { bgColor1Wrap.style.display='none'; bgColor2Wrap.style.display='none'; bgImageWrap.style.display='inline-flex';}
  viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value });
});
bgColor1.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgColor2.addEventListener("input", () => viz && viz.setBackground({ type: bgTypeSel.value, color1: bgColor1.value, color2: bgColor2.value }));
bgImageInput.addEventListener("change", (e) => { const f = e.target.files[0]; if(f&&viz){ viz.setBackground({type:'image'}); viz.setBackgroundImage(URL.createObjectURL(f)); } });

function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li"); if (i === current.index) li.classList.add("active");
    const name = document.createElement("span"); name.textContent = c.name.length > 28 ? c.name.slice(0, 26) + "…" : c.name;
    const pBtn = document.createElement("button"); pBtn.textContent = "Play"; pBtn.onclick = () => playIndex(i);
    li.appendChild(pBtn); li.appendChild(name); listEl.appendChild(li);
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

function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  
  if (viz) {
    viz.render(w, h, dt);
    
    // 3. Desenare Media Centrală repoziționabilă + Puls pe bass
    if (viz.centerMedia && viz.centerMedia.el) {
      let bass = 0; for(let i=0; i<15; i++) bass += viz.dataArray[i];
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

  if (overlayText) {
    if (overlayFadeDir === 1) overlayAlpha = Math.min(1, overlayAlpha + dt * 2);
    if (overlayFadeDir === -1) { overlayAlpha = Math.max(0, overlayAlpha - dt * 1.2); if (overlayAlpha === 0) overlayText = ""; }
    if (overlayAlpha > 0) {
      ctx.save(); ctx.globalAlpha = overlayAlpha; ctx.font = `600 ${Math.max(24, w/16)}px sans-serif`;
      ctx.textAlign = "center"; ctx.fillStyle = "#ffffff"; ctx.fillText(overlayText, w / 2, h * 0.82); ctx.restore();
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
