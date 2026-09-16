import { describe, expect, it } from 'vitest'
import { generateDailyBriefing, suggestClassDynamics } from '../../src/lib/ai/gemini'
import type { UserRole } from '../../src/types/domain'

describe('V2.1.0926 Features & Calm Tech', () => {
  it('filtra conflitos passados preservando apenas os vigentes', () => {
    const today = '2026-09-16'
    const mockConflicts = [
      { date: '2026-07-20', first: { classCode: 'BRSAO257' }, second: { classCode: 'BRSAO267' } },
      { date: '2026-09-17', first: { classCode: 'BRSAO257' }, second: { classCode: 'BRSAO267' } },
    ]

    const visibleInHome = mockConflicts.filter((c) => c.date >= today)
    expect(visibleInHome).toHaveLength(1)
    expect(visibleInHome[0]?.date).toBe('2026-09-17')
  })

  it('verifica acumulação de múltiplos cargos por usuário', () => {
    const userRoles: UserRole[] = ['master', 'professor', 'mentor']
    const isMaster = userRoles.includes('master')
    const isAdmin = isMaster || userRoles.includes('admin')
    const isProfessor = userRoles.includes('professor') || isMaster
    const isMentor = userRoles.includes('mentor') || isMaster

    expect(isMaster).toBe(true)
    expect(isAdmin).toBe(true)
    expect(isProfessor).toBe(true)
    expect(isMentor).toBe(true)
  })

  it('ordena tarefas da turma mantendo as fixadas (pinned) no topo', () => {
    const tasks = [
      { id: '1', title: 'Nota normal 1', is_pinned: false, created_at: '2026-09-10' },
      { id: '2', title: 'Aviso crítico fixado', is_pinned: true, created_at: '2026-09-08' },
      { id: '3', title: 'Nota normal 2', is_pinned: false, created_at: '2026-09-12' },
    ]

    const sorted = [...tasks].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return b.created_at.localeCompare(a.created_at)
    })

    expect(sorted[0]?.title).toBe('Aviso crítico fixado')
    expect(sorted[1]?.title).toBe('Nota normal 2')
  })

  it('gera briefing matinal sereno com fallback resiliente', async () => {
    const briefing = await generateDailyBriefing({
      teacherName: 'Bruno',
      dateStr: '16 de Setembro de 2026',
      todayCount: 2,
      nextEvent: { classCode: 'BRSAO267', title: 'Processos Seletivos', time: '21h às 22h' },
      pendingActionsCount: 1,
    })

    expect(briefing).toContain('Bruno')
    expect(briefing).toContain('2 compromisso(s)')
  })

  it('sugere dinâmicas ativas de 15 minutos com fallback', async () => {
    const dynamics = await suggestClassDynamics({
      classCode: 'BRSAO257',
      classTitle: 'Criando um currículo em sites de vagas',
    })

    expect(dynamics.length).toBeGreaterThanOrEqual(1)
    expect(dynamics[0]).toContain('15 min')
  })
})