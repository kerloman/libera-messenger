// WebRTC call engine. Signaling runs over the app's Socket.IO connection;
// media flows peer-to-peer (STUN/TURN from server config).
import type { User } from '../data'
import { api } from './api'
import { getSocket } from './socket'
import { play as playSound, startRing, stopRing } from './sound'

export type CallPhase = 'incoming' | 'outgoing' | 'active'
export type CallUI = {
  callId: string | null
  chatId: string
  video: boolean
  phase: CallPhase
  peer: Pick<User, 'id' | 'username' | 'displayName' | 'avatar'>
  muted: boolean
  camOff: boolean
  answeredAt: number | null
}

type Hooks = {
  onCall: (ui: CallUI | null) => void
  onStreams: () => void
  onToast: (msg: string) => void
}

let hooks: Hooks | null = null
let pc: RTCPeerConnection | null = null
let ui: CallUI | null = null
let pendingOffer: RTCSessionDescriptionInit | null = null
let queuedRemoteIce: RTCIceCandidateInit[] = []
let queuedLocalIce: RTCIceCandidateInit[] = []

export const streams: { local: MediaStream | null; remote: MediaStream | null } = {
  local: null,
  remote: null,
}

function setUi(next: CallUI | null) {
  ui = next
  hooks?.onCall(ui ? { ...ui } : null)
}

function cleanup() {
  streams.local?.getTracks().forEach((t) => t.stop())
  streams.local = null
  streams.remote = null
  pc?.close()
  pc = null
  pendingOffer = null
  queuedRemoteIce = []
  queuedLocalIce = []
  setUi(null)
}

async function makePeer(video: boolean) {
  const cfg = await api.get<{ iceServers: RTCIceServer[] }>('/config')
  pc = new RTCPeerConnection({ iceServers: cfg.iceServers })
  try {
    streams.local = await navigator.mediaDevices.getUserMedia({ audio: true, video })
  } catch {
    throw new Error(video ? 'Camera/microphone access was denied.' : 'Microphone access was denied.')
  }
  streams.local.getTracks().forEach((t) => pc!.addTrack(t, streams.local!))
  pc.ontrack = (e) => {
    streams.remote = e.streams[0]
    hooks?.onStreams()
  }
  pc.onicecandidate = (e) => {
    if (!e.candidate) return
    const candidate = e.candidate.toJSON()
    if (ui?.callId) getSocket()?.emit('webrtc:ice', { callId: ui.callId, candidate })
    else queuedLocalIce.push(candidate)
  }
  hooks?.onStreams()
}

async function drainRemoteIce() {
  for (const c of queuedRemoteIce.splice(0)) await pc?.addIceCandidate(c).catch(() => {})
}
function drainLocalIce() {
  const s = getSocket()
  for (const c of queuedLocalIce.splice(0)) s?.emit('webrtc:ice', { callId: ui?.callId, candidate: c })
}

export function initCallEngine(h: Hooks) {
  hooks = h
  const s = getSocket()
  if (!s) return

  s.on('call:incoming', ({ callId, chatId, video, offer, caller }) => {
    if (ui) {
      // already in a call — auto-decline the second one
      s.emit('call:decline', { callId })
      return
    }
    pendingOffer = offer
    setUi({ callId, chatId, video, phase: 'incoming', peer: caller, muted: false, camOff: false, answeredAt: null })
    startRing('ringIncoming')
  })

  s.on('call:accepted', async ({ answer }) => {
    if (!pc || !ui) return
    await pc.setRemoteDescription(answer).catch(() => {})
    await drainRemoteIce()
    stopRing()
    playSound('callConnected')
    setUi({ ...ui, phase: 'active', answeredAt: Date.now() })
  })

  s.on('call:declined', () => {
    stopRing()
    playSound('callDeclined')
    hooks?.onToast('Call declined')
    cleanup()
  })

  s.on('call:ended', () => {
    stopRing()
    if (ui) { playSound('callEnded'); hooks?.onToast('Call ended') }
    cleanup()
  })

  s.on('webrtc:ice', async ({ candidate }) => {
    if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {})
    else queuedRemoteIce.push(candidate)
  })
}

export async function startCall(chatId: string, peer: CallUI['peer'], video: boolean) {
  if (ui) return
  try {
    await makePeer(video)
  } catch (e) {
    hooks?.onToast((e as Error).message)
    cleanup()
    return
  }
  setUi({ callId: null, chatId, video, phase: 'outgoing', peer, muted: false, camOff: false, answeredAt: null })
  startRing('ringOutgoing')
  const offer = await pc!.createOffer()
  await pc!.setLocalDescription(offer)
  getSocket()?.emit('call:invite', { chatId, video, offer }, (res: { callId?: string; error?: string }) => {
    if (!ui) return
    if (res?.error) {
      stopRing()
      playSound(res.error === 'offline' ? 'callMissed' : 'callFailed')
      hooks?.onToast(res.error === 'offline' ? `${peer.displayName} is offline — missed call logged` : res.error)
      cleanup()
      return
    }
    setUi({ ...ui, callId: res.callId! })
    drainLocalIce()
  })
}

export async function acceptCall() {
  if (!ui || ui.phase !== 'incoming' || !pendingOffer) return
  try {
    await makePeer(ui.video)
  } catch (e) {
    hooks?.onToast((e as Error).message)
    getSocket()?.emit('call:decline', { callId: ui.callId })
    cleanup()
    return
  }
  await pc!.setRemoteDescription(pendingOffer)
  await drainRemoteIce()
  const answer = await pc!.createAnswer()
  await pc!.setLocalDescription(answer)
  getSocket()?.emit('call:accept', { callId: ui.callId, answer })
  stopRing()
  playSound('callConnected')
  setUi({ ...ui, phase: 'active', answeredAt: Date.now() })
}

export function declineCall() {
  if (!ui) return
  stopRing()
  getSocket()?.emit('call:decline', { callId: ui.callId })
  cleanup()
}

export function endCall() {
  if (!ui) return
  stopRing()
  playSound('callEnded')
  if (ui.callId) getSocket()?.emit('call:end', { callId: ui.callId })
  cleanup()
}

export function toggleMute() {
  if (!ui || !streams.local) return
  const next = !ui.muted
  streams.local.getAudioTracks().forEach((t) => (t.enabled = !next))
  setUi({ ...ui, muted: next })
}

export function toggleCamera() {
  if (!ui || !streams.local) return
  const next = !ui.camOff
  streams.local.getVideoTracks().forEach((t) => (t.enabled = !next))
  setUi({ ...ui, camOff: next })
}

export async function switchCamera() {
  if (!pc || !streams.local) return
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  if (devices.length < 2) {
    hooks?.onToast('Only one camera available')
    return
  }
  const current = streams.local.getVideoTracks()[0]
  const currentId = current?.getSettings().deviceId
  const next = devices[(devices.findIndex((d) => d.deviceId === currentId) + 1) % devices.length]
  const media = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } })
  const track = media.getVideoTracks()[0]
  const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
  await sender?.replaceTrack(track)
  current?.stop()
  streams.local.removeTrack(current)
  streams.local.addTrack(track)
  hooks?.onStreams()
}
