const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

// Stările pentru elementele interactive (Mutare cu mouse-ul / Drag)
let centerMedia = null;
let centerPos = { x: window.innerWidth / 2, y: window.innerHeight / 2, size: 180, isDragging: false };
let textPos = { x: window.innerWidth / 2, y: window.innerHeight * 0.75, isDragging: false };
let dragTarget = null; // 'media' sau 'text'

function resize() {
  const { innerWidth: w, innerHeight: h } = window;
  canvas.style.width = w + "px"; canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (centerPos.x === 0 && centerPos.y === 0) { centerPos.x = w / 2; centerPos.y = h / 2; }
}
window.addEventListener("resize", resize);
resize();

// Elemente DOM
const fileInput = document.getElementById("file-input");
const listEl = document.getElementById("clip-list");
const btnPlay = document.getElementById("playpause");
const btnStop = document.getElementById("stop");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");
const modeSel = document.getElementById("mode");
const intensityEl = document.getElementById("intensity");
const colorInput = document.getElementById("viz-color");
const imageInput = document.getElementById("image-input");
const audioDeviceSel = document.getElementById("audio-device");
const btnMicListen = document.getElementById("mic-listen");
const overlayTextInput = document.getElementById("overlay-text");
const textSizeInput = document.getElementById("text-size");

// Audio Core
let ac, analyser, gainNode, dataArray, timeData;
let current = { index: -1, audio: null };
const clips = [];
let micStream = null, micSource = null, micListening = false;

// Particule pre-generate pentru moduri vizuale
let particles = [], stars = [];
for(let i=0; i<100; i++) {
  particles.push({ x: Math.random(), y: Math.random(), v: Math.random() * 2 + 0.5, r: Math.random() * 3 + 1 });
  stars.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() });
}

function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;
  
  gainNode = ac.createGain();
  gainNode.connect(analyser);
  analyser.connect(ac.destination);

  dataArray = new Uint8Array(analyser.frequencyBinCount);
  timeData = new Uint8Array(analyser.frequencyBinCount);
}

// Scanează hardware-ul pentru a găsi plăcile de sunet și microfoanele
async function scanAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    
    audioDeviceSel.innerHTML = "";
    audioInputs.forEach((device, index) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Intrare Microfon ${index + 1}`;
      audioDeviceSel.appendChild(opt);
    });
  } catch (err) {
    console.warn("Nu s-au putut lista microfoanele: ", err);
  }
}
scanAudioDevices();
navigator.mediaDevices.addEventListener("devicechange", scanAudioDevices);

// Pornire / Oprire Microfon direct
btnMicListen.addEventListener("click", async () => {
  initAudio();
  if (ac.state === "suspended") await ac.resume();

  if (micListening) {
    if (micSource) micSource.disconnect();
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micListening = false;
    btnMicListen.textContent = "🎤 Start Mic";
    return;
  }

  const config = { audio: audioDeviceSel.value ? { deviceId: { exact: audioDeviceSel.value } } : true };
  try {
    micStream = await navigator.mediaDevices.getUserMedia(config);
    micSource = ac.createMediaStreamSource(micStream);
    micSource.connect(gainNode);
    micListening = true;
    btnMicListen.textContent = "🛑 Stop Mic";
  } catch (err) {
    alert("Eroare activare microfon: " + err.message);
  }
});

// Drag and Drop (Mutare pe ecran pentru Imagine și Text)
window.addEventListener("mousedown", (e) => {
  const mx = e.clientX; const my = e.clientY;
  
  // Verifică dacă am dat click pe imaginea centrală
  const distMedia = Math.sqrt((mx - centerPos.x)**2 + (my - centerPos.y)**2);
  if (centerMedia && distMedia < centerPos.size / 2) {
    dragTarget = 'media';
    return;
  }

  // Verifică dacă am dat click pe text (aproximativ pe baza mărimii fontului)
  const size = parseInt(textSizeInput.value);
  if (mx > textPos.x - 150 && mx < textPos.x + 150 && my > textPos.y - size && my < textPos.y + 10) {
    dragTarget = 'text';
  }
});

window.addEventListener("mousemove", (e) => {
  if (!dragTarget) return;
  if (dragTarget === 'media') {
    centerPos.x = e.clientX; centerPos.y = e.clientY;
  } else if (dragTarget === 'text') {
    textPos.x = e.clientX; textPos.y = e.clientY;
  }
});

window.addEventListener("mouseup", () => { dragTarget = null; });

// Mărire/Micșorare Imagine Centrală folosind rotița de la mouse (Zoom Wheel)
window.addEventListener("wheel", (e) => {
  const distMedia = Math.sqrt((e.clientX - centerPos.x)**2 + (e.clientY - centerPos.y)**2);
  if (centerMedia && distMedia < centerPos.size / 2) {
    e.preventDefault();
    if (e.deltaY < 0) centerPos.size = Math.min(500, centerPos.size + 15);
    else centerPos.size = Math.max(50, centerPos.size - 15);
  }
}, { passive: false });

// Playlist Logic & Clips
function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li");
    if (i === current.index) li.classList.add("active");
    
    const label = document.createElement("span");
    label.textContent = c.name.length > 20 ? c.name.slice(0, 18) + "..." : c.name;
    li.appendChild(label);

    const pBtn = document.createElement("button"); pBtn.textContent = "▶";
    pBtn.onclick = (e) => { e.stopPropagation(); playIndex(i); };

    const sBtn = document.createElement("button"); sBtn.textContent = "⏹"; sBtn.style.color = "#ff6b6b";
    sBtn.onclick = (e) => { e.stopPropagation(); if (current.index === i) btnStop.click(); };

    li.appendChild(pBtn); li.appendChild(sBtn);
    listEl.appendChild(li);
  });
}

async function playIndex(idx) {
  initAudio();
  if (current.audio) { current.audio.pause(); }
  if (!clips[idx]) return;

  const clip = clips[idx];
  const audioEl = new Audio(clip.url);
  audioEl.crossOrigin = "anonymous";
  
  const source = ac.createMediaElementSource(audioEl);
  source.connect(gainNode);
  
  audioEl.addEventListener("ended", () => btnNext.click());
  await audioEl.play();
  
  current = { index: idx, audio: audioEl };
  btnPlay.textContent = "Pause";
  renderList();
}

fileInput.addEventListener("change", (e) => {
  Array.from(e.target.files).forEach(file => {
    clips.push({ name: file.name, url: URL.createObjectURL(file) });
  });
  renderList();
  if (current.index === -1) playIndex(0);
});

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    centerMedia = new Image();
    centerMedia.src = URL.createObjectURL(file);
  }
});

btnPlay.addEventListener("click", () => {
  if (!current.audio) return;
  if (current.audio.paused) { current.audio.play(); btnPlay.textContent = "Pause"; }
  else { current.audio.pause(); btnPlay.textContent = "Play"; }
});

btnStop.addEventListener("click", () => {
  if (current.audio) { current.audio.pause(); current.audio.currentTime = 0; }
  btnPlay.textContent = "Play";
});

btnPrev.addEventListener("click", () => { if(clips.length) playIndex((current.index - 1 + clips.length) % clips.length); });
btnNext.addEventListener("click", () => { if(clips.length) playIndex((current.index + 1) % clips.length); });

// Loop-ul Principal de Desene
function loop() {
  requestAnimationFrame(loop);
  
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  
  // Fundal Negru Curat
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  if (!analyser) return;
  
  analyser.getByteFrequencyData(dataArray);
  analyser.getByteTimeDomainData(timeData);

  const mode = modeSel.value;
  const intensity = parseFloat(intensityEl.value);
  const color = colorInput.value;

  // Calcul Puls Bass pentru imaginea centrală
  let bass = 0; for(let i=0; i<10; i++) bass += dataArray[i];
  const pulse = (bass / 10) / 255 * 35 * intensity;

  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;

  // ── RANDARE CELE 10 MODURI DE VUMETRE ──
  if (mode === "bars") {
    const bars = 40; const bWidth = w / bars;
    for(let i=0; i<bars; i++) {
      const bh = dataArray[i] * intensity * 1.5;
      ctx.fillRect(i * bWidth, h - bh, bWidth - 4, bh);
    }
  } 
  else if (mode === "radial") {
    ctx.beginPath(); const rad = 100 + pulse;
    for(let i=0; i<90; i++) {
      const angle = (i / 90) * Math.PI * 2;
      const r = rad + dataArray[i % 32] * intensity * 0.4;
      ctx.lineTo(centerPos.x + Math.cos(angle)*r, centerPos.y + Math.sin(angle)*r);
    }
    ctx.closePath(); ctx.stroke();
  }
  else if (mode === "wave") {
    ctx.beginPath(); const step = w / 64;
    for(let i=0; i<64; i++) {
      const y = (timeData[i] / 128) * (h / 2) + (timeData[i] - 128) * intensity;
      if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * step, y);
    }
    ctx.stroke();
  }
  else if (mode === "particles") {
    particles.forEach((p, idx) => {
      p.y -= p.v * (1 + (dataArray[idx % 16]/255)); if (p.y < 0) p.y = h;
      ctx.fillRect(p.x * w, p.y, p.r * intensity, p.r * intensity);
    });
  }
  else if (mode === "spiral") {
    ctx.beginPath();
    for(let i=0; i<120; i++) {
      const angle = 0.15 * i;
      const r = (5 + i * 1.5) + (dataArray[i % 16] * intensity * 0.3);
      ctx.lineTo(centerPos.x + Math.cos(angle)*r, centerPos.y + Math.sin(angle)*r);
    }
    ctx.stroke();
  }
  else if (mode === "rings") {
    for(let j=1; j<=4; j++) {
      ctx.beginPath();
      ctx.arc(centerPos.x, centerPos.y, j * 35 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  else if (mode === "mirror") {
    const half = w / 2; const step = half / 32;
    for(let i=0; i<32; i++) {
      const bh = dataArray[i] * intensity * 1.3;
      ctx.fillRect(half + i*step, h - bh, step - 2, bh);
      ctx.fillRect(half - i*step, h - bh, step - 2, bh);
    }
  }
  else if (mode === "circles") {
    ctx.beginPath();
    ctx.arc(centerPos.x, centerPos.y, 60 + (dataArray[5] * intensity), 0, Math.PI * 2);
    ctx.stroke();
  }
  else if (mode === "starfield") {
    stars.forEach(s => {
      s.z -= 0.005; if (s.z <= 0) s.z = 1;
      const x = centerPos.x + s.x / s.z * (w/2); const y = centerPos.y + s.y / s.z * (h/2);
      if(x >= 0 && x <= w && y >= 0 && y <= h) ctx.fillRect(x, y, (1-s.z)*6*intensity, (1-s.z)*6*intensity);
    });
  }
  else if (mode === "blobs") {
    ctx.beginPath();
    for(let i=0; i<40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const offset = Math.sin(angle * 5) * (dataArray[i % 16] * intensity * 0.2);
      const r = 110 + offset;
      ctx.lineTo(centerPos.x + Math.cos(angle)*r, centerPos.y + Math.sin(angle)*r);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();

  // ── DESENARE IMAGINE PE MIJLOC (Cu pulsare automată și poziție mutabilă) ──
  if (centerMedia && centerMedia.complete) {
    const currentSize = centerPos.size + pulse;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerPos.x, centerPos.y, currentSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(centerMedia, centerPos.x - currentSize / 2, centerPos.y - currentSize / 2, currentSize, currentSize);
    ctx.restore();
  }

  // ── DESENARE TEXT MUTABIL ──
  const textVal = overlayTextInput.value.trim();
  if (textVal) {
    const size = parseInt(textSizeInput.value) || 30;
    ctx.save();
    ctx.font = `600 ${size}px sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
    ctx.shadowBlur = 6;
    ctx.fillText(textVal, textPos.x, textPos.y);
    ctx.restore();
  }
}
requestAnimationFrame(loop);
