let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!_ctx) {
    _ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
  }
  return _ctx;
}

// Call this inside any click/keydown handler to create + resume the AudioContext.
export function unlockAdminAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

function beep(ctx: AudioContext, freq: number, startOffset: number, duration: number, gain: number): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = ctx.currentTime + startOffset;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Short single-note confirm — call directly from a click handler.
export function playConfirmTone(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const play = () => beep(ctx, 880, 0, 0.12, 0.3);
  if (ctx.state === 'running') { play(); return; }
  void ctx.resume().then(play);
}

// Ascending G4 → B4 → D5 — for Realtime callbacks (only if ctx already running).
export function playNewOrderChime(): void {
  if (!_ctx || _ctx.state !== 'running') return;
  beep(_ctx, 392, 0,    0.18, 0.4);
  beep(_ctx, 494, 0.20, 0.18, 0.4);
  beep(_ctx, 587, 0.40, 0.35, 0.5);
}
