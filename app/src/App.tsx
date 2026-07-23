import { useEffect, useState } from 'react'
import { useStore } from './store'
import type { Tab } from './store'
import { Auth } from './screens/Auth'
import { Chats } from './screens/Chats'
import { ChatView } from './screens/ChatView'
import { Calls, CallOverlay, IncomingCall } from './screens/Calls'
import { Settings } from './screens/Settings'
import { Admin } from './screens/Admin'
import { Icon } from './ui/Icons'
import { t as tr } from './lib/i18n'
import { Logo } from './ui/Logo'

const tabs: { id: Tab; labelKey: 'tabChats' | 'tabCalls' | 'tabSettings'; icon: string }[] = [
  { id: 'chats', labelKey: 'tabChats', icon: 'chat' },
  { id: 'calls', labelKey: 'tabCalls', icon: 'phone' },
  { id: 'settings', labelKey: 'tabSettings', icon: 'gear' },
]

export function App() {
  const { state, dispatch } = useStore()
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 980px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 980px)')
    const fn = () => setWide(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  if (!state.boot) {
    return (
      <div className="viewport">
        <Ambient />
        <div className="boot"><Logo size={72} animate /></div>
      </div>
    )
  }

  if (!state.me) {
    return (
      <div className="viewport">
        <Ambient />
        <Auth />
      </div>
    )
  }

  const unread = state.chats.reduce((s, c) => s + c.unread, 0)
  const tabScreen =
    state.tab === 'chats' ? <Chats /> : state.tab === 'calls' ? <Calls /> : <Settings />

  return (
    <div className="viewport">
      <Ambient />
      {wide ? (
        <div className="shell wide">
          <nav className="rail glass">
            <div className="rail-logo"><Logo size={38} /></div>
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`rail-btn${state.tab === t.id ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'TAB', tab: t.id })}
                title={tr(t.labelKey)}
              >
                <Icon name={t.icon} size={24} />
                {t.id === 'chats' && unread > 0 && <span className="badge">{unread}</span>}
              </button>
            ))}
          </nav>
          <aside className="pane-list">{tabScreen}</aside>
          <main className="pane-main">
            {state.activeChat ? (
              <ChatView key={state.activeChat} wide />
            ) : (
              <div className="empty-main">
                <Logo size={72} />
                <p>{tr('selectConversation')}</p>
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="shell narrow">
          {state.activeChat ? (
            <ChatView key={state.activeChat} />
          ) : (
            <>
              <div className="tab-content">{tabScreen}</div>
              <nav className="tabbar glass">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    className={`tab-btn${state.tab === t.id ? ' active' : ''}`}
                    onClick={() => dispatch({ type: 'TAB', tab: t.id })}
                  >
                    <span className="tab-icon">
                      <Icon name={t.icon} size={25} />
                      {t.id === 'chats' && unread > 0 && <span className="badge">{unread}</span>}
                    </span>
                    <span className="tab-label">{tr(t.labelKey)}</span>
                  </button>
                ))}
              </nav>
            </>
          )}
        </div>
      )}
      {state.call?.phase === 'incoming' && <IncomingCall />}
      {state.call && state.call.phase !== 'incoming' && <CallOverlay />}
      {state.admin && <Admin />}
      {state.toast && <div className="toast glass global">{state.toast}</div>}
    </div>
  )
}

function Ambient() {
  return (
    <div className="ambient" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
    </div>
  )
}
