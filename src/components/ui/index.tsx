import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/utils/cn'

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
  loading?: boolean
}>(({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn('button', `button-${variant}`, `button-${size}`, className)} disabled={disabled || loading} {...props}>
    {loading && <LoaderCircle aria-hidden="true" className="spin" size={16} />}
    {children}
  </button>
))
Button.displayName = 'Button'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn('input', className)} {...props} />
))
Input.displayName = 'Input'

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'positive' | 'warning' | 'accent'; className?: string }) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="state"><LoaderCircle className="spin" aria-hidden="true" /><p>{label}</p></div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state">{icon}<h2>{title}</h2><p>{description}</p>{action}</div>
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state"><strong>Não foi possível carregar.</strong><p>{message}</p>{retry && <Button variant="secondary" onClick={retry}>Tentar novamente</Button>}</div>
}

export { ErrorBoundary } from './ErrorBoundary'

