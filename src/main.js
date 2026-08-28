/* ------------------------------------------------------------------ *
 *  Bootstrap: wires engine + audio + waveform reactor + UI.          *
 * ------------------------------------------------------------------ */
import { Engine } from './engine.js';
import { AudioManager } from './audio.js';
import { reactor, getAudioIntensity } from './waveform.js';
import { I18n } from './i18n.js';
import { SCENES } from './scene_test.js';

const $ = (s) => document.querySelector(s);

const TRACKS = [
  ['chapter1', 'music/chapter1.mp3', 'waveform/chapter1.jpg'],
  ['chapter2', 'music/chapter2.mp3', 'waveform/chapter2.jpg'],
  ['chapter3', 'music/chapter3.mp3', 'waveform/chapter3.jpg'],
  ['dreammode', 'music/dreammode.mp3', 'waveform/dreammode.jpg'],
  ['hardcore', 'music/hardcore.mp3', 'waveform/hardcore.jpg'],
];

const audio = new AudioManager();
for (const [n, u] of TRACKS) audio.register(n, u);
for (const [n, , w] of TRACKS) reactor.register(n, w);
reactor.bindAudio(audio);

const i18n = new I18n();

const canvas = $('#game');
const engine = new Engine(canvas, { audio, fadeEl: $('#fade') });
engine.resize();
let sceneKey = 'showcase';
engine.loadChapter(SCENES[sceneKey]);

window.addEventListener('resize', () => engine.resize());

/* ---------------- UI state ---------------- */
const titleEl = $('#ui-title'), pauseEl = $('#ui-pause'), hudEl = $('#hud'),
  touchEl = $('#touch'), debugEl = $('#debug'), toastEl = $('#toast'),
  trackEl = $('#track-label'), sceneEl = $('#scene-label');

function setSceneLabel() {
  sceneEl.textContent = sceneKey === 'feel' ? i18n.t('feel') : i18n.t('showcase');
}
function setTrackLabel() {
  const n = audio.currentName;
  const i = TRACKS.findIndex(t => t[0] === n);
  trackEl.textContent = n ? `${i18n.t('track')}: ${n} [${i + 1}]` : '';
}

engine.onEvent = (type, data) => {
  if (type === 'pause') { pauseEl.classList.add('show'); hudEl.classList.remove('show'); }
  if (type === 'resume' || type === 'begin') { pauseEl.classList.remove('show'); hudEl.classList.add('show'); }
  if (type === 'checkpoint') toast(i18n.t('checkpoint'));
};

let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 1600);
}

/* ---------------- begin (user gesture -> audio) ---------------- */
let started = false;
async function begin() {
  if (started) return;
  started = true;
  await audio.init();
  const track = SCENES[sceneKey].track || 'chapter1';
  await reactor.preload(track).catch(() => {});
  await audio.play(track).catch(() => {});
  reactor.preloadAll();                       // background
  engine.begin();
  titleEl.classList.add('hide');
  hudEl.classList.add('show');
  touchEl.classList.add('on');
  setTrackLabel();
}
$('#start-btn').addEventListener('click', begin);
titleEl.addEventListener('pointerdown', (e) => { if (e.target === titleEl) begin(); });

/* ---------------- pause / resume ---------------- */
$('#resume-btn').addEventListener('click', () => engine.resume());
$('#restart-btn').addEventListener('click', () => { engine.startRespawn(); engine.resume(); });
$('#pause-btn').addEventListener('click', () => engine.pause());

/* ---------------- lang & mute ---------------- */
$('#lang-btn').addEventListener('click', () => { i18n.toggle(); refreshTexts(); });
$('#mute-btn').addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  $('#mute-btn').textContent = audio.muted ? '✕' : '♪';
});
function refreshTexts() {
  i18n.apply();
  setSceneLabel(); setTrackLabel();
  $('#lang-btn').textContent = i18n.t('langBtn');
}

/* ---------------- scene toggle ---------------- */
function toggleScene() {
  sceneKey = sceneKey === 'showcase' ? 'feel' : 'showcase';
  engine.loadChapter(SCENES[sceneKey]);
  if (started && SCENES[sceneKey].track && sceneKey === 'showcase') audio.play(SCENES[sceneKey].track);
  setSceneLabel();
}

/* ---------------- hotkeys ---------------- */
window.addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Space' || e.code === 'Enter')) { begin(); return; }
  if (!started) return;
  switch (e.code) {
    case 'Escape': case 'KeyP':
      engine.state === 'paused' ? engine.resume() : engine.pause(); break;
    case 'Backquote':
      debugEl.classList.toggle('show'); break;
    case 'KeyT':
      toggleScene(); break;
    case 'KeyM':
      audio.setMuted(!audio.muted); $('#mute-btn').textContent = audio.muted ? '✕' : '♪'; break;
    case 'KeyR':
      engine.startRespawn(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
      const i = +e.code.slice(-1) - 1;
      audio.play(TRACKS[i][0]).then(setTrackLabel); break;
    }
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && engine.state === 'playing') engine.pause();
});

/* ---------------- touch controls ---------------- */
const bindTouch = (el, action) => {
  const on = (e) => { e.preventDefault(); engine.input.setVirtual(action, true); };
  const off = (e) => { e.preventDefault(); engine.input.setVirtual(action, false); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
};
bindTouch($('#t-left'), 'left');
bindTouch($('#t-right'), 'right');
bindTouch($('#t-jump'), 'jump');

/* ---------------- debug overlay ---------------- */
setInterval(() => {
  if (!debugEl.classList.contains('show')) return;
  const d = engine.debugInfo();
  $('#dbg-text').textContent =
    `fps ${d.fps}  ${d.state}  scene:${d.chapter}\n` +
    `pos ${d.x},${d.y}  vel ${d.vx},${d.vy}\n` +
    `grounded ${d.grounded}  track ${d.track}\n` +
    `[1-5] track  [T] scene  [R] respawn  [M] mute  [\`] debug`;
  $('#dbg-bar').style.width = `${Math.round(getAudioIntensity() * 100)}%`;
}, 120);

/* ---------------- go ---------------- */
refreshTexts();
engine.start();
