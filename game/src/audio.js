// Procedural WebAudio: no files, no network. A small mixer with an engine hum whose pitch tracks
// speed, a siren that rises with the wanted level, and one-shot effects for guns, punches, hits,
// cash, missions and the busted sting. Everything is created lazily on the first user gesture.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let siren = null;
  let sirenGain = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.5);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function startEngine() {
    if (!ensure() || engine) return;
    engine = ctx.createOscillator();
    engine.type = 'sawtooth';
    engine.frequency.value = 48;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engine.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engine.start();
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 7;
    const wobbleGain = ctx.createGain();
    wobbleGain.gain.value = 2.5;
    wobble.connect(wobbleGain);
    wobbleGain.connect(engine.frequency);
    wobble.start();
  }

  function startSiren() {
    if (!ensure() || siren) return;
    siren = ctx.createOscillator();
    siren.type = 'square';
    siren.frequency.value = 640;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(siren.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 2;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    siren.connect(filter);
    filter.connect(sirenGain);
    sirenGain.connect(master);
    siren.start();
    lfo.start();
  }

  function noise(duration, gain, cutoff, type) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(master);
    src.start();
    src.stop(ctx.currentTime + duration);
  }

  function tone(freq, duration, gain, type, endFreq) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + duration);
    osc.connect(env);
    env.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    resume() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
      startEngine();
      startSiren();
    },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.7;
      return muted;
    },
    engine(speed, maxSpeed, running) {
      if (!engineGain) return;
      const t = Math.min(1, Math.abs(speed) / maxSpeed);
      engineGain.gain.value = running ? 0.055 + t * 0.1 : 0;
      engine.frequency.value = 42 + t * 96;
    },
    siren(level, near) {
      if (!sirenGain) return;
      sirenGain.gain.value = level > 0 && near ? 0.012 + level * 0.006 : 0;
    },
    gunshot() {
      noise(0.16, 0.42, 2600, 'bandpass');
      tone(180, 0.12, 0.16, 'square', 60);
    },
    punch() { noise(0.09, 0.22, 900, 'lowpass'); },
    hit() { tone(720, 0.06, 0.09, 'triangle', 420); },
    thud() { noise(0.2, 0.3, 380, 'lowpass'); },
    cash() { tone(880, 0.12, 0.12, 'sine'); setTimeout(() => tone(1320, 0.2, 0.11, 'sine'), 90); },
    mission() {
      tone(392, 0.22, 0.1, 'triangle');
      setTimeout(() => tone(523, 0.22, 0.1, 'triangle'), 130);
      setTimeout(() => tone(784, 0.4, 0.12, 'triangle'), 270);
    },
    busted() {
      tone(330, 0.3, 0.12, 'sawtooth', 110);
      setTimeout(() => tone(220, 0.5, 0.12, 'sawtooth', 70), 260);
    },
    click() { tone(540, 0.05, 0.05, 'square'); },
  };
}
