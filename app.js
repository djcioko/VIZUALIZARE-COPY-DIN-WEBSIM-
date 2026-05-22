// Application State
const state = {
  audioContext: null,
  analyser: null,
  dataArray: null,
  bufferLength: 0,
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  
  // Surse Audio active
  mediaElement: null,       // Pentru fișiere MP3/Video
  sourceNode: null,         // Nodul audio pentru fișiere
  streamSourceNode: null,   // Nodul audio pentru Microfon/SoundCard
  activeStream: null,       // Stream-ul hardware activ
  currentInputMode: 'files', // 'files' sau 'hardware'

  // Custom Layer Assets
  centerMedia: null,
  scrollImage: null,
  bgImage: null,

  // Configuration Sync
  intensity: 1.5,
  color: '#ffffff',
  strobe: true,
  bgType: 'solid',
  bgColor1: '#000000',
  bgColor2: '#202020'
};

// DOM Elements
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const fileInput = document.getElementById('file-input');
const clipListUI = document.getElementById('clip-list');
const playPauseBtn = document.getElementById('playpause');
const stopBtn = document.getElementById('stop');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const modeSelect = document.getElementById('mode');
const intensityInput = document.getElementById('intensity');
const colorInput = document.getElementById('viz-color');
const strobeInput = document.getElementById('strobe');
const bgTypeSelect = document.getElementById('bg-type');
const bgColor1Input = document.getElementById('bg-color1');
const bgColor2Input = document.getElementById('bg-color2');
const bgImageInput = document.getElementById('bg-image');
const imageInput = document.getElementById('image-input');
const scrollImageInput = document.getElementById('scroll-image');
const audioSourceSelect = document.getElementById('audio-source-select');
const trackDisplay = document.getElementById('current-track-display');

// Handle Window Resizing
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialise Audio Context & Analyser
function initAudio() {
  if (state.audioContext) return;
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 512;
  state.bufferLength = state.analyser.frequencyBinCount;
  state.dataArray = new Uint8Array(state.bufferLength);
}

// --- SECȚIUNEA HARDWARE (MICROFON / PLACĂ SUNET) ---
async function enumerateAudioDevices() {
  try {
    // Cerem permisiune temporară pentru a putea citi etichetele corecte ale dispozitivelor
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    // Resetăm select-ul dar păstrăm prima opțiune pentru fișiere
    audioSourceSelect.innerHTML = '<option value="files">Mode: File Playlist</option>';
    
    audioInputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Dispozitiv Audio (${device.deviceId.substring(0, 5)})`;
      audioSourceSelect.appendChild(option);
    });
  } catch (err) {
    console.warn("Permisiunea audio a fost refuzată sau nu există dispozitive capturate:", err);
    trackDisplay.textContent = "Sursă: Lipsă permisiuni microfon/sursă hardware.";
  }
}

// Schimbarea sursei (Fișiere vs Soundcard Hardware)
audioSourceSelect.addEventListener('change', async (e) => {
  initAudio();
  const val = e.target.value;

  // Oprim orice rulare anterioară hardware sau fișier
  stopAllSources();

  if (val === 'files') {
    state.currentInputMode = 'files';
    trackDisplay.textContent = state.currentIndex !== -1 ? `Sursă: ${state.playlist[state.currentIndex].name}` : "Sursă: Playlist Fișiere";
  } else {
    state.currentInputMode = 'hardware';
    try {
      state.activeStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: val } }
      });
      
      state.streamSourceNode = state.audioContext.createMediaStreamSource(state.activeStream);
      state.streamSourceNode.connect(state.analyser);
      state.audioContext.resume();
      
      state.isPlaying = true;
      playPauseBtn.textContent = 'Pause';
      trackDisplay.textContent = `Sursă Activă: ${audioSourceSelect.options[audioSourceSelect.selectedIndex].text}`;
    } catch (err) {
      console.error("Eroare la conectarea plăcii de sunet:", err);
      trackDisplay.textContent = "Eroare la activarea hardware-ului.";
    }
  }
});

// Încărcare inițială a listei de dispozitive la pornire
enumerateAudioDevices();


// --- SECȚIUNEA PLAYLIST ȘI FIȘIERE ---
fileInput.addEventListener('change', (e) => {
  initAudio();
  const files = Array.from(e.target.files);
  const wasEmpty = state.playlist.length === 0;

  files.forEach(file => {
    const url = URL.createObjectURL(file);
    state.playlist.push({ name: file.name, url: url, type: file.type });
  });

  updatePlaylistUI();

  // Corecție critică: dacă deja cânta ceva, nu modificăm piesa curentă și nu resetăm playlist-ul în mod haotic.
  if (wasEmpty && state.playlist.length > 0) {
    loadTrack(0, false); // Încarcă prima piesă dar NU îi da play automat direct.
  }
});

function updatePlaylistUI() {
  clipListUI.innerHTML = '';
  state.playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = track.name.length > 30 ? track.name.substring(0, 30) + '...' : track.name;
    if (index === state.currentIndex && state.currentInputMode === 'files') li.classList.add('active');
    
    // Schimbare piesă direct la click pe element în listă
    li.addEventListener('click', () => {
      audioSourceSelect.value = 'files';
      state.currentInputMode = 'files';
      loadTrack(index, true); // Încarcă și dă-i play imediat
    });
    clipListUI.appendChild(li);
  });
}

function loadTrack(index, autoPlay = false) {
  if (index < 0 || index >= state.playlist.length) return;
  
  stopAllSources();
  state.currentIndex = index;
  const track = state.playlist[index];

  const isVideo = track.type.startsWith('video');
  state.mediaElement = document.createElement(isVideo ? 'video' : 'audio');
  state.mediaElement.src = track.url;
  state.mediaElement.crossOrigin = "anonymous";
  
  state.sourceNode = state.audioContext.createMediaElementSource(state.mediaElement);
  state.sourceNode.connect(state.analyser);
  state.analyser.connect(state.audioContext.destination);

  updatePlaylistUI();
  trackDisplay.textContent = `Sursă: ${track.name}`;

  if (autoPlay || state.isPlaying) {
    state.audioContext.resume();
    state.mediaElement.play().catch(err => console.log("Playback blocked:", err));
    state.isPlaying = true;
    playPauseBtn.textContent = 'Pause';
  }
}

// Funcție dedicată de Stop pentru curățarea completă a stream-urilor și fișierelor
function stopAllSources() {
  // Oprește fișierul audio/video
  if (state.mediaElement) {
    state.mediaElement.pause();
    state.mediaElement.currentTime = 0; 
  }
  // Oprește stream-ul de microfon hardware ca să nu rămână ledul aprins la cameră/microfon
  if (state.activeStream) {
    state.activeStream.getTracks().forEach(track => track.stop());
    state.activeStream = null;
  }
  if (state.streamSourceNode) {
    state.streamSourceNode.disconnect();
    state.streamSourceNode = null;
  }
}

// Controale media standard
playPauseBtn.addEventListener('click', () => {
  initAudio();
  if (state.currentInputMode === 'hardware') return; // Pe microfon nu avem pauză clasică, dăm stop din butonul dedicat.

  if (!state.mediaElement && state.playlist.length > 0) loadTrack(0, true);
  if (!state.mediaElement) return;

  if (state.isPlaying) {
    state.mediaElement.pause();
    playPauseBtn.textContent = 'Play';
  } else {
    state.audioContext.resume();
    state.mediaElement.play();
    playPauseBtn.textContent = 'Pause';
  }
  state.isPlaying = !state.isPlaying;
});

// Evenimentul pentru butonul nou de STOP
stopBtn.addEventListener('click', () => {
  stopAllSources();
  state.isPlaying = false;
  playPauseBtn.textContent = 'Play';
  if (state.currentInputMode === 'hardware') {
    audioSourceSelect.value = 'files';
    state.currentInputMode = 'files';
  }
  trackDisplay.textContent = "Sursă: Oprită";
});

prevBtn.addEventListener('click', () => { 
  if (state.currentInputMode === 'files' && state.currentIndex > 0) {
    loadTrack(state.currentIndex - 1, true); 
  } 
});

nextBtn.addEventListener('click', () => { 
  if (state.currentInputMode === 'files' && state.currentIndex < state.playlist.length - 1) {
    loadTrack(state.currentIndex + 1, true); 
  } 
});

// Configurații vizuale
intensityInput.addEventListener('input', (e) => state.intensity = parseFloat(e.target.value));
colorInput.addEventListener('input', (e) => state.color = e.target.value);
strobeInput.addEventListener('change', (e) => state.strobe = e.target.checked);
bgTypeSelect.addEventListener('change', (e) => {
  state.bgType = e.target.value;
  toggleBgControls();
});
bgColor1Input.addEventListener('input', (e) => state.bgColor1 = e.target.value);
bgColor2Input.addEventListener('input', (e) => state.bgColor2 = e.target.value);

function toggleBgControls() {
  document.getElementById('bg-color1-wrap').style.display = state.bgType === 'image' ? 'none' : 'inline-flex';
  document.getElementById('bg-color2-wrap').style.display = state.bgType === 'gradient' ? 'inline-flex' : 'none';
  document.getElementById('bg-image-wrap').style.display = state.bgType === 'image' ? 'inline-flex' : 'none';
}
toggleBgControls();

function handleImageUpload(inputEl, stateKey) {
  inputEl.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => state[stateKey] = img;
    }
  });
}
handleImageUpload(bgImageInput, 'bgImage');
handleImageUpload(imageInput, 'centerMedia');
handleImageUpload(scrollImageInput, 'scrollImage');


// --- ENGINE-UL DE RENDER VIZUAL ---
function render() {
  requestAnimationFrame(render);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  let audioLevel = 0;

  if (state.analyser && state.isPlaying) {
    state.analyser.getByteFrequencyData(state.dataArray);
    let sum = 0;
    for (let i = 0; i < state.bufferLength; i++) sum += state.dataArray[i];
    audioLevel = (sum / state.bufferLength) / 255; 
  }

  // Desenare fundal
  if (state.bgType === 'solid') {
    ctx.fillStyle = state.bgColor1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.bgType === 'gradient') {
    let grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, state.bgColor1);
    grad.addColorStop(1, state.bgColor2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else if (state.bgType === 'image' && state.bgImage) {
    ctx.drawImage(state.bgImage, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.strobe && audioLevel > 0.5) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(audioLevel - 0.5) * 0.2})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.scrollImage) {
    let scrollSpeed = (audioLevel * 10) + 1;
    if (!state.scrollX) state.scrollX = 0;
    state.scrollX = (state.scrollX + scrollSpeed) % canvas.width;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(state.scrollImage, state.scrollX - canvas.width, 0, canvas.width, canvas.height);
    ctx.drawImage(state.scrollImage, state.scrollX, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Moduri Visualizer
  const currentMode = modeSelect.value;
  ctx.strokeStyle = state.color;
  ctx.fillStyle = state.color;
  ctx.lineWidth = 2;

  if (state.analyser && state.isPlaying) {
    const bars = state.bufferLength;
    const barWidth = canvas.width / bars;

    if (currentMode === 'bars' || currentMode.includes('bars')) {
      for (let i = 0; i < bars; i++) {
        let height = state.dataArray[i] * state.intensity;
        ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
      }
    }

    if (currentMode === 'radial' || currentMode.includes('radial')) {
      const radius = 100 + (audioLevel * 50);
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        let angle = (i / bars) * Math.PI * 2;
        let extRadius = radius + (state.dataArray[i] * state.intensity * 0.5);
        let x1 = centerX + Math.cos(angle) * radius;
        let y1 = centerY + Math.sin(angle) * radius;
        let x2 = centerX + Math.cos(angle) * extRadius;
        let y2 = centerY + Math.sin(angle) * extRadius;
        
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }

    if (currentMode === 'wave' || currentMode.includes('wave')) {
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        let x = i * barWidth;
        let y = centerY + (state.dataArray[i] - 128) * state.intensity;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    
    if (!['bars', 'radial', 'wave'].some(m => currentMode.includes(m))) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50 + (audioLevel * 150), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Imaginea Centrală
  if (state.centerMedia) {
    const size = 180 + (audioLevel * 40);
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(state.centerMedia, centerX - size / 2, centerY - size / 2, size, size);
    ctx.restore();
  }
}

render();
