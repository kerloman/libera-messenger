import type { ReactNode } from 'react'
import { useStore } from '../store'
import type { Category, Mode, SoundName, SoundSettings } from '../lib/sound'
import { preview } from '../lib/sound'
import { Icon } from '../ui/Icons'
import { t } from '../lib/i18n'

const MODES = (): { value: Mode; label: string }[] => [
  { value: 'default', label: t('modeLibera') },
  { value: 'system', label: t('modeSystem') },
  { value: 'silent', label: t('modeSilent') },
]

// A representative sound to preview for each category.
const PREVIEW: Record<Category, SoundName> = {
  message: 'messageReceived',
  group: 'addedToGroup',
  channel: 'addedToChannel',
  call: 'ringIncoming',
  notification: 'push',
  story: 'storyPublished',
}

const CATEGORIES = (): { key: Category; icon: string; tint: string; label: string; sub: string }[] => [
  { key: 'message', icon: 'chat', tint: '#4D7CFE', label: t('catMessages'), sub: t('catMessagesSub') },
  { key: 'call', icon: 'phone', tint: '#30C465', label: t('catCalls'), sub: t('catCallsSub') },
  { key: 'notification', icon: 'bell', tint: '#FF4D5E', label: t('catNotifications'), sub: t('catNotificationsSub') },
  { key: 'story', icon: 'photo', tint: '#FF9F0A', label: t('catStories'), sub: t('catStoriesSub') },
  { key: 'group', icon: 'users', tint: '#BF5AF2', label: t('catGroups'), sub: t('catGroupsSub') },
  { key: 'channel', icon: 'speaker', tint: '#5E5CE6', label: t('catChannels'), sub: t('catChannelsSub') },
]

// Sounds you can audition individually, grouped, so the whole identity is previewable.
const LIBRARY = (): { group: string; items: { name: SoundName; label: string }[] }[] => [
  { group: t('catMessages'), items: [
    { name: 'messageSent', label: t('sMessageSent') }, { name: 'messageReceived', label: t('sMessageReceived') },
    { name: 'photoSent', label: t('sPhotoSent') }, { name: 'photoReceived', label: t('sPhotoReceived') },
    { name: 'fileSent', label: t('sFileSent') }, { name: 'fileReceived', label: t('sFileReceived') },
    { name: 'voiceSent', label: t('sVoiceSent') }, { name: 'voiceReceived', label: t('sVoiceReceived') },
    { name: 'messageReaction', label: t('sReaction') }, { name: 'messageEdited', label: t('sEdited') }, { name: 'messageDeleted', label: t('sDeleted') },
  ] },
  { group: t('catCalls'), items: [
    { name: 'ringIncoming', label: t('sRingIncoming') }, { name: 'ringOutgoing', label: t('sRingback') },
    { name: 'callConnected', label: t('sConnected') }, { name: 'callEnded', label: t('sEnded') },
    { name: 'callDeclined', label: t('sDeclined') }, { name: 'callFailed', label: t('sFailed') },
    { name: 'callMissed', label: t('sMissed') }, { name: 'callBusy', label: t('sBusy') },
  ] },
  { group: t('catNotifications'), items: [
    { name: 'push', label: t('sPush') }, { name: 'mention', label: t('sMention') },
    { name: 'friendRequest', label: t('sFriendRequest') }, { name: 'newContact', label: t('sNewContact') },
    { name: 'addedToGroup', label: t('sAddedGroup') }, { name: 'addedToChannel', label: t('sAddedChannel') },
    { name: 'adminNotice', label: t('sAdmin') }, { name: 'securityNotice', label: t('sSecurity') },
  ] },
  { group: t('storiesUi'), items: [
    { name: 'storyPublished', label: t('sStoryPublished') }, { name: 'storyReaction', label: t('sStoryReaction') },
    { name: 'success', label: t('sSuccess') }, { name: 'error', label: t('sError') },
  ] },
]

export function SoundsHaptics({ onClose }: { onClose: () => void }) {
  const { state, dispatch, actions } = useStore()
  const s = state.prefs.sound

  const setSound = (patch: Partial<SoundSettings>) =>
    dispatch({ type: 'PREF', key: 'sound', value: { ...s, ...patch } })
  const setCategory = (cat: Category, mode: Mode) =>
    setSound({ categories: { ...s.categories, [cat]: mode } })

  return (
    <div className="overlay profile-overlay" onClick={onClose}>
      <div className="profile-page glass-panel" onClick={(e) => e.stopPropagation()}>
        <header className="pp-head">
          <button className="icon-btn" onClick={onClose}><Icon name="back" size={22} /></button>
          <span className="pp-head-title">{t('soundsHaptics')}</span>
        </header>

        <div className="pp-scroll priv-scroll">
          <p className="priv-intro">
            {t('soundsIntro')}
          </p>

          <Group label={t('master')}>
            <RowShell icon="speaker" tint="#32ADE6" label={t('volume')}>
              <input className="slider" type="range" min="0" max="1" step="0.05"
                     value={s.master} onChange={(e) => setSound({ master: Number(e.target.value) })} />
            </RowShell>
            <ToggleRow icon="wave" tint="#30C465" label={t('hapticFeedback')} sub={t('hapticSub')}
                       on={s.haptics} onChange={(v) => setSound({ haptics: v })} />
            <ToggleRow icon="bell" tint="#FF9F0A" label={t('vibration')} sub={t('vibrationSub')}
                       on={s.vibration} onChange={(v) => setSound({ vibration: v })} />
          </Group>

          <Group label={t('soundCategories')}>
            {CATEGORIES().map((c) => (
              <RowShell key={c.key} icon={c.icon} tint={c.tint} label={c.label} sub={c.sub}>
                <div className="sound-row-side">
                  <button className="preview-btn" title={t('previewGroup')} onClick={() => preview(PREVIEW[c.key])}>
                    <Icon name="send" size={15} />
                  </button>
                  <div className="seg glass mode-seg">
                    {MODES().map((m) => (
                      <button key={m.value} className={s.categories[c.key] === m.value ? 'on' : ''}
                              onClick={() => setCategory(c.key, m.value)}>{m.label}</button>
                    ))}
                  </div>
                </div>
              </RowShell>
            ))}
          </Group>

          {LIBRARY().map((grp) => (
            <Group key={grp.group} label={`${t('previewGroup')} · ${grp.group}`}>
              <div className="sound-grid">
                {grp.items.map((it) => (
                  <button key={it.name} className="sound-chip" onClick={() => preview(it.name)}>
                    <Icon name="send" size={13} /> {it.label}
                  </button>
                ))}
              </div>
            </Group>
          ))}

          <button className="logout-btn glass" style={{ color: 'var(--accent)' }}
                  onClick={() => { setSound({ ...defaultReset() }); actions.toast(t('defaultsRestored')) }}>
            {t('restoreDefaults')}
          </button>

          <div className="priv-note">
            <Icon name="info" size={15} />
            <span>
              {t('soundNote')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function defaultReset(): Partial<SoundSettings> {
  return {
    master: 0.8, haptics: true, vibration: true,
    categories: { message: 'default', group: 'default', channel: 'default', call: 'default', notification: 'default', story: 'default' },
  }
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <span className="group-label">{label}</span>
      <div className="group-card glass">{children}</div>
    </div>
  )
}

function RowShell({ icon, tint, label, sub, children }: { icon: string; tint: string; label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="set-row priv-row">
      <div className="set-ic" style={{ background: tint }}><Icon name={icon} size={17} stroke={2} /></div>
      <div className="set-main"><span>{label}</span>{sub && <small>{sub}</small>}</div>
      <div className="set-side">{children}</div>
    </div>
  )
}

function ToggleRow({ icon, tint, label, sub, on, onChange }: {
  icon: string; tint: string; label: string; sub?: string; on: boolean; onChange: (v: boolean) => void
}) {
  return (
    <RowShell icon={icon} tint={tint} label={label} sub={sub}>
      <button className={`toggle${on ? ' on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
        <span className="knob" />
      </button>
    </RowShell>
  )
}
