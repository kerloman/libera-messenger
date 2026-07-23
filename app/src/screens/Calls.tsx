import { useEffect, useRef, useState } from 'react'
import { fmtDuration, fmtTime } from '../data'
import type { CallLogItem } from '../data'
import { api } from '../lib/api'
import { acceptCall, declineCall, endCall, startCall, streams, switchCamera, toggleCamera, toggleMute } from '../lib/calls'
import { useStore } from '../store'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icons'
import { t } from '../lib/i18n'

export function Calls() {
  const { state } = useStore()
  const [calls, setCalls] = useState<CallLogItem[] | null>(null)

  const load = () =>
    api.get<{ calls: CallLogItem[] }>('/calls').then((r) => setCalls(r.calls)).catch(() => setCalls([]))

  useEffect(() => {
    load()
  }, [state.call]) // refresh when a call ends

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="head-row">
          <h1>{t('calls')}</h1>
        </div>
      </header>
      <div className="e2e-banner glass">
        <Icon name="lock" size={15} />
        <div>
          <b>{t('p2pCalls')}</b>
          <span>{t('p2pCallsSub')}</span>
        </div>
      </div>
      <div className="list">
        {calls === null && <div className="list-hint">{t('loading')}</div>}
        {calls?.length === 0 && (
          <div className="empty-list">
            <Icon name="phone" size={40} />
            <p><b>{t('noCalls')}</b></p>
            <span>{t('noCallsHint')}</span>
          </div>
        )}
        {calls?.map((c) => (
          <div key={c.id} className="row call-row">
            <Avatar name={c.peer.displayName} seed={c.peer.id} size={50} />
            <div className="row-main">
              <span className={`row-name${c.status === 'missed' && c.direction === 'in' ? ' missed' : ''}`}>
                {c.peer.displayName}
              </span>
              <span className="row-preview">
                <Icon name={c.direction === 'in' ? 'reply' : 'forward'} size={13}
                      className={c.status === 'missed' || c.status === 'declined' ? 'missed' : 'ok'} />{' '}
                {c.status === 'missed' ? t('missed') : c.status === 'declined' ? t('declined') : c.direction === 'in' ? t('incoming') : t('outgoing')}
                {c.video ? ` · ${t('video')}` : ''}
                {c.answeredAt && c.endedAt
                  ? ` · ${fmtDuration((new Date(c.endedAt).getTime() - new Date(c.answeredAt).getTime()) / 1000)}`
                  : ''}
              </span>
            </div>
            <span className="row-time">{fmtTime(c.startedAt)}</span>
            <button
              className="icon-btn"
              title={t('callBack')}
              onClick={() => startCall(c.chatId, { ...c.peer, avatar: null }, c.video)}
            >
              <Icon name={c.video ? 'video' : 'phone'} size={21} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function IncomingCall() {
  const { state } = useStore()
  const call = state.call!
  return (
    <div className="overlay call-overlay">
      <div className="call-card">
        <div className="pulse-wrap">
          <span className="pulse p1" /><span className="pulse p2" />
          <Avatar name={call.peer.displayName} seed={call.peer.id} avatar={call.peer.avatar} size={116} />
        </div>
        <h2>{call.peer.displayName}</h2>
        <p className="call-status">{call.video ? t('incomingVideoCall') : t('incomingVoiceCall')}</p>
        <div className="call-btns">
          <button className="call-btn end" onClick={declineCall} title={t('declineBtn')}>
            <Icon name="phone" size={24} />
            <span>{t('declineBtn')}</span>
          </button>
          <button className="call-btn accept" onClick={acceptCall} title={t('accept')}>
            <Icon name={call.video ? 'video' : 'phone'} size={24} />
            <span>{t('accept')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function CallOverlay() {
  const { state } = useStore()
  const call = state.call!
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const remoteAudio = useRef<HTMLAudioElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const [sec, setSec] = useState(0)
  const [sinkMsg, setSinkMsg] = useState<string | null>(null)

  // attach media streams (callTick bumps when they change)
  useEffect(() => {
    if (remoteVideo.current && streams.remote) remoteVideo.current.srcObject = streams.remote
    if (remoteAudio.current && streams.remote) remoteAudio.current.srcObject = streams.remote
    if (localVideo.current && streams.local) localVideo.current.srcObject = streams.local
  }, [state.callTick, call.video, call.phase])

  useEffect(() => {
    const t = setInterval(
      () => setSec(call.answeredAt ? Math.floor((Date.now() - call.answeredAt) / 1000) : 0),
      500,
    )
    return () => clearInterval(t)
  }, [call.answeredAt])

  const trySpeaker = async () => {
    const el = (call.video ? remoteVideo.current : remoteAudio.current) as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (!el?.setSinkId) return setSinkMsg(t('speakerUnsupported'))
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
    if (outs.length < 2) return setSinkMsg(t('noAltOutput'))
    const next = outs[(outs.findIndex((d) => d.deviceId === (el.sinkId || 'default')) + 1) % outs.length]
    await el.setSinkId(next.deviceId).catch(() => setSinkMsg(t('outputSwitchFail')))
    setSinkMsg(next.label || t('outputSwitched'))
    setTimeout(() => setSinkMsg(null), 1800)
  }

  const status =
    call.phase === 'outgoing' ? `${t('calling')} ${call.peer.displayName}…` : fmtDuration(sec)

  return (
    <div className={`overlay call-overlay${call.video ? ' video' : ''}`}>
      {call.video ? (
        <div className="remote-video">
          <video ref={remoteVideo} autoPlay playsInline />
          <video ref={localVideo} autoPlay playsInline muted className="pip" />
        </div>
      ) : (
        <audio ref={remoteAudio} autoPlay />
      )}
      <div className="call-card">
        {!call.video && (
          <div className="pulse-wrap">
            {call.phase === 'outgoing' && <><span className="pulse p1" /><span className="pulse p2" /></>}
            <Avatar name={call.peer.displayName} seed={call.peer.id} avatar={call.peer.avatar} size={116} />
          </div>
        )}
        <h2>{call.peer.displayName}</h2>
        <p className="call-status">{status}</p>
        {sinkMsg && <p className="sink-msg">{sinkMsg}</p>}
        <div className="call-btns">
          <button className={`call-btn glass-dark${call.muted ? ' on' : ''}`} onClick={toggleMute} title={t('muteBtn')}>
            <Icon name={call.muted ? 'micOff' : 'mic'} size={24} />
            <span>{t('muteBtn')}</span>
          </button>
          <button className="call-btn glass-dark" onClick={trySpeaker} title={t('audioBtn')}>
            <Icon name="speaker" size={24} />
            <span>{t('audioBtn')}</span>
          </button>
          {call.video && (
            <>
              <button className={`call-btn glass-dark${call.camOff ? ' on' : ''}`} onClick={toggleCamera} title={t('cameraBtn')}>
                <Icon name={call.camOff ? 'videoOff' : 'video'} size={24} />
                <span>{t('cameraBtn')}</span>
              </button>
              <button className="call-btn glass-dark" onClick={switchCamera} title={t('flipBtn')}>
                <Icon name="camera" size={24} />
                <span>{t('flipBtn')}</span>
              </button>
            </>
          )}
          <button className="call-btn end" onClick={endCall} title={t('endBtn')}>
            <Icon name="phone" size={24} />
            <span>{t('endBtn')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
