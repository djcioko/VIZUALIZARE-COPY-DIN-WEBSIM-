// ... (păstrează restul codului existent de sus până la funcția drawOverlay)

// ── Text overlay (VERSIUNE STABILIZATĂ) ──────────────────────────────
let overlayText = ""; // Textul actual

btnApplyText.addEventListener("click", () => {
  overlayText = overlayTextInput.value.trim();
});

// Rescriem funcția de desenare să fie cât mai simplă
function drawOverlay(w, h) {
  if (!overlayText) return;

  const fontSize = 48; // Fixăm o dimensiune sigură
  ctx.save();
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Desenare fără umbre complexe sau alpha variabil care pot cauza lag
  ctx.fillStyle = "#ffffff";
  ctx.fillText(overlayText, w / 2, h * 0.85);
  ctx.restore();
}

// ── Modificarea buclei principale (loop) ──────────────────────────────
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); 
  lastT = t;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  
  // Desenare vizualizator
  if (viz) viz.render(w, h, dt);
  
  // Desenare text simplificat
  drawOverlay(w, h);
  
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
