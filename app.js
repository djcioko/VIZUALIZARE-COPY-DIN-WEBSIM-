import { VisualizerManager } from "./visualizers.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
let ac, analyser, gainA, viz;
let current = { index: -1, audio: null };
const clips = [];

function initAudio() {
    if (ac) return;
    ac = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ac.createAnalyser();
    gainA = ac.createGain();
    gainA.connect(analyser);
    analyser.connect(ac.destination);
    viz = new VisualizerManager(ctx, analyser, { mode: "bars", intensity: 1.5, color: "#ffffff" });
}

// ── Gestionare Playlist cu butoane individuale ──
window.playTrack = (i) => {
    initAudio();
    if (current.audio) current.audio.pause();
    const audio = new Audio(clips[i].url);
    const src = ac.createMediaElementSource(audio);
    src.connect(gainA);
    audio.play();
    current = { index: i, audio };
};

window.stopTrack = () => {
    if (current.audio) { current.audio.pause(); current.audio.currentTime = 0; }
};

document.getElementById("file-input").addEventListener("change", (e) => {
    Array.from(e.target.files).forEach(f => {
        clips.push({ name: f.name, url: URL.createObjectURL(f) });
    });
    renderList();
});

function renderList() {
    const list = document.getElementById("clip-list");
    list.innerHTML = clips.map((c, i) => `
        <li>
            <span>${c.name}</span>
            <button onclick="playTrack(${i})">▶</button>
            <button onclick="stopTrack()">⏹</button>
        </li>
    `).join('');
}

// ── Loop Randare (Optimizat pentru OBS) ──
function loop() {
    if (viz) viz.render(canvas.width, canvas.height, 0.016);
    requestAnimationFrame(loop);
}
loop();
