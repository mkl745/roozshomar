const Input = (() => {

const state = {
  left: false,
  right: false,
  jumpHeld: false,
  jumpPressed: false,
  pausePressed: false,
  anyMoveInput: false,
  firstJumpDone: false,
  touchMode: false
};

const touches = new Map();
let onFirstInteraction = null;

function pressJump() {
  if (!state.jumpHeld) {
    state.jumpPressed = true;
    if (!state.firstJumpDone) { state.firstJumpDone = true; hideJumpHint(); }
  }
  state.jumpHeld = true;
}

function releaseJump() { state.jumpHeld = false; }

function setLeft(v) {
  if (v && !state.left) showHintFade('hint-left');
  state.left = v;
  if (v) state.anyMoveInput = true;
}
function setRight(v) {
  if (v && !state.right) showHintFade('hint-right');
  state.right = v;
  if (v) state.anyMoveInput = true;
}

window.addEventListener('keydown', e => {
  if (e.repeat) return;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': setLeft(true); e.preventDefault(); break;
    case 'ArrowRight': case 'KeyD': setRight(true); e.preventDefault(); break;
    case 'Space': case 'ArrowUp': case 'KeyW': case 'KeyZ':
      pressJump(); e.preventDefault(); break;
    case 'Escape': case 'KeyP':
      state.pausePressed = true; break;
    case 'KeyM':
      AudioSys.setSound(!AudioSys.soundOn());
      break;
  }
});

window.addEventListener('keyup', e => {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': setLeft(false); break;
    case 'ArrowRight': case 'KeyD': setRight(false); break;
    case 'Space': case 'ArrowUp': case 'KeyW': case 'KeyZ':
      releaseJump(); break;
  }
});

const canvasEl = () => document.getElementById('gl');

function pointerZone(x, y, w, h) {
  const cornerW = w * 0.30;
  const cornerH = h * 0.55;
  const inBottom = y > h - cornerH;
  if (inBottom && x < cornerW) return 'left';
  if (inBottom && x > w - cornerW) return 'right';
  return 'jump';
}

function handleDown(e) {
  AudioSys.unlock();
  state.touchMode = e.pointerType !== 'mouse';
  const el = canvasEl();
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const zone = pointerZone(x, y, rect.width, rect.height);
  touches.set(e.pointerId, zone);
  if (zone === 'left') setLeft(true);
  else if (zone === 'right') setRight(true);
  else pressJump();
}

function handleUp(e) {
  const zone = touches.get(e.pointerId);
  if (zone !== undefined) {
    touches.delete(e.pointerId);
    if (zone === 'left' && ![...touches.values()].includes('left')) setLeft(false);
    if (zone === 'right' && ![...touches.values()].includes('right')) setRight(false);
    if (zone === 'jump') releaseJump();
  }
}

function bind() {
  const el = canvasEl();
  el.addEventListener('pointerdown', e => { e.preventDefault(); handleDown(e); });
  el.addEventListener('pointerup', e => { e.preventDefault(); handleUp(e); });
  el.addEventListener('pointercancel', handleUp);
  el.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => {
    setLeft(false); setRight(false); releaseJump();
    touches.clear();
  });
}

function consumeJump() {
  const v = state.jumpPressed;
  state.jumpPressed = false;
  return v;
}
function consumePause() {
  const v = state.pausePressed;
  state.pausePressed = false;
  return v;
}

function showHintFade(id) {
  const el = document.getElementById(id);
  if (!el || el.dataset.seen) return;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1600);
}
function hideJumpHint() {
  const el = document.getElementById('hint-jump');
  if (el && !el.dataset.seen) {
    el.dataset.seen = '1';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2200);
  }
}
function primeTouchHints(isTouch) {
  if (!isTouch) return;
  ['hint-left', 'hint-right'].forEach(id => {
    const el = document.getElementById(id);
    if (!el.dataset.primed) {
      el.dataset.primed = '1';
      el.classList.add('show');
      setTimeout(() => el.classList.remove('show'), 3400);
    }
  });
}

return { state, bind, consumeJump, consumePause, primeTouchHints };
})();
