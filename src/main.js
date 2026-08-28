// Bootstrap: engine + test scene + start/pause overlays + track switching.
import { Engine } from './engine.js';
import { audio } from './audio.js';
import { TEST_CHAPTER, MOODS, TRACKS } from './testscene.js';

const canvas = document.getElementById('game');
const overlay = document.getElementById('overlay');
const pausedEl = document.getElementById('paused');

const engine = new Engine(canvas);
engine.registerChapter('test', TEST_CHAPTER);
engine.loadChapter('test');

let started = false;
function begin() {
  if (started) return;
  started = true;
  overlay.classList.add('gone');
  engine.start();
  audio.play(TEST_CHAPTER.music, 1.6);
}
overlay.addEventListener('click', begin);
addEventListener('keydown', (e) => {
  if (!started && (e.code === 'Space' || e.code === 'Enter')) begin();
});

engine.onStateChange = (s) => {
  pausedEl.classList.toggle('show', s === 'paused');
};

// 1–5: crossfade tracks; the mood grading follows the music.
addEventListener('keydown', (e) => {
  const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
  if (i < 0 || !started) return;
  const name = TRACKS[i];
  if (audio.trackName === name) return;
  audio.crossfade(name, 2.2);
  engine.env.setMood(MOODS[name]);
});

// Debug/telemetry hook for headless feel-tests.
window.__game = { engine, audio, player: engine.player };
