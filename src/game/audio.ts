/** Lightweight WebAudio synth: SFX + adaptive music. Fully optional — game runs silent if unavailable. */
type Mood = 'menu' | 'prep' | 'battle' | 'victory' | 'defeat';

class AudioEngine {
  ctx: AudioContext | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  mood: Mood = 'menu';
  private timer: number | null = null;
  private step = 0;
  private lastPlay: Record<string, number> = {};
  musicVol = 0.4; sfxVol = 0.7;

  init() {
    if (this.ctx) return;
    try {
      const C = window.AudioContext || (window as any).webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol * 0.5;
      this.musicGain.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.ctx.destination);
      this.startMusic();
    } catch { this.ctx = null; }
  }
  resume() { this.ctx?.resume?.(); }
  setVolumes(music: number, sfx: number) {
    this.musicVol = music; this.sfxVol = sfx;
    if (this.musicGain) this.musicGain.gain.value = music * 0.5;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }
  setMood(m: Mood) { this.mood = m; }

  private note(freq: number, dur: number, type: OscillatorType, gain: number, dest: GainNode, detune = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), this.ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(dest);
    o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
  }
  private noise(dur: number, gain: number, filterFreq: number) {
    if (!this.ctx || !this.sfxGain) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfxGain);
    src.start();
  }

  play(name: string) {
    if (!this.ctx || !this.sfxGain) return;
    const now = performance.now();
    if (now - (this.lastPlay[name] || 0) < 45) return; // throttle
    this.lastPlay[name] = now;
    const S = this.sfxGain;
    switch (name) {
      case 'sword': this.noise(0.12, 0.25, 2600); this.note(420, 0.07, 'square', 0.05, S); break;
      case 'bow': this.noise(0.08, 0.15, 5000); this.note(900, 0.05, 'triangle', 0.04, S); break;
      case 'siege': this.noise(0.35, 0.4, 700); this.note(90, 0.3, 'sawtooth', 0.12, S); break;
      case 'magic': this.note(760, 0.25, 'sine', 0.12, S); this.note(1180, 0.2, 'sine', 0.07, S, 20); break;
      case 'hurt': this.note(200, 0.12, 'square', 0.07, S); break;
      case 'die': this.note(160, 0.25, 'sawtooth', 0.09, S); this.noise(0.2, 0.15, 1200); break;
      case 'build': this.note(330, 0.1, 'square', 0.1, S); setTimeout(() => this.note(440, 0.14, 'square', 0.1, S), 90); break;
      case 'destroy': this.noise(0.6, 0.45, 500); break;
      case 'ui': this.note(620, 0.05, 'square', 0.07, S); break;
      case 'error': this.note(180, 0.16, 'square', 0.1, S); break;
      case 'wave': [392, 523, 659].forEach((f, i) => setTimeout(() => this.note(f, 0.4, 'sawtooth', 0.1, S), i * 150)); break;
      case 'victory': [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.note(f, 0.5, 'triangle', 0.14, S), i * 160)); break;
      case 'defeat': [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.note(f, 0.7, 'sawtooth', 0.12, S), i * 230)); break;
      case 'coin': this.note(1046, 0.06, 'square', 0.05, S); setTimeout(() => this.note(1318, 0.08, 'square', 0.05, S), 50); break;
    }
  }

  private startMusic() {
    if (this.timer) return;
    const scales: Record<Mood, number[]> = {
      menu: [220, 262, 294, 330, 392, 440],
      prep: [196, 233, 262, 294, 349, 392],
      battle: [147, 175, 196, 220, 262, 294],
      victory: [262, 330, 392, 523, 659, 784],
      defeat: [147, 156, 175, 196, 208, 233],
    };
    this.timer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain || this.musicVol <= 0) return;
      const sc = scales[this.mood];
      const fast = this.mood === 'battle';
      this.step++;
      const root = sc[0] / 2;
      if (this.step % 4 === 0) this.note(root, 1.1, 'triangle', 0.16, this.musicGain);
      if (!fast && this.step % 2 === 1) return;
      const n = sc[Math.floor(Math.random() * sc.length)];
      this.note(n, fast ? 0.5 : 0.9, fast ? 'sawtooth' : 'triangle', fast ? 0.06 : 0.07, this.musicGain);
    }, 420);
  }
}

export const audio = new AudioEngine();
