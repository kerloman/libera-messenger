import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LastSeenMode, Privacy as PrivacyT, Visibility } from '../data'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Icon } from '../ui/Icons'
import { t } from '../lib/i18n'

const VIS = (): { value: Visibility; label: string }[] => [
  { value: 'everyone', label: t('everyone') },
  { value: 'contacts', label: t('myContacts') },
  { value: 'nobody', label: t('nobody') },
]

const LASTSEEN_MODES = (): { value: LastSeenMode; label: string }[] => [
  { value: 'exact', label: t('showExactTime') },
  { value: 'recently', label: t('lastSeenRecently') },
  { value: 'week', label: t('lastSeenWeek') },
  { value: 'month', label: t('lastSeenMonth') },
  { value: 'long', label: t('lastSeenLong') },
]

export function Privacy({ onClose }: { onClose: () => void }) {
  const { state, dispatch, actions } = useStore()
  const p = state.me!.privacy

  const save = async (patch: Partial<PrivacyT>) => {
    // optimistic update, then persist; server broadcasts to other devices
    const optimistic = { ...p, ...patch }
    dispatch({ type: 'PRIVACY', privacy: optimistic })
    try {
      const { privacy } = await api.patch<{ privacy: PrivacyT }>('/me/privacy', patch)
      dispatch({ type: 'PRIVACY', privacy })
    } catch (e) {
      dispatch({ type: 'PRIVACY', privacy: p }) // revert
      actions.toast((e as Error).message)
    }
  }

  return (
    <div className="overlay profile-overlay" onClick={onClose}>
      <div className="profile-page glass-panel" onClick={(e) => e.stopPropagation()}>
        <header className="pp-head">
          <button className="icon-btn" onClick={onClose}><Icon name="back" size={22} /></button>
          <span className="pp-head-title">{t('privacySecurity')}</span>
        </header>

        <div className="pp-scroll priv-scroll">
          <p className="priv-intro">
            {t('privacyIntro')}
          </p>

          <Group label={t('lastSeenOnline')}>
            <VisRow icon="eye" tint="#32ADE6" label={t('lastSeenLabel')} value={p.lastSeen} onChange={(v) => save({ lastSeen: v })} />
            {p.lastSeen !== 'nobody' && (
              <SelectRow
                icon="clock" tint="#5E5CE6" label={t('lastSeenPrecision')}
                value={p.lastSeenMode}
                options={LASTSEEN_MODES()}
                onChange={(v) => save({ lastSeenMode: v as LastSeenMode })}
              />
            )}
            <VisRow icon="wave" tint="#30C465" label={t('onlineStatus')} value={p.online} onChange={(v) => save({ online: v })} />
          </Group>

          <Group label={t('profile')}>
            <VisRow icon="photo" tint="#FF9F0A" label={t('profilePhoto')} value={p.photo} onChange={(v) => save({ photo: v })} />
            <VisRow icon="info" tint="#BF5AF2" label={t('bio')} value={p.bio} onChange={(v) => save({ bio: v })} />
            <VisRow icon="person" tint="#FF6B4A" label={t('emailAddress')} value={p.email} onChange={(v) => save({ email: v })} />
          </Group>

          <Group label={t('callsMessaging')}>
            <VisRow icon="phone" tint="#30C465" label={t('whoCanCall')} value={p.calls} onChange={(v) => save({ calls: v })} />
            <ToggleRow icon="checks" tint="#4D7CFE" label={t('readReceipts')}
                       sub={t('readReceiptsSub')}
                       on={p.readReceipts} onChange={(v) => save({ readReceipts: v })} />
            <ToggleRow icon="pencil" tint="#FF9F0A" label={t('typingIndicator')}
                       sub={t('typingIndicatorSub')}
                       on={p.typingIndicator} onChange={(v) => save({ typingIndicator: v })} />
          </Group>

          <div className="priv-note">
            <Icon name="shield" size={15} />
            <span>
              {t('privacyNote')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
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
      <div className="set-main">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      <div className="set-side">{children}</div>
    </div>
  )
}

function VisRow({ icon, tint, label, value, onChange }: {
  icon: string; tint: string; label: string; value: Visibility; onChange: (v: Visibility) => void
}) {
  return (
    <RowShell icon={icon} tint={tint} label={label}>
      <div className="seg glass vis-seg">
        {VIS().map((o) => (
          <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </RowShell>
  )
}

function SelectRow({ icon, tint, label, value, options, onChange }: {
  icon: string; tint: string; label: string; value: string
  options: { value: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <RowShell icon={icon} tint={tint} label={label}>
      <select className="select glass" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </RowShell>
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
