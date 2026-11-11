/**
 * Som do jogo, todo sintetizado na hora com WebAudio: nenhum arquivo é baixado.
 * Ambiente (vento, chuva, um zumbido grave dentro dos prédios) e efeitos curtos.
 * O navegador só deixa tocar depois de um toque ou tecla, então o áudio nasce no
 * primeiro gesto. O mudo fica salvo neste navegador.
 */
const KEY = 'lads-remnants:mute';
const VOLUME = 0.55;

export type Sfx = 'click' | 'step' | 'search' | 'hit' | 'good' | 'bad' | 'alert' | 'knock';
export interface Ambience {
  rain: boolean;
  night: boolean;
  raid: boolean;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let layers: { wind: GainNode; rain: GainNode; drone: GainNode } | null = null;
let wanted: Ambience = { rain: false, night: false, raid: false };
let muted = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

/** Dois segundos de ruído, para tocar em laço. O marrom é grave (vento); o branco, chiado (chuva). */
function noise(ac: AudioContext, brown: boolean): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

function start(): void {
  if (ctx) {
    void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  const ac = (ctx = new AC());
  master = ac.createGain();
  master.gain.value = muted ? 0 : VOLUME;
  master.connect(ac.destination);

  const loop = (buffer: AudioBuffer, type: BiquadFilterType, freq: number): GainNode => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(master!);
    src.start();
    return gain;
  };
  const brown = noise(ac, true);
  const wind = loop(brown, 'lowpass', 420);
  // O vento sobe e desce devagar.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.07;
  const depth = ac.createGain();
  depth.gain.value = 0.025;
  lfo.connect(depth).connect(wind.gain);
  lfo.start();
  const rain = loop(noise(ac, false), 'highpass', 1800);
  // Zumbido grave e parado: o silêncio de um prédio abandonado.
  const drone = ac.createGain();
  drone.gain.value = 0;
  for (const f of [55, 82.5]) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(drone);
    osc.start();
  }
  drone.connect(master);
  layers = { wind, rain, drone };
  apply();
}

function apply(): void {
  if (!ctx || !layers) return;
  const t = ctx.currentTime;
  const to = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 1.2);
  to(layers.wind, wanted.raid ? 0.02 : wanted.night ? 0.085 : 0.05);
  to(layers.rain, wanted.rain && !wanted.raid ? 0.05 : wanted.rain ? 0.015 : 0);
  to(layers.drone, wanted.raid ? 0.07 : 0);
}

/** Liga o áudio no primeiro toque ou tecla. Chame uma vez. */
export function unlockOnGesture(): void {
  const go = () => start();
  window.addEventListener('pointerdown', go, { passive: true });
  window.addEventListener('keydown', go);
}

/** Diz ao ambiente o que está acontecendo; a troca é suave. */
export function setAmbience(a: Ambience): void {
  if (a.rain === wanted.rain && a.night === wanted.night && a.raid === wanted.raid) return;
  wanted = a;
  apply();
}

export const isMuted = (): boolean => muted;

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    // Sem armazenamento: vale só até recarregar.
  }
  if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05);
  return muted;
}

/** Nota curta: sobe de uma vez e some aos poucos. */
function tone(type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number): void {
  const ac = ctx!;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(master!);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

let white: AudioBuffer | null = null;
/** Estalo de ruído filtrado: passo, golpe, remexer. */
function burst(type: BiquadFilterType, freq: number, at: number, dur: number, vol: number): void {
  const ac = ctx!;
  white ??= noise(ac, false);
  const src = ac.createBufferSource();
  src.buffer = white;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filter).connect(g).connect(master!);
  src.start(at, Math.random());
  src.stop(at + dur + 0.02);
}

export function sfx(name: Sfx): void {
  if (!ctx || !master || muted || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  switch (name) {
    case 'click':
      tone('triangle', 620, 480, t, 0.05, 0.05);
      break;
    case 'step':
      burst('lowpass', 260, t, 0.09, 0.22);
      break;
    case 'search':
      for (let k = 0; k < 3; k++) burst('bandpass', 1400 + k * 500, t + k * 0.09, 0.07, 0.1);
      break;
    case 'hit':
      burst('bandpass', 700, t, 0.16, 0.35);
      tone('sine', 110, 55, t, 0.22, 0.3);
      break;
    case 'good':
      tone('sine', 523, 523, t, 0.14, 0.09);
      tone('sine', 784, 784, t + 0.11, 0.22, 0.09);
      break;
    case 'bad':
      tone('sine', 196, 110, t, 0.5, 0.16);
      tone('sine', 147, 82, t + 0.05, 0.6, 0.1);
      break;
    case 'alert':
      for (let k = 0; k < 2; k++) {
        tone('square', 520, 520, t + k * 0.32, 0.12, 0.05);
        tone('square', 390, 390, t + k * 0.32 + 0.14, 0.14, 0.05);
      }
      break;
    case 'knock':
      for (let k = 0; k < 3; k++) {
        tone('sine', 150, 70, t + k * 0.17, 0.09, 0.3);
        burst('lowpass', 500, t + k * 0.17, 0.05, 0.15);
      }
      break;
  }
}
