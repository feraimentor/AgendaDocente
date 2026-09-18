import { describe, expect, it } from 'vitest'
import {
  formatTeamsUrl,
  formatWhatsAppUrl,
  parseClassContacts,
  serializeClassContacts,
} from '../../src/lib/contacts/classContacts'
import type { ClassContact } from '../../src/types/domain'

describe('classContacts utilities', () => {
  it('parses empty or null contact_info gracefully', () => {
    expect(parseClassContacts(null)).toEqual([])
    expect(parseClassContacts(undefined)).toEqual([])
    expect(parseClassContacts('')).toEqual([])
    expect(parseClassContacts('   ')).toEqual([])
  })

  it('parses JSON formatted contacts and preserves primary flag', () => {
    const rawJson = JSON.stringify([
      {
        id: 'c1',
        name: 'Franciely',
        role: 'Monitora',
        whatsapp: '11954403048',
        teams: 'franciely@escola.com',
        notes: 'Disponível seg e qua',
        is_primary: true,
      },
      {
        id: 'c2',
        name: 'João',
        role: 'Apoio Pedagógico',
        whatsapp: '11988887777',
        teams: 'joao@escola.com',
        notes: '',
        is_primary: false,
      },
    ])

    const result = parseClassContacts(rawJson)
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('Franciely')
    expect(result[0]?.is_primary).toBe(true)
    expect(result[1]?.name).toBe('João')
    expect(result[1]?.is_primary).toBe(false)
  })

  it('parses legacy free-text contacts with tolerance', () => {
    const legacy = 'Franciely (Teams: https://teams.microsoft.com/chat/abc | Whats: 11 95440-3048); João (Teams: joao@edu.br)'
    const result = parseClassContacts(legacy)
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('Franciely')
    expect(result[0]?.whatsapp).toBe('11 95440-3048')
    expect(result[0]?.teams).toBe('https://teams.microsoft.com/chat/abc')
    expect(result[0]?.is_primary).toBe(true)

    expect(result[1]?.name).toBe('João')
    expect(result[1]?.teams).toBe('joao@edu.br')
    expect(result[1]?.is_primary).toBe(false)
  })

  it('serializes contacts to JSON string', () => {
    const contacts: ClassContact[] = [
      {
        id: 'c1',
        name: 'Maria',
        role: 'Monitor',
        whatsapp: '11999999999',
        teams: 'maria@test.com',
        notes: 'Plantão',
        is_primary: true,
      },
    ]
    const serialized = serializeClassContacts(contacts)
    expect(JSON.parse(serialized)).toEqual(contacts)
  })

  it('formats WhatsApp URLs properly for Brazilian numbers', () => {
    expect(formatWhatsAppUrl('')).toBe('')
    expect(formatWhatsAppUrl('11954403048')).toBe('https://wa.me/5511954403048')
    expect(formatWhatsAppUrl('11 95440-3048')).toBe('https://wa.me/5511954403048')
    expect(formatWhatsAppUrl('+55 11 95440-3048')).toBe('https://wa.me/5511954403048')
    expect(formatWhatsAppUrl('5511954403048')).toBe('https://wa.me/5511954403048')
  })

  it('formats Teams URLs properly for URLs and email addresses', () => {
    expect(formatTeamsUrl('')).toBe('')
    expect(formatTeamsUrl('https://teams.microsoft.com/l/meetup-join/123')).toBe('https://teams.microsoft.com/l/meetup-join/123')
    expect(formatTeamsUrl('msteams:/l/chat')).toBe('msteams:/l/chat')
    expect(formatTeamsUrl('monitor@instituicao.edu.br')).toBe(
      'https://teams.microsoft.com/l/chat/0/0?users=monitor%40instituicao.edu.br'
    )
  })
})
