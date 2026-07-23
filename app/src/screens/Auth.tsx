import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Me } from '../data'
import { useStore } from '../store'
import { Icon } from '../ui/Icons'
import { Logo } from '../ui/Logo'
import { t, translateServer } from '../lib/i18n'

type Step = 'login' | 'register' | 'forgot' | 'reset'

export function Auth() {
  const { actions } = useStore()
  const resetToken = new URLSearchParams(location.search).get('token')
  const [step, setStep] = useState<Step>(
    location.pathname === '/reset' && resetToken ? 'reset' : 'login',
  )
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // login
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  // register
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [nameCheck, setNameCheck] = useState<{ available: boolean; reason: string | null } | null>(null)
  const checkTimer = useRef(0)
  // forgot / reset
  const [forgotEmail, setForgotEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    setError(null)
    setInfo(null)
  }, [step])

  // live username availability check
  useEffect(() => {
    if (step !== 'register' || !username) {
      setNameCheck(null)
      return
    }
    window.clearTimeout(checkTimer.current)
    checkTimer.current = window.setTimeout(async () => {
      try {
        const r = await api.get<{ available: boolean; reason: string | null }>(
          `/auth/username-available?u=${encodeURIComponent(username)}`,
        )
        setNameCheck(r)
      } catch {
        setNameCheck(null)
      }
    }, 350)
  }, [username, step])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const doLogin = () =>
    run(async () => {
      const { user } = await api.post<{ user: Me }>('/auth/login', { identifier, password })
      await actions.afterLogin(user)
    })

  const doRegister = () =>
    run(async () => {
      const { user } = await api.post<{ user: Me; firstUser: boolean }>('/auth/register', {
        email,
        password: regPassword,
        username,
        displayName,
      })
      await actions.afterLogin(user)
    })

  const doForgot = () =>
    run(async () => {
      await api.post('/auth/request-reset', { email: forgotEmail })
      setInfo(t('resetSent'))
    })

  const doReset = () =>
    run(async () => {
      await api.post('/auth/reset', { token: resetToken, password: newPassword })
      history.replaceState(null, '', '/')
      setStep('login')
      setInfo(t('passwordUpdated'))
    })

  return (
    <div className="auth glass-panel">
      <div className="auth-step">
        <div className="auth-hero">
          <Logo size={92} animate />
          <h1>Libera</h1>
          <p className="tagline">{t('tagline')}</p>
        </div>

        {error && <div className="form-error">{error}</div>}
        {info && <div className="form-info">{info}</div>}

        {step === 'login' && (
          <div className="auth-actions">
            <div className="field glass">
              <Icon name="person" size={18} />
              <input
                placeholder={t('emailOrUsername')}
                value={identifier}
                autoComplete="username"
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </div>
            <div className="field glass">
              <Icon name="key" size={18} />
              <input
                type="password"
                placeholder={t('password')}
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && identifier && password && doLogin()}
              />
            </div>
            <button className="btn primary" disabled={busy || !identifier || !password} onClick={doLogin}>
              {busy ? t('signingIn') : t('signIn')}
            </button>
            <button className="link-btn" onClick={() => setStep('forgot')}>{t('forgotPassword')}</button>
            <div className="divider"><span>{t('newHere')}</span></div>
            <button className="btn glass" onClick={() => setStep('register')}>{t('createAnAccount')}</button>
          </div>
        )}

        {step === 'register' && (
          <div className="auth-actions">
            <div className="field glass">
              <Icon name="person" size={18} />
              <input placeholder={t('email')} type="email" autoComplete="email"
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field glass">
              <span className="at">@</span>
              <input placeholder={t('usernameUnique')} autoComplete="off" value={username}
                     onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} />
              {username && nameCheck && (
                <span className={`avail ${nameCheck.available ? 'ok' : 'bad'}`}>
                  {nameCheck.available ? t('available') : t('taken')}
                </span>
              )}
            </div>
            {username && nameCheck && !nameCheck.available && nameCheck.reason && (
              <p className="field-hint">{translateServer(nameCheck.reason)}</p>
            )}
            <div className="field glass">
              <Icon name="pencil" size={17} />
              <input placeholder={t('displayName')} value={displayName}
                     onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="field glass">
              <Icon name="key" size={18} />
              <input type="password" placeholder={t('passwordMin8')} autoComplete="new-password"
                     value={regPassword} onChange={(e) => setRegPassword(e.target.value)} />
            </div>
            <button
              className="btn primary"
              disabled={busy || !email || !username || !displayName || regPassword.length < 8 || nameCheck?.available === false}
              onClick={doRegister}
            >
              {busy ? t('creatingAccount') : t('createAccount')}
            </button>
            <p className="auth-note">
              <Icon name="info" size={13} /> {t('photoAfterSignup')}
            </p>
            <button className="link-btn" onClick={() => setStep('login')}>{t('haveAccount')}</button>
          </div>
        )}

        {step === 'forgot' && (
          <div className="auth-actions">
            <p className="auth-sub">{t('forgotIntro')}</p>
            <div className="field glass">
              <Icon name="person" size={18} />
              <input placeholder={t('email')} type="email" value={forgotEmail}
                     onChange={(e) => setForgotEmail(e.target.value)} />
            </div>
            <button className="btn primary" disabled={busy || !forgotEmail} onClick={doForgot}>
              {t('sendResetLink')}
            </button>
            <button className="link-btn" onClick={() => setStep('login')}>{t('backToSignIn')}</button>
          </div>
        )}

        {step === 'reset' && (
          <div className="auth-actions">
            <p className="auth-sub">{t('resetIntro')}</p>
            <div className="field glass">
              <Icon name="key" size={18} />
              <input type="password" placeholder={t('newPasswordMin8')} value={newPassword}
                     onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <button className="btn primary" disabled={busy || newPassword.length < 8} onClick={doReset}>
              {t('setNewPassword')}
            </button>
            <button className="link-btn" onClick={() => { history.replaceState(null, '', '/'); setStep('login') }}>
              {t('backToSignIn')}
            </button>
          </div>
        )}
      </div>

      <p className="auth-foot">
        <Icon name="lock" size={12} /> {t('authFoot')}
      </p>
    </div>
  )
}
