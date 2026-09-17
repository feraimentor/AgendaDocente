import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'agenda_docente:chunk_reload'

/**
 * Carrega componentes dinâmicos de forma resiliente.
 * Se o arquivo JS não for encontrado devido a um novo deploy de produção (stale chunk),
 * recarrega a página automaticamente uma vez para sincronizar os assets atualizados.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await factory()
      sessionStorage.removeItem(RELOAD_KEY)
      return module
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
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
          // Retorna um componente vazio enquanto o navegador recarrega
          return { default: (() => null) as unknown as T }
        }
      }
      throw error
    }
  })
}
