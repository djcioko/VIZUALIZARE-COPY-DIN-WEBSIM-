```javascript
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

resize();
window.addEventListener("resize", resize);

const fileInput = document.getElementById("file-input");
const logoInput = document.getElementById("logo-input");
const bgInput = document.getElementById("bg-input");

const playAllBtn = document.getElementById("play-all");
const pauseAllBtn = document.getElementById("pause-all");
const stopAllBtn = document.getElementById("stop-all");

const playlistEl = document.getElementById("playlist");

const micSelect = document.getElementById("mic-select");
const enableMicBtn = document.getElementById("enable-mic");

const overlayTextInput = document.getElementById("overlay-text");
const textSizeInput = document.getElementById("text-size");
const textColorInput = document.getElementById("text-color");
const showTextBtn = document.getElementById("show-text");

let audioContext;
let analyser;
let dataArray;

let micStream = null;
let micSource = null;

let tracks = [];
let currentTrackIndex = -1;

let logoMedia = null;
let backgroundMedia = null;

let overlayText = "";
let overlaySize = 70;
let overlayColor = "#ffffff";

function initAudio() {

  if(audioContext) return;

  audioContext = new(window.AudioContext || window.webkitAudioContext)();

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  analyser.connect(audioContext.destination);

}

async function loadMicrophones() {

  try {

    await navigator.mediaDevices.getUserMedia({audio:true});

    const devices = await navigator.mediaDevices.enumerateDevices();

    const mics = devices.filter(d => d.kind === "audioinput");

    micSelect.innerHTML = "";

    mics.forEach((mic,index)=>{

      const option = document.createElement("option");

      option.value = mic.deviceId;
      option.textContent = mic.label || `Microphone ${index+1}`;

      micSelect.appendChild(option);

    });

  } catch(err) {

    console.error(err);

  }

}

loadMicrophones();

navigator.mediaDevices.addEventListener("devicechange", loadMicrophones);

enableMicBtn.addEventListener("click", async ()=>{

  initAudio();

  if(micStream){

    micStream.getTracks().forEach(track=>track.stop());

    micStream = null;

    enableMicBtn.textContent = "ENABLE MIC";

    return;

  }

  const deviceId = micSelect.value;

  micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: {
        exact: deviceId
      }
    }
  });

  micSource = audioContext.createMediaStreamSource(micStream);
  micSource.connect(analyser);

  enableMicBtn.textContent = "MIC LIVE";

});

fileInput.addEventListener("change", (e)=>{

  initAudio();

  const files = Array.from(e.target.files);

  files.forEach(file=>{

    const audio = new Audio();

    audio.src = URL.createObjectURL(file);
    audio.crossOrigin = "anonymous";

    const source = audioContext.createMediaElementSource(audio);

    source.connect(analyser);

    tracks.push({
      file,
      audio,
      source
    });

  });

  renderPlaylist();

});

function renderPlaylist(){

  playlistEl.innerHTML = "";

  tracks.forEach((track,index)=>{

    const li = document.createElement("li");

    li.className = "track";

    if(index === currentTrackIndex){
      li.classList.add("active");
    }

    const playBtn = document.createElement("button");
    playBtn.textContent = "▶";

    const pauseBtn = document.createElement("button");
    pauseBtn.textContent = "⏸";

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "■";

    const micBtn = document.createElement("button");
    micBtn.textContent = "🎤";

    const name = document.createElement("div");
    name.className = "track-name";
    name.textContent = track.file.name;

    playBtn.addEventListener("click", async ()=>{

      currentTrackIndex = index;

      await audioContext.resume();

      track.audio.play();

      renderPlaylist();

    });

    pauseBtn.addEventListener("click", ()=>{

      track.audio.pause();

    });

    stopBtn.addEventListener("click", ()=>{

      track.audio.pause();
      track.audio.currentTime = 0;

    });

    micBtn.addEventListener("click", ()=>{

      alert("Microphone active for this track");

    });

    li.appendChild(playBtn);
    li.appendChild(pauseBtn);
    li.appendChild(stopBtn);
    li.appendChild(micBtn);
    li.appendChild(name);

    playlistEl.appendChild(li);

  });

}

playAllBtn.addEventListener("click", ()=>{

  tracks.forEach(track=>{

    track.audio.play();

  });

});

pauseAllBtn.addEventListener("click", ()=>{

  tracks.forEach(track=>{

    track.audio.pause();

  });

});

stopAllBtn.addEventListener("click", ()=>{

  tracks.forEach(track=>{

    track.audio.pause();
    track.audio.currentTime = 0;

  });

});

logoInput.addEventListener("change", (e)=>{

  const file = e.target.files[0];

  if(!file) return;

  const url = URL.createObjectURL(file);

  if(file.type.startsWith("video")){

    const video = document.createElement("video");

    video.src = url;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.play();

    logoMedia = video;

  } else {

    const img = new Image();
    img.src = url;

    logoMedia = img;

  }

});

bgInput.addEventListener("change", (e)=>{

  const file = e.target.files[0];

  if(!file) return;

  const url = URL.createObjectURL(file);

  if(file.type.startsWith("video")){

    const video = document.createElement("video");

    video.src = url;
    video.loop = true;
    video.muted = true;
    video.autoplay = true;
    video.play();

    backgroundMedia = {
      type:"video",
      media:video
    };

  } else {

    const img = new Image();
    img.src = url;

    backgroundMedia = {
      type:"image",
      media:img
    };

  }

});

showTextBtn.addEventListener("click", ()=>{

  overlayText = overlayTextInput.value;
  overlaySize = Number(textSizeInput.value);
  overlayColor = textColorInput.value;

});

function drawBackground(){

  if(!backgroundMedia) {

    ctx.fillStyle = "black";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    return;

  }

  ctx.drawImage(
    backgroundMedia.media,
    0,
    0,
    canvas.width,
    canvas.height
  );

}

function drawVisualizer(){

  if(!analyser) return;

  analyser.getByteFrequencyData(dataArray);

  const barWidth = canvas.width / dataArray.length;

  let x = 0;

  for(let i=0;i<dataArray.length;i++){

    const value = dataArray[i];

    const height = value * 1.5;

    ctx.fillStyle = `hsl(${i*4},100%,50%)`;

    ctx.fillRect(
      x,
      canvas.height - height,
      barWidth - 2,
      height
    );

    x += barWidth;

  }

}

function drawLogo(){

  if(!logoMedia) return;

  const size = 220;

  ctx.drawImage(
    logoMedia,
    canvas.width/2 - size/2,
    canvas.height/2 - size/2,
    size,
    size
  );

}

function drawOverlayText(){

  if(!overlayText) return;

  ctx.save();

  ctx.font = `bold ${overlaySize}px Arial`;

  ctx.fillStyle = overlayColor;

  ctx.textAlign = "center";

  ctx.shadowBlur = 30;
  ctx.shadowColor = overlayColor;

  ctx.fillText(
    overlayText,
    canvas.width/2,
    canvas.height - 120
  );

  ctx.restore();

}

function animate(){

  requestAnimationFrame(animate);

  drawBackground();

  drawVisualizer();

  drawLogo();

  drawOverlayText();

}

animate();
```
