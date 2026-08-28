/* ------------------------------------------------------------------ *
 *  Input: keyboard + touch flags with pressed/released edges.        *
 * ------------------------------------------------------------------ */

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
};

export class Input {
  constructor() {
    this.held = { left: false, right: false, jump: false };
    this._pressed = new Set();
    this._released = new Set();
    this.anyKey = false;             // edge: any key/tap since last poll
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
  }

  attach(target = window) {
    this._target = target;
    target.addEventListener('keydown', this._onKeyDown, { passive: false });
    target.addEventListener('keyup', this._onKeyUp);
  }
  detach() {
    if (!this._target) return;
    this._target.removeEventListener('keydown', this._onKeyDown);
    this._target.removeEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    const a = KEYMAP[e.code];
    if (a) {
      e.preventDefault();
      if (!e.repeat) {
        this._pressed.add(a);
        if (a === 'jump') this.anyKey = true;
      }
      this.held[a] = true;
    } else if (!e.repeat && !e.metaKey && !e.ctrlKey) this.anyKey = true;
  }
  _onKeyUp(e) {
    const a = KEYMAP[e.code];
    if (a) { this.held[a] = false; if (a === 'jump') this._released.add(a); }
  }

  /** Touch buttons call this. */
  setVirtual(action, down) {
    if (down && !this.held[action]) this._pressed.add(action);
    if (!down && this.held[action]) this._released.add(action);
    this.held[action] = down;
    if (down) this.anyKey = true;
  }

  moveX() { return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); }

  /** Snapshot consumed by one or more fixed update steps per frame. */
  snapshot() {
    return {
      moveX: this.moveX(),
      jumpHeld: this.held.jump,
      jumpPressed: this._pressed.has('jump'),
      jumpReleased: this._released.has('jump'),
    };
  }
  consumeJumpEdges() { this._pressed.delete('jump'); this._released.delete('jump'); }
  pollAnyKey() { const v = this.anyKey; this.anyKey = false; return v; }

  /** Called once per rendered frame, after update steps. */
  endFrame() { this._pressed.clear(); this._released.clear(); }
}
