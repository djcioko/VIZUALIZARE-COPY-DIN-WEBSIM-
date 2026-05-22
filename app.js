// Application State
const state = {
  audioContext: null,
  analyser: null,
  dataArray: null,
  bufferLength: 0,
  playlist: [],
  currentIndex: -1,
  isPlaying: false,
  mediaElement: null,
  sourceNode: null,
  
  // Custom Layer Assets
  centerMedia: null,
  scrollImage: null,
  bgImage: null,
  pickles: [], // For "Add Pickle" Easter egg/feature
  suggestions: [],

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
const addPickleBtn = document.getElementById('add-pickle');

// Handle Window Resizing
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialise Audio Context on User Interactivity
function initAudio() {
  if (state.audioContext) return;
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 512; // Controls frequency resolution
  state.bufferLength = state.analyser.frequencyBinCount;
  state.dataArray = new Uint8Array(state.bufferLength);
}

// Playlist & Media Pipeline Management
fileInput.addEventListener('change', (e) => {
  initAudio();
  const files = Array.from(e.target.files);
  files.forEach(file => {
    const url = URL.createObjectURL(file);
    state.playlist.push({ name: file.name, url: url, type: file.type });
  });
  updatePlaylistUI();
  if (state.currentIndex === -1 && state.playlist.length > 0) {
    loadTrack(0);
  }
});

function updatePlaylistUI() {
  clipListUI.innerHTML = '';
  state.playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = track.name.length > 25 ? track.name.substring(0, 25) + '...' : track.name;
    if (index === state.currentIndex) li.classList.add('active');
    li.addEventListener('click', () => loadTrack(index));
    clipListUI.appendChild(li);
  });
}

function loadTrack(index) {
  if (index < 0 || index >= state.playlist.length) return;
  
  if (state.mediaElement) {
    state.mediaElement.pause();
    state.mediaElement.remove();
  }

  state.currentIndex = index;
  const track = state.playlist[index];

  // Dynamically determine whether asset is audio or video
  const isVideo = track.type.startsWith('video');
  state.mediaElement = document.createElement(isVideo ? 'video' : 'audio');
  state.mediaElement.src = track.url;
  state.mediaElement.crossOrigin = "anonymous";
  
  // Connect elements to Web Audio graph
  if (state.sourceNode) state.sourceNode.disconnect();
  state.sourceNode = state.audioContext.createMediaElementSource(state.mediaElement);
  state.sourceNode.connect(state.analyser);
  state.analyser.connect(state.audioContext.destination);

  updatePlaylistUI();
  
  if (state.isPlaying) {
    state.mediaElement.play().catch(err => console.log("Playback interrupted:", err));
  }
}

// Playback Control Event Listeners
playPauseBtn.addEventListener('click', () => {
  initAudio();
  if (!state.mediaElement && state.playlist.length > 0) loadTrack(0);
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

prevBtn.addEventListener('click', () => { if (state.currentIndex > 0) loadTrack(state.currentIndex - 1); });
nextBtn.addEventListener('click', () => { if (state.currentIndex < state.playlist.length - 1) loadTrack(state.currentIndex + 1); });

// Component Sync Listeners
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

// Image Processing Setup
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

// Feature Hooks
addPickleBtn.addEventListener('click', () => {
  state.pickles.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    speed: 1 + Math.random() * 3,
    size: 20 + Math.random() * 40
  });
});

// Master Render Engine Loop
function render() {
  requestAnimationFrame(render);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  let audioLevel = 0;

  if (state.analyser && state.isPlaying) {
    state.analyser.getByteFrequencyData(state.dataArray);
    let sum = 0;
    for (let i = 0; i < state.bufferLength; i++) sum += state.dataArray[i];
    audioLevel = (sum / state.bufferLength) / 255; // Normalized value between 0 and 1
  }

  // --- Step 1: Background Layout Drawing ---
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

  // Optional Visual Modifications: Strobe
  if (state.strobe && audioLevel > 0.5) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(audioLevel - 0.5) * 0.2})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // --- Step 2: Custom Layer Animations ---
  if (state.scrollImage) {
    let scrollSpeed = (audioLevel * 10) + 1;
    if (!state.scrollX) state.scrollX = 0;
    state.scrollX = (state.scrollX + scrollSpeed) % canvas.width;
    ctx.globalAlpha = 0.3;
    ctx.drawImage(state.scrollImage, state.scrollX - canvas.width, 0, canvas.width, canvas.height);
    ctx.drawImage(state.scrollImage, state.scrollX, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }

  // --- Step 3: Math Visualizer Mode Calculations ---
  const currentMode = modeSelect.value;
  ctx.strokeStyle = state.color;
  ctx.fillStyle = state.color;
  ctx.lineWidth = 2;

  if (state.analyser) {
    const bars = state.bufferLength;
    const barWidth = canvas.width / bars;

    // Standard Bars Mode Blueprint
    if (currentMode === 'bars' || currentMode.includes('bars')) {
      for (let i = 0; i < bars; i++) {
        let height = state.dataArray[i] * state.intensity;
        ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
      }
    }

    // Radial Mode Blueprint
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

    // Standard Waveform Mode Blueprint
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
    
    // Fallback logic structure for unresolved niche visual patterns
    if (!['bars', 'radial', 'wave'].some(m => currentMode.includes(m))) {
      // Renders generic clean geometry for complex experimental values
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50 + (audioLevel * 150), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // --- Step 4: Overlay & Floating Objects Layer ---
  state.pickles.forEach(pickle => {
    pickle.y += pickle.speed + (audioLevel * 5);
    if (pickle.y > canvas.height) pickle.y = -pickle.size;
    
    ctx.fillStyle = '#4EF05D';
    ctx.beginPath();
    ctx.ellipse(pickle.x, pickle.y, pickle.size / 2, pickle.size, 0, 0, Math.PI * 2);
    ctx.fill();
  });

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

// Start Main Rendering Loop
render();
