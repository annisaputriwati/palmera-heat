// Every sound in Palmera Heat is synthesised with WebAudio — no audio files. One-shots
// (gunshot, punch, pickup, cash register, the mission jingle) are built from oscillators and a
// shared noise buffer; the engine hum and the police siren are persistent nodes whose pitch
// and volume the game drives each frame; a small lookahead scheduler loops a bassline, a soft
// arp and hat ticks as the soundtrack. The context is created on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  let engineNodes = null;
  let sirenNodes = null;
  let musicTimer = null;
  let musicStep = 0;
  let nextNoteTime = 0;

  function unlock() {
    if (ctx === null) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.42;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      startMusic();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, freqEnd, dur, type, gain, when = 0) {
    if (ctx === null) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain, filterFreq, type = 'lowpass', when = 0) {
    if (ctx === null) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // --- the soundtrack: a lazy A-minor groove, scheduled a step at a time ---
  const BASS = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 73.4, 0, 61.7, 0];
  const ARP = [220, 261.6, 329.6, 440, 329.6, 261.6, 196, 246.9];
  function scheduleMusic() {
    if (ctx === null) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const step = musicStep % 16;
      const when = nextNoteTime - ctx.currentTime;
      const bass = BASS[step];
      if (bass) tone(bass, null, 0.22, 'triangle', 0.16, when);
      if (step % 2 === 0) tone(ARP[(musicStep >> 1) % ARP.length], null, 0.16, 'sine', 0.045, when);
      if (step % 4 === 2) noise(0.03, 0.03, 6000, 'highpass', when);
      nextNoteTime += 0.145;
      musicStep += 1;
    }
  }
  function startMusic() {
    if (musicTimer !== null) return;
    nextNoteTime = ctx.currentTime + 0.1;
    musicTimer = window.setInterval(scheduleMusic, 90);
  }

  // --- persistent engine and siren nodes, driven per frame by setEngine/setSiren ---
  function ensureEngine() {
    if (engineNodes !== null || ctx === null) return;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g).connect(master);
    osc.start();
    sub.start();
    engineNodes = { osc, sub, filter, g };
  }
  function ensureSiren() {
    if (sirenNodes !== null || ctx === null) return;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 820;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(g).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, g };
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.42;
    },
    /** Engine hum: on while the player drives; ratio 0..1 of top speed. */
    setEngine(on, ratio) {
      if (ctx === null) return;
      ensureEngine();
      const t = ctx.currentTime;
      const target = on ? 0.05 + ratio * 0.05 : 0;
      engineNodes.g.gain.setTargetAtTime(target, t, 0.08);
      if (on) {
        const freq = 55 + ratio * 165;
        engineNodes.osc.frequency.setTargetAtTime(freq, t, 0.05);
        engineNodes.sub.frequency.setTargetAtTime(freq / 2, t, 0.05);
        engineNodes.filter.frequency.setTargetAtTime(320 + ratio * 900, t, 0.05);
      }
    },
    /** Two-tone siren: on while any police car is near and hunting. */
    setSiren(on) {
      if (ctx === null) return;
      ensureSiren();
      sirenNodes.g.gain.setTargetAtTime(on ? 0.028 : 0, ctx.currentTime, 0.15);
    },
    shot() {
      noise(0.13, 0.5, 2600);
      tone(160, 40, 0.1, 'square', 0.22);
    },
    punch() {
      tone(130, 38, 0.09, 'sine', 0.5);
      noise(0.05, 0.2, 900);
    },
    crash(strength) {
      noise(0.22, Math.min(0.6, 0.2 + strength * 0.05), 700);
      tone(90, 30, 0.2, 'sine', 0.4);
    },
    door() {
      tone(220, 90, 0.07, 'square', 0.12);
      noise(0.04, 0.1, 1200);
    },
    pickup() {
      tone(880, null, 0.09, 'sine', 0.2);
      tone(1318, null, 0.14, 'sine', 0.2, 0.07);
    },
    cash() {
      tone(1568, null, 0.07, 'square', 0.1);
      tone(2093, null, 0.12, 'square', 0.1, 0.06);
    },
    jingle(win) {
      const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
      notes.forEach((freq, i) => tone(freq, null, 0.22, 'triangle', 0.22, i * 0.11));
    },
    busted() {
      tone(392, null, 0.3, 'square', 0.14);
      tone(311, null, 0.45, 'square', 0.14, 0.22);
    },
  };
}
