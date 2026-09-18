import type { ClassContact } from '../../types/domain'

/**
 * Faz o parse seguro do campo contact_info das preferências da turma.
 * Suporta tanto o novo formato JSON estruturado quanto o formato em texto livre legado.
 */
export function parseClassContacts(raw?: string | null): ClassContact[] {
  if (!raw || !raw.trim()) return []

  const trimmed = raw.trim()

  // 1. Tenta fazer parse como JSON
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          id: item.id || `contact_${Date.now()}_${index}`,
          name: String(item.name || '').trim(),
          role: String(item.role || 'Monitor / Apoio').trim(),
          whatsapp: String(item.whatsapp || '').trim(),
          teams: String(item.teams || '').trim(),
          notes: item.notes ? String(item.notes).trim() : '',
          is_primary: Boolean(item.is_primary),
        }))
      }
    } catch {
      // Se falhar o JSON parse, segue para o parser legado
    }
  }

  // 2. Parser tolerante para o formato legado em texto livre:
  // Exemplo: "Franciely (Teams: https://... | Whats: 11 95440-3048); João (Teams: ...)"
  const contacts: ClassContact[] = []
  const segments = trimmed.split(';').map((s) => s.trim()).filter(Boolean)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!
    // Padrão: Nome (Teams: URL | Whats: NUMERO)
    const match = segment.match(/^([^(]+)(?:\((.*)\))?$/)
    if (match) {
      const name = (match[1] || '').trim()
      const details = match[2] || ''

      let whatsapp = ''
      let teams = ''

      const whatsMatch = details.match(/(?:Whats|WhatsApp|Celular):\s*([^|;)]+)/i)
      if (whatsMatch) whatsapp = (whatsMatch[1] || '').trim()

      const teamsMatch = details.match(/Teams:\s*([^|;)]+)/i)
      if (teamsMatch) teams = (teamsMatch[1] || '').trim()

      contacts.push({
        id: `legacy_${i}_${Date.now()}`,
        name: name || 'Apoio Pedagógico',
        role: i === 0 ? 'Monitor / Apoio' : 'Apoio Pedagógico',
        whatsapp,
        teams,
        notes: '',
        is_primary: i === 0, // Primeiro como principal por padrão
      })
    } else {
      contacts.push({
        id: `legacy_${i}_${Date.now()}`,
        name: segment,
        role: 'Monitor / Apoio',
        whatsapp: '',
        teams: '',
        notes: '',
        is_primary: i === 0,
      })
    }
  }

  // Garante que se houver contatos, pelo menos um seja principal
  if (contacts.length > 0 && !contacts.some((c) => c.is_primary)) {
    contacts[0]!.is_primary = true
  }

  return contacts
}

export function serializeClassContacts(contacts: ClassContact[]): string {
  return JSON.stringify(contacts)
}

export function formatWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  // Se já tem DDI 55 (Brasil) com 12 ou 13 dígitos
  if (digits.length >= 12 && digits.startsWith('55')) {
    return `https://wa.me/${digits}`
  }
  // Se tem 10 ou 11 dígitos (DDD + número)
  if (digits.length === 10 || digits.length === 11) {
    return `https://wa.me/55${digits}`
  }
  return `https://wa.me/${digits}`
}

export function formatTeamsUrl(teams: string): string {
  const trimmed = teams.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('msteams:')) {
    return trimmed
  }
  // Se for e-mail, direciona para o chat do Teams
  if (trimmed.includes('@')) {
    return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(trimmed)}`
  }
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(trimmed)}`
}
