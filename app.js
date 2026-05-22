// ── REPARARE CITIRE ȘI SCHIMBARE AUDIO IN (SURSE LAPTOP) ──
async function populateAudioDevices() {
  try {
    // Cerem o permisiune rapidă pentru ca browserul să ne lase să citim numele reale (Stereo Mix, Mic, etc.)
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === "audioinput");
    
    audioDeviceSel.innerHTML = "";
    audioInputs.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Sursă Audio Intrare ${i + 1}`;
      audioDeviceSel.appendChild(opt);
    });
  } catch (err) { 
    console.warn("Nu s-au putut lista sursele audio din laptop: ", err); 
  }
}

// Apelăm citirea la pornire
populateAudioDevices();
// Dacă conectezi o placă de sunet sau căști noi în timp ce rulează, lista se actualizează singură
navigator.mediaDevices.addEventListener("devicechange", populateAudioDevices);

// SCHIMBAREA SURSEI ÎN TIMP REAL: Când alegi Stereo Mix sau alt Mic din listă
audioDeviceSel.addEventListener("change", async () => {
  if (micListening) {
    // Dacă microfonul era pornit, îl oprim pe cel vechi și îl legăm instant pe cel nou selectat
    stopMicHardware();
    btnMicListen.click(); 
  }
});


// ── REPARARE PLAYLIST: ADAUGARE BUTOANE ▶ ȘI ⏹ DIRECT ÎN DREAPTA TRACK-ULUI ──
function renderList() {
  listEl.innerHTML = "";
  clips.forEach((c, i) => {
    const li = document.createElement("li");
    if (i === current.index && !micListening) li.classList.add("active");
    
    // Numele melodiei în stânga
    const nameSpan = document.createElement("span");
    nameSpan.textContent = c.name.length > 22 ? c.name.slice(0, 20) + "…" : c.name;
    li.appendChild(nameSpan);

    // Zona cu butoanele din dreapta track-ului
    const actionWrap = document.createElement("div");
    actionWrap.style.display = "inline-flex";
    actionWrap.style.gap = "6px";
    actionWrap.style.marginLeft = "12px";

    // Buton mic de PLAY (▶) dedicat piesei
    const itemPlay = document.createElement("button");
    itemPlay.textContent = "▶";
    itemPlay.style.padding = "2px 6px";
    itemPlay.style.fontSize = "11px";
    itemPlay.style.cursor = "pointer";
    itemPlay.addEventListener("click", (e) => {
      e.stopPropagation(); // Previne conflictele de click în listă
      stopMicHardware();
      playIndex(i);
    });

    // Buton mic de STOP (⏹) dedicat piesei
    const itemStop = document.createElement("button");
    itemStop.textContent = "⏹";
    itemStop.style.padding = "2px 6px";
    itemStop.style.fontSize = "11px";
    itemStop.style.color = "#ff6b6b";
    itemStop.style.cursor = "pointer";
    itemStop.addEventListener("click", (e) => {
      e.stopPropagation();
      if (current.index === i) {
        if (current.audio) current.audio.pause();
        playing = false;
        btnPlay.textContent = "Play";
      }
    });

    actionWrap.appendChild(itemPlay);
    actionWrap.appendChild(itemStop);
    li.appendChild(actionWrap);
    listEl.appendChild(li);
  });
}
