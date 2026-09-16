import { Clock3, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button, Card, PageTitle } from '../../components/ui'
import { useAuth } from './AuthProvider'

export function PendingApprovalPage() {
  const { user, signOut, refetchPermissions, loading } = useAuth()

  return (
    <div className="auth-shell">
      <div className="auth-card-wrap">
        <PageTitle
          eyebrow="Acesso em análise"
          title="Quase lá!"
          description="Sua solicitação de acesso foi registrada com sucesso."
        />

        <Card className="settings-card" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: '#10b981' }}>
            <Clock3 size={48} />
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Aguardando liberação do Administrador Master
          </h2>

          <p style={{ color: 'var(--color-text-muted, #94a3b8)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            Olá, <strong>{user?.email}</strong>! Para garantir a privacidade e a segurança dos dados pedagógicos, 
            novas contas são ativadas pessoalmente por <strong>Bruno Moreira</strong> (Proprietário e WebMaster).
          </p>

          <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#38bdf8', marginBottom: '0.25rem' }}>
              <ShieldCheck size={16} /> Filosofia Calm Tech
            </span>
            Você não precisa se preocupar. Assim que seu perfil (Professor / Mentor) for ativado, você terá acesso imediato a todas as ferramentas.
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void refetchPermissions()} loading={loading}>
              <RefreshCw size={16} /> Verificar liberação
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut size={16} /> Sair da conta
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}