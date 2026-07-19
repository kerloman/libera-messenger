// Libera sound identity — a procedural Web Audio synth, not sample files.
//
// Every sound is built from one tonal language so the family is consistent:
//   • soft sine / triangle partials (never harsh saw/square except a tiny click)
//   • gentle exponential envelopes (fast soft attack, long smooth release)
//   • an algorithmic reverb send for "premium" space
//   • a master compressor + gentle low-pass for polish
// The signature motif — the "Libera bloom", an open rising fifth+octave —
// recurs in the ringtone, call-connect and push sound so the brand is audible.

export type SoundName =
  | 'messageSent' | 'messageReceived'
  | 'photoSent' | 'photoReceived'
  | 'fileSent' | 'fileReceived'
  | 'voiceSent' | 'voiceReceived'
  | 'storyPublished' | 'storyReaction' | 'messageReaction'
  | 'messageEdited' | 'messageDeleted'
  | 'ringIncoming' | 'ringOutgoing' | 'callConnected' | 'callEnded'
  | 'callDeclined' | 'callFailed' | 'callMissed' | 'callBusy'
  | 'push' | 'friendRequest' | 'newContact' | 'addedToGroup' | 'addedToChannel'
  | 'mention' | 'adminNotice' | 'securityNotice'
  | 'success' | 'error' | 'tap'

export type Category = 'message' | 'group' | 'channel' | 'call' | 'notification' | 'story'
export type Mode = 'default' | 'system' | 'silent'

export type SoundSettings = {
  master: number // 0..1
  haptics: boolean
  vibration: boolean
  categories: Record<Category, Mode>
}

export const defaultSoundSettings: SoundSettings = {
  master: 0.8,
  haptics: true,
  vibration: true,
  categories: { message: 'default', group: 'default', channel: 'default', call: 'default', notification: 'default', story: 'default' },
}

// Which category governs each sound.
const CATEGORY: Record<SoundName, Category> = {
  messageSent: 'message', messageReceived: 'message',
  photoSent: 'message', photoReceived: 'message',
  fileSent: 'message', fileReceived: 'message',
  voiceSent: 'message', voiceReceived: 'message',
  messageReaction: 'message', messageEdited: 'message', messageDeleted: 'message',
  storyPublished: 'story', storyReaction: 'story',
  ringIncoming: 'call', ringOutgoing: 'call', callConnected: 'call', callEnded: 'call',
  callDeclined: 'call', callFailed: 'call', callMissed: 'call', callBusy: 'call',
  push: 'notification', friendRequest: 'notification', newContact: 'notification',
  addedToGroup: 'group', addedToChannel: 'channel', mention: 'notification',
  adminNotice: 'notification', securityNotice: 'notification',
  success: 'message', error: 'message', tap: 'message',
}

// ---- note frequencies (a warm, pleasant register) ----
const N = {
  A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99,
  A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51, F6: 1396.91,
  G6: 1567.98, A6: 1760, C7: 2093,
} as const

type Note = { f: number; t: number; d: number; g?: number; type?: OscillatorType; rev?: number; glide?: number }

// ---- the sound library: each entry is a tiny "score" ----
const bloom = (base = 0): Note[] => [
  { f: N.A5, t: base + 0, d: 0.5, g: 0.5, rev: 0.5 },
  { f: N.E6, t: base + 0.07, d: 0.5, g: 0.45, rev: 0.5 },
  { f: N.A6, t: base + 0.14, d: 0.6, g: 0.4, rev: 0.6 },
]

const SCORES: Record<SoundName, () => Note[]> = {
  // messages — send rises (leaving), receive settles
  messageSent: () => [{ f: N.E6, t: 0, d: 0.12, g: 0.42, type: 'triangle' }, { f: N.A6, t: 0.055, d: 0.16, g: 0.4, type: 'triangle', rev: 0.3 }],
  messageReceived: () => [{ f: N.A6, t: 0, d: 0.14, g: 0.4 }, { f: N.E6, t: 0.06, d: 0.24, g: 0.42, rev: 0.4 }],
  photoSent: () => [{ f: N.G6, t: 0, d: 0.1, g: 0.36, type: 'triangle' }, { f: N.C7, t: 0.05, d: 0.16, g: 0.34, rev: 0.35 }],
  photoReceived: () => [{ f: N.C7, t: 0, d: 0.12, g: 0.34 }, { f: N.G6, t: 0.06, d: 0.22, g: 0.38, rev: 0.4 }],
  fileSent: () => [{ f: N.D6, t: 0, d: 0.12, g: 0.4, type: 'triangle' }, { f: N.A5, t: 0.06, d: 0.2, g: 0.3, type: 'sine' }],
  fileReceived: () => [{ f: N.A5, t: 0, d: 0.14, g: 0.34 }, { f: N.D6, t: 0.07, d: 0.24, g: 0.38, rev: 0.4 }],
  voiceSent: () => [{ f: N.E6, t: 0, d: 0.26, g: 0.36, type: 'triangle', glide: N.G6, rev: 0.3 }],
  voiceReceived: () => [{ f: N.G6, t: 0, d: 0.28, g: 0.36, glide: N.E6, rev: 0.4 }],
  messageReaction: () => [{ f: N.C7, t: 0, d: 0.09, g: 0.34, rev: 0.25 }],
  messageEdited: () => [{ f: N.D6, t: 0, d: 0.18, g: 0.3, rev: 0.3 }],
  messageDeleted: () => [{ f: N.D6, t: 0, d: 0.12, g: 0.28 }, { f: N.A5, t: 0.07, d: 0.2, g: 0.26 }],

  // stories
  storyPublished: () => [{ f: N.C6, t: 0, d: 0.2, g: 0.36 }, { f: N.E6, t: 0.08, d: 0.2, g: 0.34 }, { f: N.G6, t: 0.16, d: 0.4, g: 0.34, rev: 0.55 }],
  storyReaction: () => [{ f: N.A6, t: 0, d: 0.1, g: 0.34, rev: 0.3 }],

  // calls — ringtone carries the signature bloom
  ringIncoming: () => [...bloom(0), ...bloom(0.62)],
  ringOutgoing: () => [{ f: N.A5, t: 0, d: 0.35, g: 0.3, rev: 0.4 }, { f: N.A5, t: 0.5, d: 0.35, g: 0.3, rev: 0.4 }],
  callConnected: () => [{ f: N.E6, t: 0, d: 0.14, g: 0.4 }, { f: N.A6, t: 0.08, d: 0.3, g: 0.4, rev: 0.5 }],
  callEnded: () => [{ f: N.A6, t: 0, d: 0.14, g: 0.34 }, { f: N.E6, t: 0.08, d: 0.28, g: 0.34, rev: 0.35 }],
  callDeclined: () => [{ f: N.E5, t: 0, d: 0.16, g: 0.32 }, { f: N.C5, t: 0.09, d: 0.28, g: 0.3 }],
  callFailed: () => [{ f: N.F5, t: 0, d: 0.18, g: 0.32 }, { f: N.D5, t: 0.11, d: 0.32, g: 0.3 }],
  callMissed: () => [{ f: N.A5, t: 0, d: 0.14, g: 0.34 }, { f: N.C6, t: 0.08, d: 0.3, g: 0.34, rev: 0.4 }],
  callBusy: () => [{ f: N.D5, t: 0, d: 0.16, g: 0.28 }, { f: N.D5, t: 0.28, d: 0.16, g: 0.28 }],

  // notifications
  push: () => [{ f: N.E6, t: 0, d: 0.14, g: 0.4 }, { f: N.A6, t: 0.07, d: 0.28, g: 0.4, rev: 0.45 }],
  friendRequest: () => [{ f: N.C6, t: 0, d: 0.14, g: 0.38 }, { f: N.G6, t: 0.08, d: 0.28, g: 0.36, rev: 0.45 }],
  newContact: () => [{ f: N.E6, t: 0, d: 0.14, g: 0.36 }, { f: N.A6, t: 0.08, d: 0.26, g: 0.34, rev: 0.4 }],
  addedToGroup: () => [{ f: N.C6, t: 0, d: 0.16, g: 0.36 }, { f: N.E6, t: 0.08, d: 0.16, g: 0.34 }, { f: N.A6, t: 0.16, d: 0.34, g: 0.34, rev: 0.5 }],
  addedToChannel: () => [{ f: N.G5, t: 0, d: 0.16, g: 0.36 }, { f: N.C6, t: 0.08, d: 0.16, g: 0.34 }, { f: N.E6, t: 0.16, d: 0.34, g: 0.34, rev: 0.5 }],
  mention: () => [{ f: N.A6, t: 0, d: 0.12, g: 0.42, type: 'triangle' }, { f: N.E6, t: 0.06, d: 0.12, g: 0.38 }, { f: N.A6, t: 0.12, d: 0.24, g: 0.4, rev: 0.4 }],
  adminNotice: () => [{ f: N.F5, t: 0, d: 0.16, g: 0.34 }, { f: N.A5, t: 0.09, d: 0.26, g: 0.32, rev: 0.35 }],
  securityNotice: () => [{ f: N.A5, t: 0, d: 0.16, g: 0.34 }, { f: N.F5, t: 0.1, d: 0.16, g: 0.3 }, { f: N.A5, t: 0.2, d: 0.3, g: 0.32, rev: 0.4 }],

  // ui
  success: () => [{ f: N.C6, t: 0, d: 0.12, g: 0.36 }, { f: N.E6, t: 0.07, d: 0.12, g: 0.34 }, { f: N.G6, t: 0.14, d: 0.3, g: 0.34, rev: 0.45 }],
  error: () => [{ f: N.E5, t: 0, d: 0.14, g: 0.3 }, { f: N.C5, t: 0.1, d: 0.26, g: 0.3 }],
  tap: () => [{ f: N.A6, t: 0, d: 0.05, g: 0.2 }],
}

// ---- engine ----
let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverb: ConvolverNode | null = null
let reverbGain: GainNode | null = null
let settings: SoundSettings = defaultSoundSettings
let currentLoop: { stop: () => void } | null = null

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.ratio.value = 3
    comp.attack.value = 0.003
    comp.release.value = 0.25
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 8200 // shave harshness for a soft top end
    master = ctx.createGain()
    master.gain.value = settings.master
    reverbGain = ctx.createGain()
    reverbGain.gain.value = 1
    reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx, 1.1, 2.6)
    // dry + wet → lowpass → compressor → destination
    master.connect(lp)
    reverb.connect(reverbGain).connect(lp)
    lp.connect(comp).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function makeImpulse(c: BaseAudioContext, seconds: number, decay: number) {
  const rate = c.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = c.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return buf
}

function playNote(c: AudioContext, n: Note, at: number) {
  const osc = c.createOscillator()
  osc.type = n.type ?? 'sine'
  osc.frequency.setValueAtTime(n.f, at)
  if (n.glide) osc.frequency.exponentialRampToValueAtTime(n.glide, at + n.d)

  const env = c.createGain()
  const peak = (n.g ?? 0.4)
  env.gain.setValueAtTime(0.0001, at)
  env.gain.exponentialRampToValueAtTime(peak, at + 0.008) // soft fast attack
  env.gain.exponentialRampToValueAtTime(0.0001, at + n.d) // smooth release

  osc.connect(env)
  env.connect(master!)
  if (n.rev && reverb) {
    const send = c.createGain()
    send.gain.value = n.rev
    env.connect(send).connect(reverb)
  }
  osc.start(at)
  osc.stop(at + n.d + 0.05)
}

function playScore(notes: Note[]) {
  const c = ensureCtx()
  if (!c || !master) return
  const now = c.currentTime + 0.01
  for (const n of notes) playNote(c, n, now + n.t)
}

// ---- public API ----
export function configureSound(s: SoundSettings) {
  settings = s
  if (master && ctx) master.gain.setTargetAtTime(s.master, ctx.currentTime, 0.05)
}

// Unlock audio on the first user gesture (autoplay policies).
export function unlockAudio() {
  ensureCtx()
}

export function preview(name: SoundName) {
  playScore(SCORES[name]())
  haptic(hapticFor(name))
}

export function play(name: SoundName) {
  const cat = CATEGORY[name]
  const mode = settings.categories[cat] ?? 'default'
  // 'system' defers to the OS (the notification layer plays the device sound);
  // we only synthesize for the branded 'default' mode.
  if (mode === 'default') playScore(SCORES[name]())
  if (mode !== 'silent') haptic(hapticFor(name))
}

// Looping ringtone for calls.
export function startRing(name: 'ringIncoming' | 'ringOutgoing') {
  stopRing()
  const mode = settings.categories.call
  if (mode === 'silent') {
    if (name === 'ringIncoming') hapticLoop()
    return
  }
  const period = name === 'ringIncoming' ? 3.0 : 1.6
  if (mode === 'default') playScore(SCORES[name]())
  const iv = window.setInterval(() => {
    if (mode === 'default') playScore(SCORES[name]())
    if (name === 'ringIncoming') haptic('heavy')
  }, period * 1000)
  const hl = name === 'ringIncoming' ? hapticLoopHandle() : 0
  currentLoop = { stop: () => { window.clearInterval(iv); if (hl) window.clearInterval(hl) } }
}

export function stopRing() {
  currentLoop?.stop()
  currentLoop = null
}

// ---- haptics ----
export type Haptic = 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'none'

const PATTERNS: Record<Haptic, number | number[]> = {
  light: 8, medium: 16, heavy: [120, 60, 120], success: [10, 40, 12], error: [26, 40, 26], none: 0,
}

function hapticFor(name: SoundName): Haptic {
  if (name === 'ringIncoming') return 'heavy'
  if (name === 'success' || name === 'callConnected' || name === 'storyPublished') return 'success'
  if (name === 'error' || name === 'callFailed') return 'error'
  if (name.endsWith('Sent') || name === 'messageReaction' || name === 'tap') return 'light'
  return 'medium'
}

let capHaptics: { impact?: (o: { style: string }) => void; notification?: (o: { type: string }) => void } | null = null
async function loadCapacitor() {
  if (capHaptics !== null) return
  try {
    // Native haptics on iOS/Android when running under Capacitor. The package
    // is an optional native dependency, so the specifier is kept dynamic to
    // avoid a hard build-time resolution on web-only installs.
    const spec = '@capacitor/haptics'
    const mod = (await import(/* @vite-ignore */ spec)) as {
      Haptics: { impact: (o: { style: string }) => void; notification: (o: { type: string }) => void }
    }
    capHaptics = { impact: (o) => mod.Haptics.impact(o), notification: (o) => mod.Haptics.notification(o) }
  } catch {
    capHaptics = {}
  }
}

export function haptic(kind: Haptic) {
  if (!settings.haptics || kind === 'none') return
  loadCapacitor().then(() => {
    if (capHaptics?.impact) {
      if (kind === 'success' || kind === 'error') capHaptics.notification?.({ type: kind.toUpperCase() })
      else capHaptics.impact?.({ style: kind === 'light' ? 'LIGHT' : kind === 'heavy' ? 'HEAVY' : 'MEDIUM' })
      return
    }
    // Web fallback (Android/Chrome; iOS Safari has no Vibration API).
    if (settings.vibration && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(PATTERNS[kind])
  })
}

function hapticLoopHandle() {
  if (!settings.vibration || typeof navigator === 'undefined' || !navigator.vibrate) return 0
  return window.setInterval(() => navigator.vibrate?.(PATTERNS.heavy), 3000)
}
function hapticLoop() { hapticLoopHandle() }

export const SOUND_NAMES = Object.keys(SCORES) as SoundName[]
