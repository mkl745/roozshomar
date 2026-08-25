const UI = (() => {

const el = id => document.getElementById(id);
let engine = null;

function init(eng) {
  engine = eng;
  el('btn-resume').addEventListener('click', () => { AudioSys.uiTick(); eng.resume(); });
  el('btn-restart').addEventListener('click', () => { AudioSys.uiTick(); eng.restartChapter(); });
  el('btn-sound').addEventListener('click', () => {
    const on = !AudioSys.soundOn();
    AudioSys.setSound(on);
    setSoundLabel(on);
    if (on) AudioSys.uiTick();
  });
  el('btn-exit').addEventListener('click', () => { window.location.href = 'index.html'; });
  el('btn-replay').addEventListener('click', () => { AudioSys.uiTick(); eng.replayChapter(); });
  el('btn-home').addEventListener('click', () => { window.location.href = 'index.html'; });
  setSoundLabel(AudioSys.soundOn());
  updateRotateChip();
  window.addEventListener('resize', updateRotateChip);
}

function updateRotateChip() {
  const portrait = window.innerHeight > window.innerWidth * 1.05;
  const touch = 'ontouchstart' in window;
  el('chip-rotate').classList.toggle('show', portrait && touch);
}

function setSoundLabel(on) {
  el('btn-sound').textContent = 'Sound · ' + (on ? 'On' : 'Off');
}

function titleButtons(hasSave) {
  const row = el('title-buttons');
  row.innerHTML = '';
  if (hasSave) {
    const cont = document.createElement('button');
    cont.className = 'btn primary';
    cont.textContent = 'Continue';
    cont.addEventListener('click', () => { AudioSys.unlock(); AudioSys.uiTick(); engine.begin(true); });
    row.appendChild(cont);
  }
  const begin = document.createElement('button');
  begin.className = hasSave ? 'btn' : 'btn primary';
  begin.textContent = hasSave ? 'New Journey' : 'Begin';
  begin.addEventListener('click', () => { AudioSys.unlock(); AudioSys.uiTick(); engine.begin(false); });
  row.appendChild(begin);
  el('title').classList.add('show');
}

function hideTitle() {
  el('title').classList.remove('show');
}

function showPause() {
  setSoundLabel(AudioSys.soundOn());
  el('pause').classList.add('show');
}
function hidePause() {
  el('pause').classList.remove('show');
}

function showEnd(collected, total, info) {
  info = info || {};
  el('end-title').textContent = (info.numeral || '') + ' · ' + (info.name || '');
  el('end-motes').textContent = collected + ' / ' + total + ' memories gathered';
  const nextBtn = el('btn-next');
  if (info.nextName) {
    nextBtn.disabled = false;
    nextBtn.textContent = 'Continue · Chapter ' + info.nextNumeral + ' — ' + info.nextName;
    nextBtn.style.display = '';
  } else {
    nextBtn.disabled = true;
    nextBtn.textContent = 'The journey continues…';
    nextBtn.style.display = '';
  }
  el('end-note').textContent =
    info.numeral === 'II' ? 'the rain is not the same as it was before'
    : info.numeral === 'III' ? 'it never learned to walk in daylight'
    : 'somewhere far away, a bell is being polished…';
  el('endcard').classList.add('show');
}
function hideEnd() {
  el('endcard').classList.remove('show');
}

let toastTimer = null;
function showChapterToast(numeral, name, longish) {
  const t = el('chapter-toast');
  t.innerHTML = '<span class="ct-num">' + numeral + '</span><span class="ct-name">' + name + '</span>';
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), longish ? 4200 : 3200);
}

function playHud(show) {
  const chip = el('chip-pause');
  chip.classList.toggle('show', !!show);
  chip.style.pointerEvents = show ? 'auto' : 'none';
}

return {
  init, titleButtons, hideTitle, showPause, hidePause, showEnd, hideEnd,
  playHud, showChapterToast
};
})();
