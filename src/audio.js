/* ------------------------------------------------------------------ *
 *  AudioManager — Web Audio API.                                     *
 *  Decoded AudioBuffers + AudioBufferSourceNode(loop) for            *
 *  sample-accurate looping; GainNode setTargetAtTime crossfades      *
 *  (no <audio loop> gap issues). pause/resume via context suspend.   *
 * ------------------------------------------------------------------ */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.cache = new Map();       // name -> AudioBuffer
    this.urls = new Map();        // name -> url
    this.current = null;          // { name, src, gain, startAt, offset }
    this.muted = false;
    this._vol = 0.9;
  }

  register(name, url) { this.urls.set(name, url); }

  async init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this._vol;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  async loadBuffer(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const url = this.urls.get(name);
    if (!url) throw new Error('unknown track ' + name);
    const buf = await (await fetch(url)).arrayBuffer();
    const decoded = await this.ctx.decodeAudioData(buf);
    this.cache.set(name, decoded);
    return decoded;
  }

  get currentName() { return this.current ? this.current.name : null; }
  get isPlaying() { return !!(this.current && this.ctx && this.ctx.state === 'running'); }
  get duration() { return this.current ? this.current.buffer.duration : 0; }
  get currentTime() {
    if (!this.current) return 0;
    const c = this.current;
    return (c.offset + (this.ctx.currentTime - c.startAt)) % c.buffer.duration;
  }

  /** Play/switch track with smooth crossfade. */
  async play(name, { fade = 1.6, offset = 0 } = {}) {
    await this.init();
    if (this.currentName === name) return;
    const buffer = await this.loadBuffer(name);
    const t = this.ctx.currentTime;

    // fade old out, stop it
    if (this.current) {
      const old = this.current;
      old.gain.gain.setTargetAtTime(0, t, fade / 3);
      try { old.src.stop(t + fade * 1.5); } catch (e) {}
      this.current = null;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;                       // buffer loop = gapless
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(1, t + 0.05, fade / 3);
    src.connect(gain); gain.connect(this.master);
    src.start(t, offset % buffer.duration);

    this.current = { name, src, gain, buffer, startAt: t, offset: offset % buffer.duration };
  }

  stop({ fade = 0.8 } = {}) {
    if (!this.current || !this.ctx) return;
    const t = this.ctx.currentTime, old = this.current;
    old.gain.gain.setTargetAtTime(0, t, fade / 3);
    try { old.src.stop(t + fade * 1.5); } catch (e) {}
    this.current = null;
  }

  async pause() { if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend(); }
  async resume() { if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this._vol, this.ctx.currentTime, 0.08);
  }
}
