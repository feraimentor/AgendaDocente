import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { Button, Card } from './index'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

const RELOAD_KEY = 'agenda_docente:chunk_reload'

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[AgendaDocente ErrorBoundary]', error, errorInfo)

    const message = error?.message || ''
    const isChunkError =
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('error loading dynamically imported module') ||
      message.includes('Unexpected token \'<\'')

    if (isChunkError) {
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY)
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOAD_KEY, 'true')
        window.location.reload()
      }
    }
  }

  handleReload = (): void => {
    sessionStorage.removeItem(RELOAD_KEY)
    window.location.reload()
  }

  handleGoHome = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.message.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message.includes('Loading chunk') ||
        this.state.error?.message.includes('Unexpected token \'<\'')

      return (
        <main className="centered-page" style={{ padding: '2rem' }}>
          <Card style={{ maxWidth: '520px', width: '100%', textAlign: 'center', padding: '2rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
              }}
            >
              <AlertCircle size={24} />
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              {isChunkError ? 'Nova versão disponível' : (this.props.fallbackTitle ?? 'Algo não saiu como esperado')}
            </h2>

            <p style={{ color: 'var(--color-text-muted, #94a3b8)', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {isChunkError
                ? 'Uma nova versão do sistema foi atualizada. Basta recarregar a página para sincronizar sua agenda com a versão mais recente.'
                : (this.state.error?.message || 'Ocorreu uma instabilidade momentânea na interface. Seus dados estão seguros.')}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={this.handleReload}>
                <RefreshCw size={15} /> Recarregar página
              </Button>
              <Button variant="secondary" onClick={this.handleGoHome}>
                <Home size={15} /> Ir para o Início
              </Button>
            </div>
          </Card>
        </main>
      )
    }

    return this.props.children
  }
}
