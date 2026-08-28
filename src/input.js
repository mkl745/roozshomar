// Keyboard input: held-state plus a per-frame edge queue (consumers read, engine drains).
const KEYMAP = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
  pause: ['Escape', 'KeyP'],
  respawn: ['KeyR'],
  fps: ['KeyF'],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.queue = [];
    this._kd = (e) => {
      if (this._gameKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.queue.push(e.code);
    };
    this._ku = (e) => this.down.delete(e.code);
    this._blur = () => this.down.clear();
    addEventListener('keydown', this._kd);
    addEventListener('keyup', this._ku);
    addEventListener('blur', this._blur);
  }
  _gameKey(code) {
    return ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(code);
  }
  isDown(action) {
    return KEYMAP[action].some((k) => this.down.has(k));
  }
  // True on the frame the key went down.
  pressed(action) {
    return KEYMAP[action].some((k) => this.queue.includes(k));
  }
  endFrame() {
    this.queue.length = 0;
  }
}
