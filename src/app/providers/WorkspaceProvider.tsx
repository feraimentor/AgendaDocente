import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCycles } from '../../features/data/queries'

interface WorkspaceValue {
  selectedCycleId: string | undefined
  setSelectedCycleId: (value: string) => void
  selectedClassId: string | undefined
  setSelectedClassId: (value: string | undefined) => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

const STORAGE_KEY = 'agenda_docente:selected_cycle_id'

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const cycles = useCycles()
  const [selectedCycleId, setSelectedCycleIdState] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || undefined
    } catch {
      return undefined
    }
  })
  const [selectedClassId, setSelectedClassId] = useState<string>()

  const setSelectedCycleId = (value: string) => {
    setSelectedCycleIdState(value)
    try {
      if (value) {
        localStorage.setItem(STORAGE_KEY, value)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // noop
    }
  }

  useEffect(() => {
    if (!cycles.data || cycles.data.length === 0) return

    // Se não temos ciclo selecionado ou o ciclo atual não existe na lista retornada
    const hasCurrent = cycles.data.some((c) => c.id === selectedCycleId)
    if (!selectedCycleId || !hasCurrent) {
      const fallbackId = cycles.data[0]?.id
      if (fallbackId) {
        setSelectedCycleId(fallbackId)
      }
    }
  }, [cycles.data, selectedCycleId])

  const value = useMemo(
    () => ({ selectedCycleId, setSelectedCycleId, selectedClassId, setSelectedClassId }),
    [selectedClassId, selectedCycleId]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace deve ser usado dentro de WorkspaceProvider')
  return value
}
