import { Home, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, Button } from '../../components/ui'

export function NotFoundPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '1.5rem' }}>
      <Card style={{ maxWidth: '480px', width: '100%', textAlign: 'center', padding: '2.5rem 1.5rem' }}>
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(56, 189, 248, 0.1)',
            color: '#38bdf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.25rem',
          }}
        >
          <Compass size={28} />
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '0.5rem' }}>Página não encontrada</h1>
        <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.9375rem', lineHeight: 1.5, marginBottom: '1.75rem' }}>
          O endereço acessado não existe ou foi movido. Você pode retornar serenamente ao seu cockpit.
        </p>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Button variant="primary">
            <Home size={16} /> Voltar para o Início
          </Button>
        </Link>
      </Card>
    </div>
  )
}
