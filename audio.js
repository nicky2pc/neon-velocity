/**
 * audio.js — Procedural Synthwave Music & SFX
 * Web Audio API, BPM=120, 8-bar looping pattern
 */

export class SynthwaveAudio {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.sectionGains = {};

    this.BPM = 120;
    this.beatDuration = 60 / this.BPM;       // 0.5s
    this.barDuration = this.beatDuration * 4; // 2s
    this.patternBars = 8;

    this._schedulerTimer = null;
    this._nextBeatTime = 0;
    this._beat = 0;

    this._started = false;
    this._noiseBuffer = null;
    this._reverbNode = null;
    this._initPromise = null; // cached so init() is idempotent & awaitable

    // F# minor pentatonic bass pattern (16 steps = 4 bars of 4 beats)
    this._bassPattern = [
      92.5, 0,    92.5, 0,
      92.5, 0,    110,  92.5,
      0,    92.5, 0,    92.5,
      110,  0,    92.5, 0,
    ];

    // Lead melody (F# minor pentatonic), durations in beats
    this._melodyPattern = [
      { note: 370,   dur: 1   }, { note: 0,     dur: 0.5 }, { note: 440,  dur: 0.5 },
      { note: 370,   dur: 0.5 }, { note: 330,   dur: 0.5 }, { note: 0,    dur: 1   },
      { note: 277.2, dur: 0.5 }, { note: 330,   dur: 0.5 }, { note: 370,  dur: 1   },
      { note: 0,     dur: 0.5 }, { note: 220,   dur: 0.5 }, { note: 247,  dur: 1   },
      { note: 0,     dur: 0.5 }, { note: 185,   dur: 0.5 }, { note: 220,  dur: 1   },
      { note: 0,     dur: 1   },
    ];

    this._dynamicSpeed = 200;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  // Safe to call multiple times; returns same promise after first call
  init() {
    if (!this._initPromise) this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.72;

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.25;
    this.masterGain.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    for (const name of ['kick', 'snare', 'hihat', 'bass', 'melody', 'pad']) {
      const g = this.ctx.createGain();
      g.connect(this.masterGain);
      this.sectionGains[name] = g;
    }
    this.sectionGains.kick.gain.value   = 0.9;
    this.sectionGains.snare.gain.value  = 0.6;
    this.sectionGains.hihat.gain.value  = 0.32;
    this.sectionGains.bass.gain.value   = 0.55;
    this.sectionGains.melody.gain.value = 0.3;
    this.sectionGains.pad.gain.value    = 0.12;

    this._noiseBuffer = this._createNoiseBuffer(1);
    this._reverbNode  = await this._createReverb(1.2, 2.0);
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  start() {
    if (!this.ctx || this._started) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._started = true;
    this._beat = 0;
    this._nextBeatTime = this.ctx.currentTime + 0.05;
    this._schedulerTimer = setInterval(() => this._schedule(), 100);
  }

  stop() {
    clearInterval(this._schedulerTimer);
    this._schedulerTimer = null;
    this._started = false;
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    if (!this._started) this.start();
  }

  setSpeed(speed) {
    this._dynamicSpeed = speed;
    const t = Math.min((speed - 200) / 400, 1);
    if (this.sectionGains.melody) {
      this.sectionGains.melody.gain.setTargetAtTime(0.3 + t * 0.25, this.ctx.currentTime, 0.5);
    }
  }

  // ─── Scheduler ────────────────────────────────────────────────────────────

  _schedule() {
    if (!this.ctx || !this._started) return;
    const lookahead = 0.12;
    while (this._nextBeatTime < this.ctx.currentTime + lookahead) {
      this._scheduleBeat(this._beat, this._nextBeatTime);
      this._nextBeatTime += this.beatDuration;
      this._beat++;
    }
  }

  _scheduleBeat(beatAbs, time) {
    const beat = beatAbs % (this.patternBars * 4); // 0-31
    const bar  = Math.floor(beat / 4);

    // Kick: every downbeat + off-beat ghost
    if (beat % 4 === 0) this._kick(time);
    if (beat % 8 === 4) this._kick(time, 0.55);

    // Snare: beat 2 of every bar
    if (beat % 4 === 2) this._snare(time);

    // Hi-hat: 8th notes + occasional open
    this._hihat(time, false);
    this._hihat(time + this.beatDuration * 0.5, false);
    if (bar % 2 === 0 && beat % 8 === 0) {
      this._hihat(time + this.beatDuration * 2, true);
    }

    // Bass
    const bassFreq = this._bassPattern[beat % 16];
    if (bassFreq > 0) this._bass(time, bassFreq, this.beatDuration * 0.82);

    // Melody
    this._melodyBeat(beat, time);

    // Pad: clean sine chord, no vibrato — fires every half-pattern
    if (beat === 0 || beat === 16) {
      this._pad(time, 185, this.barDuration * 4);
      this._pad(time, 220, this.barDuration * 4);
    }
  }

  _melodyBeat(beat, time) {
    const patternBeat = beat % (this.patternBars * 4);
    const elapsed = patternBeat * this.beatDuration;
    let noteAccum = 0;
    for (const n of this._melodyPattern) {
      const noteTime = noteAccum * this.beatDuration;
      if (noteTime >= elapsed && noteTime < elapsed + this.beatDuration && n.note > 0) {
        this._lead(time + (noteTime - elapsed), n.note, n.dur * this.beatDuration * 0.78);
      }
      noteAccum += n.dur;
    }
  }

  // ─── Instruments ──────────────────────────────────────────────────────────

  _kick(time, vol = 1) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(50, time + 0.1);
    env.gain.setValueAtTime(vol, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(env); env.connect(this.sectionGains.kick);
    osc.start(time); osc.stop(time + 0.15);
  }

  _snare(time) {
    // Triangle tone (30%)
    const tone = this.ctx.createOscillator();
    const tEnv = this.ctx.createGain();
    tone.type = 'triangle'; tone.frequency.value = 200;
    tEnv.gain.setValueAtTime(0.3, time);
    tEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    tone.connect(tEnv); tEnv.connect(this.sectionGains.snare);
    tone.start(time); tone.stop(time + 0.12);
    // Noise (70%)
    const buf = this.ctx.createBufferSource();
    buf.buffer = this._noiseBuffer;
    const nEnv = this.ctx.createGain();
    nEnv.gain.setValueAtTime(0.7, time);
    nEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    buf.connect(nEnv); nEnv.connect(this.sectionGains.snare);
    buf.start(time); buf.stop(time + 0.12);
  }

  _hihat(time, open) {
    const buf = this.ctx.createBufferSource();
    buf.buffer = this._noiseBuffer;
    const hp  = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 8000;
    const env = this.ctx.createGain();
    const dur = open ? 0.28 : 0.05;
    env.gain.setValueAtTime(0.55, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);
    buf.connect(hp); hp.connect(env); env.connect(this.sectionGains.hihat);
    buf.start(time); buf.stop(time + dur);
  }

  _bass(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const lp  = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.value = freq;
    lp.type = 'lowpass';
    lp.frequency.value = 200 + Math.min((this._dynamicSpeed - 200) / 400, 1) * 900;
    lp.Q.value = 2;
    env.gain.setValueAtTime(0.9, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(lp); lp.connect(env); env.connect(this.sectionGains.bass);
    osc.start(time); osc.stop(time + dur);
  }

  _lead(time, freq, dur) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'square';   osc1.frequency.value = freq;
    osc2.type = 'sawtooth'; osc2.frequency.value = freq * Math.pow(2, 7 / 1200); // +7 cents

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(0.5, time + 0.02);
    env.gain.setValueAtTime(0.38, time + dur * 0.65);
    env.gain.exponentialRampToValueAtTime(0.001, time + dur);

    const dry = this.ctx.createGain(); dry.gain.value = 0.72;
    const wet = this.ctx.createGain(); wet.gain.value = 0.28;
    osc1.connect(env); osc2.connect(env);
    env.connect(dry); dry.connect(this.sectionGains.melody);
    if (this._reverbNode) {
      env.connect(wet); wet.connect(this._reverbNode);
      this._reverbNode.connect(this.sectionGains.melody);
    }
    osc1.start(time); osc1.stop(time + dur);
    osc2.start(time); osc2.stop(time + dur);
  }

  // Pad: smooth sine chord, NO vibrato (removed — sounded harsh on repeat)
  _pad(time, freq, dur) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    env.gain.setValueAtTime(0.001, time);
    env.gain.linearRampToValueAtTime(0.12, time + 1.2);
    env.gain.setValueAtTime(0.12, time + dur - 1.2);
    env.gain.linearRampToValueAtTime(0.001, time + dur);
    osc.connect(env); env.connect(this.sectionGains.pad);
    osc.start(time); osc.stop(time + dur);
  }

  // ─── SFX ─────────────────────────────────────────────────────────────────

  playSFX(type) {
    if (!this.ctx || this.ctx.state === 'suspended') return;
    const t = this.ctx.currentTime;

    if (type === 'overtake') {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(820, t + 0.18);
      env.gain.setValueAtTime(0.35, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(env); env.connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.22);

    } else if (type === 'collision') {
      const buf = this.ctx.createBufferSource();
      buf.buffer = this._noiseBuffer;
      const lp  = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1200;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.9, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      buf.connect(lp); lp.connect(env); env.connect(this.masterGain);
      buf.start(t); buf.stop(t + 0.35);

    } else if (type === 'select') {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'square'; osc.frequency.value = 880;
      env.gain.setValueAtTime(0.28, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(env); env.connect(this.masterGain);
      osc.start(t); osc.stop(t + 0.08);

    } else if (type === 'gamestart') {
      [440, 554, 659, 880].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        osc.type = 'square'; osc.frequency.value = freq;
        const st = t + i * 0.07;
        env.gain.setValueAtTime(0.22, st);
        env.gain.exponentialRampToValueAtTime(0.001, st + 0.14);
        osc.connect(env); env.connect(this.masterGain);
        osc.start(st); osc.stop(st + 0.14);
      });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _createNoiseBuffer(dur) {
    const sr  = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * dur, sr);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  async _createReverb(preDelay, decay) {
    const sr  = this.ctx.sampleRate;
    const len = sr * (preDelay + decay);
    const imp = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = imp;
    return conv;
  }
}
