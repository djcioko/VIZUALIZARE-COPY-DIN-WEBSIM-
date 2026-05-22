// Global State Architecture
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
  streamSourceNode: null,   
  activeStream: null,       
  currentInputMode: 'files', 

  centerMedia: null,
  scrollImage: null,
  bgImage: null,

  intensity: 1.5,
  color: '#ffffff',
  strobe: true,
  bgType: 'solid',
  bgColor1: '#000000',
  bgColor2: '#202020'
};

// DOM Mapping
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

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function initAudio() {
  if (state.audioContext) return;
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 512;
  state.bufferLength = state.analyser.frequencyBinCount;
  state.dataArray = new Uint8Array(state.bufferLength);
}

// Enumerate Microphones / Soundcards
async function enumerateAudioDevices() {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    
    audioSourceSelect.innerHTML = '<option value="files">Mode: File Playlist</option>';
    
    audioInputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Audio Device (${device.deviceId.substring(0, 5)})`;
      audioSourceSelect.appendChild(option);
    });
  } catch (err) {
    console.warn("Hardware permission blocked or unavailable:", err);
    trackDisplay.textContent = "Sursă: Lipsă permisiuni microfon (rulează doar pe https://)";
  }
}

audioSourceSelect.addEventListener('change', async (e) => {
  initAudio();
  const val = e.target.value;
  stopAllSources();

  if (val === 'files') {
    state.currentInputMode = 'files';
    state.isPlaying = false;
    playPauseBtn.textContent = 'Play';
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
      playPauseBtn.textContent = 'Streaming';
      trackDisplay.textContent = `Sursă Activă: ${audioSourceSelect.options[audioSourceSelect.selectedIndex].text}`;
    } catch (err) {
      console.error("Hardware connection failed:", err);
      trackDisplay.textContent = "Eroare la activarea hardware-ului.";
    }
  }
});

enumerateAudioDevices();

// File Integration Loop
fileInput.addEventListener('change', (e) => {
  initAudio();
  const files = Array.from(e.target.files);
  const wasEmpty = state.playlist.length === 0;

  files.forEach(file => {
    const url = URL.createObjectURL(file);
    state.playlist.push({ name: file.name, url: url, type: file.type });
  });

  updatePlaylistUI();

  if (wasEmpty && state.playlist.length > 0) {
    loadTrack(0, false); 
  }
});

function updatePlaylistUI() {
  clipListUI.innerHTML = '';
  state.playlist.forEach((track, index) => {
    const li = document.createElement('li');
    li.textContent = track.name.length > 30 ? track.name.substring(0, 30) + '...' : track.name;
    if (index === state.currentIndex && state.currentInputMode === 'files') li.classList.add('active');
    
    li.addEventListener('click', () => {
      audioSourceSelect.value = 'files';
      state.currentInputMode = 'files';
      loadTrack(index, true); 
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

  if (autoPlay) {
    state.audioContext.resume();
    state.mediaElement.play().catch(err => console.log("Playback engine exception:", err));
    state.isPlaying = true;
    playPauseBtn.textContent = 'Pause';
  } else {
    state.isPlaying = false;
    playPauseBtn.textContent = 'Play';
  }
}

function stopAllSources() {
  if (state.mediaElement) {
    state.mediaElement.pause();
    state.mediaElement.currentTime = 0; 
  }
  if (state.activeStream) {
    state.activeStream.getTracks().forEach(track => track.stop());
    state.activeStream = null;
  }
  if (state.streamSourceNode) {
    state.streamSourceNode.disconnect();
    state.streamSourceNode = null;
  }
}

playPauseBtn.addEventListener('click', () => {
  initAudio();
  if (state.currentInputMode === 'hardware') return; 

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

// --- 30+ MODES RENDER CORE MATRIX ---
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

  // Draw Background Layer
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

  const currentMode = modeSelect.value;
  ctx.strokeStyle = state.color;
  ctx.fillStyle = state.color;
  ctx.lineWidth = 2;

  if (state.analyser && state.isPlaying) {
    const bars = state.bufferLength;
    const barWidth = canvas.width / bars;

    // 1. BARS PATTERNS
    if (currentMode.includes('bars')) {
      for (let i = 0; i < bars; i++) {
        let height = state.dataArray[i] * state.intensity;
        if (currentMode === 'barswave') {
          ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
          let yWave = centerY + (state.dataArray[i] - 128) * state.intensity;
          ctx.fillRect(i * barWidth, yWave, 2, 2);
        } else {
          ctx.fillRect(i * barWidth, canvas.height - height, barWidth - 2, height);
        }
      }
    }

    // 2. RADIAL / RINGS / SPHERES / VORTEX
    if (currentMode.includes('radial') || currentMode.includes('vortex') || currentMode.includes('spiral') || currentMode.includes('rings') || currentMode === 'hex' || currentMode === 'circles') {
      const radius = currentMode.includes('vortex') ? 10 : 100 + (audioLevel * 60);
      
      if (currentMode === 'hex') {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(audioLevel * Math.PI);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          let angle = (i / 6) * Math.PI * 2;
          let r = radius + (state.dataArray[i * 10] || 0) * state.intensity * 0.3;
          let x = Math.cos(angle) * r;
          let y = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        for (let i = 0; i < bars; i++) {
          let angle = (i / bars) * Math.PI * 2;
          if (currentMode.includes('spiral')) {
            angle = (i / bars) * Math.PI * 8 + (audioLevel * 2);
          }
          
          let dataVal = state.dataArray[i];
          let extRadius = radius + (dataVal * state.intensity * 0.6);
          
          let x1 = centerX + Math.cos(angle) * radius;
          let y1 = centerY + Math.sin(angle) * radius;
          let x2 = centerX + Math.cos(angle) * extRadius;
          let y2 = centerY + Math.sin(angle) * extRadius;
          
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);

          if ((currentMode === 'radialcircles' || currentMode === 'circles') && i % 15 === 0) {
            ctx.arc(centerX, centerY, dataVal * state.intensity * 0.8, 0, Math.PI * 2);
          }
          if (currentMode === 'radialgrid' && i % 8 === 0) {
            ctx.moveTo(x1, 0); ctx.lineTo(x1, canvas.height);
          }
        }
        ctx.stroke();
      }
    }

    // 3. WAVE / MIRROR / TUNNELS
    if (currentMode.includes('wave') || currentMode.includes('mirror') || currentMode === 'wavetunnel' || currentMode === 'ripple') {
      ctx.beginPath();
      for (let i = 0; i < bars; i++) {
        let x = i * barWidth;
        let offset = (state.dataArray[i] - 128) * state.intensity;
        
        if (currentMode === 'mirror' || currentMode === 'mirrorcircles') {
          if (i === 0) {
            ctx.moveTo(x, centerY - offset);
          } else {
            ctx.lineTo(x, centerY - offset);
            ctx.lineTo(x, centerY + offset);
          }
        } else if (currentMode === 'wavetunnel') {
          let rTunnel = (canvas.height * 0.4) * (i / bars) + offset;
          ctx.arc(centerX, centerY, Math.max(1, rTunnel), 0, Math.PI * 2);
        } else {
          let y = centerY + offset;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    // 4. COMPLEX MATH GEOMETRY / PARTICLE SYSTEMS
    if (['particles', 'vortexparticles', 'starfield', 'grid', 'spiralgrid', 'blobs', 'lissajous', 'spectrumdots', 'triangles', 'orbitals', 'horizon', 'water', 'jumbled'].includes(currentMode)) {
      ctx.save();
      
      if (currentMode === 'jumbled' || currentMode === 'triangles') {
        ctx.beginPath();
        for (let i = 0; i < bars; i += 4) {
          let factor = state.dataArray[i] * state.intensity;
          ctx.lineTo(centerX + Math.sin(i) * factor, centerY + Math.cos(i) * factor);
          if (currentMode === 'triangles') ctx.lineTo(centerX, centerY);
        }
        ctx.closePath();
        ctx.stroke();
      } 
      else if (currentMode === 'lissajous') {
        ctx.beginPath();
        let freq1 = (state.dataArray[5] || 1) * 0.05;
        let freq2 = (state.dataArray[50] || 1) * 0.05;
        for (let t = 0; t < Math.PI * 2; t += 0.05) {
          let x = centerX + Math.sin(t * freq1) * (canvas.width * 0.3) * state.intensity;
          let y = centerY + Math.cos(t * freq2) * (canvas.height * 0.3) * state.intensity;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } 
      else if (currentMode === 'grid' || currentMode === 'spiralgrid') {
        let gridSize = 30;
        for (let x = 0; x < canvas.width; x += gridSize) {
          for (let y = 0; y < canvas.height; y += gridSize) {
            let idx = Math.floor((x + y) % bars);
            let pSize = (state.dataArray[idx] / 255) * state.intensity * 6;
            ctx.fillRect(x, y, pSize, pSize);
          }
        }
      } 
      else {
        for (let i = 0; i < bars; i += 2) {
          let amp = state.dataArray[i] * state.intensity;
          ctx.beginPath();
          
          let pX, pY;
          if (currentMode === 'horizon') {
            pX = (i / bars) * canvas.width;
            pY = canvas.height - amp;
          } else if (currentMode === 'spectrumdots' || currentMode === 'water') {
            pX = (i / bars) * canvas.width;
            pY = centerY + Math.sin(i + (audioLevel * 5)) * amp * 0.5;
          } else { 
            let angle = i * 0.5 + (audioLevel * 2);
            pX = centerX + Math.cos(angle) * (amp * 1.2);
            pY = centerY + Math.sin(angle) * (amp * 1.2);
          }
          
          ctx.arc(pX, pY, Math.max(1, amp * 0.03), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  } else {
    // Idle state visual loop
    ctx.beginPath();
    ctx.arc(centerX, centerY, 80 + Math.sin(Date.now() * 0.002) * 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Floating Center Media Thumbnail Layer
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
