// AudioManager — Web Audio API with decoded buffers + GainNodes.
// Looping is sample-accurate (AudioBufferSourceNode.loop), crossfades are
// GainNode ramps on the context clock. At most the current + fading-out track
// are held decoded, so memory stays bounded.
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.current = null;          // {name, buffer, src, gain, startAt}
    this._cache = new Map();
    this.paused = false;
    this.onTrackChange = null;    // (name) => void
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
  }

  async _decode(name) {
    if (this._cache.has(name)) return this._cache.get(name);
    const res = await fetch(`music/${name}.mp3`);
    const bytes = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(bytes);
    this._cache.set(name, buffer);
    return buffer;
  }

  get trackName() { return this.current ? this.current.name : null; }
  get duration() { return this.current ? this.current.buffer.duration : 0; }
  // ctx.currentTime freezes while suspended, so this freezes cleanly on pause.
  get currentTime() {
    if (!this.current || !this.ctx) return 0;
    return (this.ctx.currentTime - this.current.startAt) % this.current.buffer.duration;
  }

  // Play a track, crossfading out whatever is running.
  async play(name, fade = 2.0) {
    this.ensure();
    const buffer = await this._decode(name);
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.setTargetAtTime(1, t, fade / 3);
    src.connect(gain); gain.connect(this.master);
    src.start(t);
    const old = this.current;
    this.current = { name, buffer, src, gain, startAt: t };
    if (old) {
      old.gain.gain.setTargetAtTime(0.0001, t, fade / 3);
      old.src.stop(t + fade * 1.6 + 0.25);
    }
    if (this.onTrackChange) this.onTrackChange(name);
    return this.current;
  }

  crossfade(name, fade = 2.2) { return this.play(name, fade); }

  async pause() {
    if (!this.ctx || this.paused) return;
    this.paused = true;
    this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
    await new Promise((r) => setTimeout(r, 250));
    if (this.paused) await this.ctx.suspend();
  }

  async resume() {
    if (!this.ctx || !this.paused) return;
    this.paused = false;
    await this.ctx.resume();
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.25);
  }
}

export const audio = new AudioManager();
