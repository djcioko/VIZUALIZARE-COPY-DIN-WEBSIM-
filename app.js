// ── CONTEXT AUDIO ȘI STATICE ──
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

// UI DOM Elementele
const fileInput = document.getElementById("file-input");
const listEl = document.getElementById("clip-list");
const btnPlay = document.getElementById("playpause");
const btnStop = document.getElementById("stop");
const btnPrev = document.getElementById("prev");
const btnNext = document.getElementById("next");
const modeSel = document.getElementById("mode");
const intensityEl = document.getElementById("intensity");
const colorInput = document.getElementById("viz-color");
const audioDeviceSel = document.getElementById("audio-device");
const btnMicListen = document.getElementById("mic-listen");
const overlayTextInput = document.getElementById("overlay-text");
const btnApplyText = document.getElementById("apply-text");
const trackDisplay = document.getElementById("current-track-display");
const bgTypeSel = document.getElementById("bg-type");
const bgColor1 = document.getElementById("bg-color1");
const bgColor2 = document.getElementById("bg-color2");
const imageInput = document.getElementById("image-input");
const btnClearPlaylist = document.getElementById("clear-playlist");

let ac = null, analyser = null, gainNode = null;
let current = { index: -1, audio: null, sourceNode: null };
let clips = []; // Memoria temporară a playlistului curent

let micStream = null, micSource = null, micListening = false;
let overlayText = "";
let centerMedia = null;
let playing = false;

// ── SALVAREA AUTOMATĂ ÎN BROWSER (Ține minte playlistul când închizi/deschizi aplicația) ──
function savePlaylistToStorage() {
  const meta = clips.map(c => ({ name: c.name, isVideo: c.isVideo }));
  localStorage.setItem("visualizer_playlist", JSON.stringify(meta));
}

function loadPlaylistFromStorage() {
  const stored = localStorage.getItem("visualizer_playlist");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      parsed.forEach(item => {
        // Pentru fișierele salvate la restart punem un placeholder (utilizatorul le poate redeclanșa direct)
        clips.push({ name: item.name, url: "", isVideo: item.isVideo, isPlaceholder: true });
      });
      renderList();
      if (clips.length > 0) {
        current.index = 0;
        trackDisplay.textContent = `Aplicație repornită. Am recuperat ${clips.length} piese.`;
      }
    } catch(e) { console.error("Eroare la restaurarea playlistului", e); }
  }
}

// Curățare memorie salvată
btnClearPlaylist.addEventListener("click", () => {
  localStorage.removeItem("visualizer_playlist");
  stopAllMediaClips();
  stopMicHardware();
  clips = [];
  current.index = -1;
  renderList();
  trackDisplay.textContent = "Memoria salvată a fost ștearsă.";
});

// ── LOGICA DE INITIALIZARE AUDIO PENTRU SUND/MICROFON/URMĂRIRE VIZUALĂ ──
function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  analyser = ac.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;
  
  gainNode = ac.createGain();
  gainNode.gain.value = 1.0;
  
  gainNode.connect(analyser);
  analyser.connect(ac.destination);
}

// ── CITIREA ȘI SCHIMBAREA DISPOZITIVELOR AUDIO DIN LAPTOP (Stereo Mix, Mic, Line In) ──
async function updateLaptopAudioSources() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    
    audioDeviceSel.innerHTML = "";
    if (audioInputs.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Nu s-au găsit plăci/surse audio";
      audioDeviceSel.appendChild(opt);
      return;
    }

    audioInputs.forEach((device, index) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Sursă Audio Intrare ${index + 1}`;
      audioDeviceSel.appendChild(opt);
    });
  } catch (err) {
    console.error("Eroare la citirea listei de hardware audio: ", err);
  }
}

async function startMicStream() {
  initAudio();
  if (ac.state === "suspended") await ac.resume();
  stopAllMediaClips();

  try {
    // Cerem permisiune expresă browserului pentru a debloca securitatea
    const initialStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await updateLaptopAudioSources(); // Încărcăm numele reale (Stereo Mix, etc.)
    initialStream.getTracks().forEach(t => t.stop()); // Închidem instanța temporară

    const chosenId = audioDeviceSel.value;
    const constraints = { audio: chosenId ? { deviceId: { exact: chosenId } } : true };

    micStream = await navigator.mediaDevices.getUserMedia(constraints);
    micSource = ac.createMediaStreamSource(micStream);
    micSource.connect(analyser); // Conectăm direct la analizatorul vizualizatorului

    micListening = true;
    playing = true;
    btnMicListen.textContent = "🛑 Stop Mic";
    btnMicListen.classList.add("active");
    
    const currentSourceName = audioDeviceSel.options[audioDeviceSel.selectedIndex]?.textContent || "Sursă activă";
    trackDisplay.textContent = `Sursă Laptop Conectată: ${currentSourceName}`;
  } catch (err) {
    alert("Trebuie să acorzi permisiunea pentru microfon/audio în browser pentru a prelua sunetul din laptop!");
    console.error(err);
  }
}

btnMicListen.addEventListener("click", () => {
  if (micListening) {
    stopMicHardware();
    trackDisplay.textContent = "Sursă: Microfon oprit.";
  } else {
    startMicStream();
  }
});

audioDeviceSel.addEventListener("change", () => {
  if (micListening) {
    stopMicHardware();
    startMicStream();
  }
});

function stopMicHardware() {
  if (micSource) { micSource.disconnect(); micSource = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  micListening = false;
  btnMicListen.textContent = "🎤 Listen Mic";
  btnMicListen.classList.remove("active");
}

function stopAllMediaClips() {
  if (current.audio) {
    current.audio.pause();
    try { current.audio.currentTime = 0; } catch(e){}
  }
  playing = false;
  btnPlay.textContent = "Play";
}

// ── PLAYLIST / ADĂUGARE MELODII DIRECTE ȘI RENDERING CONTROL ──
function addClip(file) {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video") || /\.mp4$/i.test(file.name);
  
  // Verificăm dacă nu cumva înlocuim un placeholder restaurat anterior cu același nume
  const existingIdx = clips.findIndex(c => c.name === file.name && c.isPlaceholder);
  if (existingIdx !== -1) {
    clips[existingIdx] = { name: file.name, url, isVideo, isPlaceholder: false };
  } else {
    clips.push({ name: file.name, url, isVideo, isPlaceholder: false });
  }

  savePlaylistToStorage();
  renderList();
  if (current.index === -1) current.index = 0;
}

fileInput.addEventListener("change", (e) => {
  initAudio();
  Array.from(e.target.files || []).forEach(addClip);
  fileInput.value = "";
});

function renderList() {
  listEl.innerHTML = "";
  clips.forEach((clip, i) => {
    const li = document.createElement("li");
    if (i === current.index && !micListening) li.classList.add("active");
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = clip.name.length > 22 ? clip.name.slice(0, 20) + "…" : clip.name;
    if (clip.isPlaceholder) nameSpan.style.opacity = "0.5"; // Semnalăm vizual că e salvată din sesiunea trecută
    li.appendChild(nameSpan);

    const actionWrap = document.createElement("div");
    actionWrap.style.display = "inline-flex";
    actionWrap.style.gap = "6px";
    actionWrap.style.marginLeft = "12px";

    // Buton mic PLAY în dreapta piesei
    const itemPlay = document.createElement("button");
    itemPlay.textContent = "▶";
    itemPlay.style.padding = "2px 6px";
    itemPlay.style.fontSize = "11px";
    itemPlay.style.cursor = "pointer";
    itemPlay.addEventListener("click", () => {
      if (clip.isPlaceholder) {
        alert("Piesa a fost reținută la restart! Te rugăm să folosești '+ Add Clip' pentru a reîncărca fișierul audio fizic.");
        return;
      }
      stopMicHardware();
      playIndex(i);
    });

    // Buton mic STOP în dreapta piesei
    const itemStop = document.createElement("button");
    itemStop.textContent = "⏹";
    itemStop.style.padding = "2px 6px";
    itemStop.style.fontSize = "11px";
    itemStop.style.color = "#ff6b6b";
    itemStop.style.cursor = "pointer";
    itemStop.addEventListener("click", () => {
      if (current.index === i) {
        stopAllMediaClips();
        trackDisplay.textContent = "Piesă oprită.";
      }
    });

    actionWrap.appendChild(itemPlay);
    actionWrap.appendChild(itemStop);
    li.appendChild(actionWrap);
    listEl.appendChild(li);
  });
}

async function playIndex(index) {
  initAudio();
  const clip = clips[index];
  if (!clip || clip.isPlaceholder) return;

  stopAllMediaClips();

  const media = clip.isVideo ? document.createElement("video") : new Audio();
  media.src = clip.url;
  media.crossOrigin = "anonymous";
  media.preload = "auto";
  media.loop = false;
  
  media.addEventListener("ended", () => { btnNext.click(); });

  if (current.sourceNode) { try { current.sourceNode.disconnect(); } catch(e){} }
  
  const srcNode = ac.createMediaElementSource(media);
  srcNode.connect(gainNode);

  try {
    if (ac.state === "suspended") await ac.resume();
    await media.play();
    playing = true;
    btnPlay.textContent = "Pause";
    trackDisplay.textContent = `Sursă Activă: ${clip.name}`;
  } catch(err) {
    console.error("Eroare redare: ", err);
  }

  current.index = index;
  current.audio = media;
  current.sourceNode = srcNode;
  renderList();
}

// Controale principale bară de sus
btnPlay.addEventListener("click", () => {
  initAudio();
  if (!clips.length) return;
  if (micListening) stopMicHardware();

  if (!playing) {
    if (current.audio) {
      current.audio.play();
      playing = true;
      btnPlay.textContent = "Pause";
    } else {
      playIndex(current.index !== -1 ? current.index : 0);
    }
  } else {
    if (current.audio) current.audio.pause();
    playing = false;
    btnPlay.textContent = "Play";
  }
});

btnStop.addEventListener("click", () => { stopAllMediaClips(); stopMicHardware(); trackDisplay.textContent = "Toate sursele oprite."; });
btnPrev.addEventListener("click", () => { if (clips.length) playIndex((current.index - 1 + clips.length) % clips.length); });
btnNext.addEventListener("click", () => { if (clips.length) playIndex((current.index + 1) % clips.length); });

imageInput.addEventListener("change", (e) => {
  initAudio();
  const file = e.target.files[0];
  if (file) {
    const u = URL.createObjectURL(file);
    if (file.type.startsWith("video")) {
      const v = document.createElement('video'); v.src = u; v.loop = true; v.muted = true; v.play().catch(()=>{});
      centerMedia = { el: v, type: 'video' };
    } else {
      const img = new Image(); img.src = u;
      centerMedia = { el: img, type: 'image' };
    }
  }
});

btnApplyText.addEventListener("click", () => { overlayText = overlayTextInput.value.trim(); });

// ── BLOC DESENARE ȘI REDARE GRAFICĂ PE CANVAS (Frecvențe audio live) ──
const dataArray = new Uint8Array(512);

function draw(t) {
  requestAnimationFrame(draw);
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  // Render fundal
  if (bgTypeSel.value === 'gradient') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, bgColor1.value);
    grad.addColorStop(1, bgColor2.value);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = bgColor1.value;
  }
  ctx.fillRect(0, 0, w, h);

  // Dacă avem sunet activ, citim datele din analizator
  if (analyser && (playing || micListening)) {
    analyser.getByteFrequencyData(dataArray);
  } else {
    dataArray.fill(0); // Linie moartă dacă nu e semnal
  }

  const mode = modeSel.value;
  const intensity = parseFloat(intensityEl.value);
  ctx.strokeStyle = colorInput.value;
  ctx.fillStyle = colorInput.value;
  ctx.lineWidth = 3;

  if (mode === 'radial') {
    // MOD VIZUAL RADIAL (Cerc reactiv în centru)
    const centerX = w / 2;
    const centerY = h / 2;
    let sum = 0; for(let i=0; i<60; i++) sum += dataArray[i];
    const baseRadius = Math.min(w, h) * 0.16 + ((sum / 60) * intensity * 0.3);
    
    ctx.beginPath();
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      const v = dataArray[i % 128] * intensity * 0.4;
      const r = baseRadius + v;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (mode === 'wave') {
    // MOD VIZUAL WAVEFORM (Undă continuă)
    if (analyser && (playing || micListening)) analyser.getByteTimeDomainData(dataArray);
    ctx.beginPath();
    const sliceWidth = w / 128;
    let x = 0;
    for (let i = 0; i < 128; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h / 2) + ((v - 1) * intensity * 40);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  } else {
    // MOD VIZUAL STANDARD: BARS (Bare verticale de frecvență)
    const barsCount = 45;
    const barWidth = (w / barsCount);
    let x = 0;
    for (let i = 0; i < barsCount; i++) {
      const barHeight = dataArray[i] * intensity * 1.4;
      ctx.fillRect(x, h - barHeight, barWidth - 5, barHeight);
      x += barWidth;
    }
  }

  // Desenare Media Centru (Imagine reactivă la bass)
  if (centerMedia && centerMedia.el) {
    let bassSum = 0; for(let i=0; i<20; i++) bassSum += dataArray[i];
    const pulse = 1 + (bassSum / 20 / 255) * 0.15 * intensity;
    const size = Math.min(w, h) * 0.24 * pulse;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(w/2, h/2, size/2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(centerMedia.el, w/2 - size/2, h/2 - size/2, size, size);
    ctx.restore();
  }

  // Text adăugat deasupra
  if (overlayText) {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(overlayText, w/2, h - 60);
    ctx.restore();
  }
}

// Pornire automată la încărcarea paginii
loadPlaylistFromStorage();
requestAnimationFrame(draw);
