import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, GraduationCap, KeyRound, Mail } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button, Card, Field, Input } from '../../components/ui'
import { useAuth } from './AuthProvider'
import { hasSupabaseConfig, requireSupabase } from '../../lib/supabase/client'
import { PASSWORD_MIN_LENGTH, requiresPasswordChange, validatePassword } from './password'

export function LoginPage() {
  const { session, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState(() => localStorage.getItem('agenda_docente_last_email') || 'feraimentor@gmail.com')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  if (session) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      localStorage.setItem('agenda_docente_last_email', email)
      const result = await requireSupabase().auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      const target = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(target, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return <AuthLayout><Card className="auth-card">
    <div className="auth-icon"><GraduationCap /></div>
    <p className="eyebrow">Agenda Docente</p><h1>Bom ter você de volta.</h1><p className="auth-lead">Sua próxima aula e tudo que importa, em um só lugar.</p>
    {!hasSupabaseConfig && <div className="config-notice"><strong>Configuração necessária</strong><span>Copie <code>.env.example</code> para <code>.env.local</code> e informe as chaves públicas do Supabase.</span></div>}
    
    {error && (
      <div style={{
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        color: '#fca5a5',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        fontSize: '0.85rem',
        marginBottom: '1rem',
        lineHeight: 1.4
      }}>
        {error}
      </div>
    )}

    <div style={{ marginBottom: '1rem' }}>
      <Button
        type="button"
        variant="secondary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem' }}
        disabled={!hasSupabaseConfig}
        onClick={async () => {
          try {
            setError('')
            await signInWithGoogle()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Falha ao iniciar login com Google.')
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
        <span>Continuar com o Google</span>
      </Button>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0', color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      <span style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
      <span>ou com e-mail</span>
      <span style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.1)' }} />
    </div>

    <form onSubmit={(event) => void submit(event)}>
      <Field label="E-mail"><div className="input-icon"><Mail size={17} /><Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></Field>
      <Field label="Senha"><div className="input-icon"><KeyRound size={17} /><Input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></div></Field>
      <div className="auth-row"><Link to="/forgot-password">Esqueci minha senha</Link></div>
      <Button type="submit" loading={loading} disabled={!hasSupabaseConfig}>Entrar</Button>
    </form>
  </Card></AuthLayout>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true)
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
      if (error) throw error
      setSent(true)
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Falha ao enviar recuperação.') }
    finally { setLoading(false) }
  }
  return <AuthLayout><Card className="auth-card compact">
    <Link className="back-link" to="/login"><ArrowLeft size={16} /> Voltar</Link>
    {sent ? <div className="success-panel"><CheckCircle2 /><h1>Confira seu e-mail</h1><p>Enviamos um link de recuperação para <strong>{email}</strong>.</p></div> : <><p className="eyebrow">Recuperar acesso</p><h1>Redefina sua senha.</h1><p className="auth-lead">Informe o e-mail do seu usuário Master.</p><form onSubmit={(event) => void submit(event)}><Field label="E-mail"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field><Button type="submit" loading={loading}>Enviar link</Button></form></>}
  </Card></AuthLayout>
}

export function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) return toast.error('As senhas não coincidem.')
    const passwordError = validatePassword(password)
    if (passwordError) return toast.error(passwordError)
    setLoading(true)
    try {
      const { error } = await requireSupabase().auth.updateUser({ password })
      if (error) throw error
      toast.success('Senha atualizada com sucesso.')
      navigate('/')
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : 'Falha ao atualizar senha.') }
    finally { setLoading(false) }
  }
  return <PasswordFormLayout eyebrow="Nova senha" title="Crie uma senha segura." lead="Sua senha deve ter 12 caracteres, com letras maiúsculas e minúsculas, número e símbolo." password={password} confirmation={confirmation} loading={loading} onPassword={setPassword} onConfirmation={setConfirmation} onSubmit={submit} buttonLabel="Salvar nova senha" />
}

export function FirstAccessPage() {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  if (!requiresPasswordChange(user)) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) return toast.error('As senhas não coincidem.')
    const passwordError = validatePassword(password)
    if (passwordError) return toast.error(passwordError)
    setLoading(true)
    try {
      const client = requireSupabase()
      const current = await client.auth.getUser()
      if (current.error || !current.data.user) {
        await client.auth.signOut({ scope: 'local' })
        toast.info('Sua sessão foi encerrada. Entre com a senha que você acabou de criar.')
        navigate('/login', { replace: true })
        return
      }
      if (!requiresPasswordChange(current.data.user)) {
        await client.auth.signOut({ scope: 'local' })
        toast.success('A troca já foi concluída. Entre com sua nova senha.')
        navigate('/login', { replace: true })
        return
      }

      const { error } = await client.functions.invoke('complete-first-access', { body: { password } })
      if (error) throw error
      await client.auth.signOut({ scope: 'local' })
      toast.success('Senha pessoal criada. Entre novamente para abrir sua agenda.')
      navigate('/login', { replace: true })
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Falha ao criar sua senha pessoal.')
    } finally {
      setLoading(false)
    }
  }

  return <PasswordFormLayout eyebrow="Primeiro acesso" title="Crie sua senha pessoal." lead="Por segurança, a senha temporária só libera esta etapa. Depois da troca, sua agenda será aberta." password={password} confirmation={confirmation} loading={loading} onPassword={setPassword} onConfirmation={setConfirmation} onSubmit={submit} buttonLabel="Criar senha e continuar" />
}

interface PasswordFormLayoutProps {
  eyebrow: string
  title: string
  lead: string
  password: string
  confirmation: string
  loading: boolean
  onPassword: (value: string) => void
  onConfirmation: (value: string) => void
  onSubmit: (event: FormEvent) => void
  buttonLabel: string
}

function PasswordFormLayout(props: PasswordFormLayoutProps) {
  return <AuthLayout><Card className="auth-card compact"><div className="auth-icon"><KeyRound /></div><p className="eyebrow">{props.eyebrow}</p><h1>{props.title}</h1><p className="auth-lead">{props.lead}</p><form onSubmit={props.onSubmit}><Field label="Nova senha" hint={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`}><Input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={props.password} onChange={(event) => props.onPassword(event.target.value)} required /></Field><Field label="Confirmar senha"><Input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} value={props.confirmation} onChange={(event) => props.onConfirmation(event.target.value)} required /></Field><Button type="submit" loading={props.loading}>{props.buttonLabel}</Button></form></Card></AuthLayout>
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-visual" aria-hidden="true">
        <div className="visual-orbit orbit-one" />
        <div className="visual-orbit orbit-two" />
        <div className="visual-copy">
          <span>CALM TECHNOLOGY · COCKPIT DO PROFESSOR</span>
          <strong>Sua rotina docente<br />com serenidade.</strong>
          <p>Próxima aula, compromissos do dia e turmas<br />organizados sem sobrecarga mental.</p>
        </div>
      </div>
      <div className="auth-form-wrap">
        {children}
        <p className="auth-footer">Acesso privado · Seus dados ficam protegidos</p>
      </div>
    </main>
  )
}
