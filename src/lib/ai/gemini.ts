import { GoogleGenAI } from '@google/genai'

function getApiKey(): string | undefined {
  const envKey = (import.meta as unknown as { env: Record<string, string> })?.env?.VITE_GEMINI_API_KEY
  if (envKey) return envKey
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage.getItem('agenda_docente_gemini_key') || undefined
  }
  return undefined
}

export function hasGeminiConfigured(): boolean {
  return Boolean(getApiKey())
}

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem('agenda_docente_gemini_key', key.trim())
  }
}

export async function generateDailyBriefing(params: {
  teacherName: string
  dateStr: string
  todayCount: number
  nextEvent?: { title: string; time: string; classCode: string }
  pendingActionsCount: number
}): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) {
    if (params.todayCount === 0) {
      return `Bom dia, ${params.teacherName}! Hoje é um dia livre de aulas no seu cronograma. Aproveite para organizar suas anotações ou recarregar as energias com tranquilidade.`
    }
    const nextInfo = params.nextEvent ? ` Sua próxima aula é ${params.nextEvent.classCode} às ${params.nextEvent.time}.` : ''
    const actionInfo = params.pendingActionsCount > 0 ? ` Você tem ${params.pendingActionsCount} ação pendente para hoje.` : ''
    return `Bom dia, ${params.teacherName}! Você tem ${params.todayCount} compromisso(s) previsto(s) hoje.${nextInfo}${actionInfo} Tenha um excelente dia letivo!`
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const nextDetails = params.nextEvent ? `- Próxima aula: ${params.nextEvent.classCode} - "${params.nextEvent.title}" às ${params.nextEvent.time}` : '- Nenhuma aula hoje.'
    const prompt = `Você é o assistente pessoal sereno da "Agenda Docente" (filosofia Calm Technology).
Escreva uma saudação acolhedora, serena e operacionalmente útil para o docente ${params.teacherName}.
Informações do dia (${params.dateStr}):
- Total de aulas hoje: ${params.todayCount}
${nextDetails}
- Ações/tarefas pendentes: ${params.pendingActionsCount}

Diretrizes Calm Tech:
- Máximo 2 ou 3 frases curtas.
- Tom humano, sereno, encorajador, sem alarmismo.
- Destaque o que importa agora de forma leve.
- Responda apenas o texto da saudação em Português do Brasil.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    return response.text?.trim() || 'Tenha um dia letivo produtivo e tranquilo!'
  } catch (error) {
    console.warn('Falha ao gerar briefing com Gemini, usando fallback sereno:', error)
    return `Bom dia, ${params.teacherName}! Você tem ${params.todayCount} compromisso(s) para hoje. Respire fundo e tenha uma excelente jornada!`
  }
}

export async function suggestClassDynamics(params: {
  classTitle: string
  classCode: string
}): Promise<string[]> {
  const apiKey = getApiKey()
  if (!apiKey) {
    return [
      'Dinâmica Roda de Perguntas (15 min): Peça para cada aluno em duplas compartilhar um desafio real sobre o tema.',
      'Estudo de Caso Relâmpago (15 min): Apresente uma situação prática e dê 7 minutos para a turma debater a melhor solução.',
    ]
  }

  try {
    const ai = new GoogleGenAI({ apiKey })
    const prompt = `Você é um consultor pedagógico especialista em metodologias ativas e Calm Technology.
Para a aula da turma ${params.classCode} com o título: "${params.classTitle}".
Sugira exatamente 2 dinâmicas ativas práticas e engajadoras de 15 minutos que o professor pode aplicar em sala (presencial ou online via Teams/Meet).
Formate como lista com título, tempo e instrução em 2 linhas cada.
Responda em Português do Brasil.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    const text = response.text || ''
    return text.split('\n\n').filter((item) => item.trim().length > 0).slice(0, 2)
  } catch (error) {
    console.warn('Falha ao sugerir dinâmicas:', error)
    return [
      'Dinâmica Roda de Perguntas (15 min): Peça para cada aluno em duplas compartilhar um desafio real sobre o tema.',
      'Estudo de Caso Relâmpago (15 min): Apresente uma situação prática e dê 7 minutos para a turma debater a melhor solução.',
    ]
  }
}