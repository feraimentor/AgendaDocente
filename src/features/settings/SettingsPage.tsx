import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Download, KeyRound, LogOut, Moon, ShieldCheck, Sun, Upload, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, Field, Input, LoadingState, PageTitle } from '../../components/ui'
import { useAuth } from '../auth/AuthProvider'
import { queryKeys, useCycles, useInstitutions, useProfile } from '../data/queries'
import { requireSupabase } from '../../lib/supabase/client'

type SettingsTab = 'profile' | 'preferences' | 'security' | 'data'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const profile = useProfile(user?.id)
  const institutions = useInstitutions()
  const cycles = useCycles()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<SettingsTab>('profile')
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('America/Sao_Paulo')
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [agendaView, setAgendaView] = useState<'day' | 'week' | 'month'>('week')
  const [weekends, setWeekends] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState<string>()

  useEffect(() => { if (profile.data) { setFullName(profile.data.full_name); setDisplayName(profile.data.display_name ?? ''); setJobTitle(profile.data.job_title ?? ''); setPhone(profile.data.phone ?? ''); setTimezone(profile.data.timezone); setTheme(profile.data.theme); setAgendaView(profile.data.default_agenda_view); setWeekends(profile.data.show_weekends) } }, [profile.data])
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => {
    if (!profile.data?.avatar_path) { setAvatarUrl(undefined); return }
    let active = true
    void requireSupabase().storage.from('avatars').createSignedUrl(profile.data.avatar_path, 3600).then(({ data }) => {
      if (active) setAvatarUrl(data?.signedUrl)
    })
    return () => { active = false }
  }, [profile.data?.avatar_path])
  if (profile.isLoading) return <LoadingState label="Carregando configurações…" />

  const updateProfile = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return; setSaving(true)
    const result = await requireSupabase().from('profiles').update({ full_name: fullName, display_name: displayName || null, job_title: jobTitle || null, phone: phone || null }).eq('id', user.id)
    setSaving(false); if (result.error) toast.error(result.error.message); else { toast.success('Perfil atualizado.'); void queryClient.invalidateQueries({ queryKey: queryKeys.profile }) }
  }
  const updatePreferences = async (event: FormEvent) => {
    event.preventDefault(); if (!user) return; setSaving(true)
    const result = await requireSupabase().from('profiles').update({ timezone, theme, default_agenda_view: agendaView, show_weekends: weekends }).eq('id', user.id)
    setSaving(false); if (result.error) toast.error(result.error.message); else { toast.success('Preferências salvas.'); void queryClient.invalidateQueries({ queryKey: queryKeys.profile }) }
  }
  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !user) return
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${user.id}/avatar.${extension}`
    const client = requireSupabase()
    const uploaded = await client.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
    if (uploaded.error) return toast.error(uploaded.error.message)
    const result = await client.from('profiles').update({ avatar_path: path }).eq('id', user.id)
    if (result.error) toast.error(result.error.message); else { toast.success('Avatar atualizado.'); void queryClient.invalidateQueries({ queryKey: queryKeys.profile }) }
  }
  const exportData = async () => {
    const client = requireSupabase()
    const tables = ['profiles', 'institutions', 'cycles', 'teaching_classes', 'class_preferences', 'events', 'event_actions', 'action_progress', 'event_notes', 'import_batches'] as const
    const entries = await Promise.all(tables.map(async (table) => { const result = await client.from(table).select('*'); if (result.error) throw result.error; return [table, result.data] as const }))
    const payload = { format: 'agenda-docente-export', version: 1, exported_at: new Date().toISOString(), ...Object.fromEntries(entries) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `agenda-docente-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url)
  }

  return <div><PageTitle eyebrow="Seu espaço" title="Configurações" description="Perfil, preferências e controle dos seus dados." />
    <div className="settings-layout"><nav className="settings-nav">{([['profile', 'Perfil'], ['preferences', 'Preferências'], ['security', 'Conta e segurança'], ['data', 'Dados']] as [SettingsTab, string][]).map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</nav><div className="settings-content">
      {tab === 'profile' && <Card className="settings-card"><div className="settings-heading"><span><UserRound /></span><div><h2>Perfil</h2><p>Como você aparece no cockpit.</p></div></div><div className="avatar-editor">{avatarUrl ? <img className="avatar-image" src={avatarUrl} alt="Avatar do perfil" /> : <span className="avatar large">{(displayName || fullName || 'P')[0]?.toUpperCase()}</span>}<div><strong>Foto de perfil</strong><p>PNG, JPEG ou WebP · até 5 MB</p><label className="button button-secondary button-sm"><Upload size={15} /> Alterar foto<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadAvatar(event)} /></label></div></div><form onSubmit={(event) => void updateProfile(event)}><div className="form-grid"><Field label="Nome completo"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></Field><Field label="Nome de exibição"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field></div><Field label="E-mail"><Input value={user?.email ?? ''} readOnly disabled /></Field><div className="form-grid"><Field label="Função / cargo"><Input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field><Field label="Telefone"><Input value={phone} onChange={(event) => setPhone(event.target.value)} /></Field></div><Button type="submit" loading={saving}>Salvar perfil</Button></form></Card>}
      {tab === 'preferences' && <Card className="settings-card"><div className="settings-heading"><span><Sun /></span><div><h2>Preferências</h2><p>Datas, aparência, comportamento da agenda e inteligência.</p></div></div><form onSubmit={(event) => void updatePreferences(event)}><Field label="Timezone"><select className="input" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="America/Sao_Paulo">America/Sao_Paulo</option><option value="America/Manaus">America/Manaus</option><option value="America/Recife">America/Recife</option></select></Field><Field label="Tema"><div className="theme-options">{([['system', 'Sistema', <Sun />], ['light', 'Claro', <Sun />], ['dark', 'Escuro', <Moon />]] as const).map(([value, label, icon]) => <button type="button" className={theme === value ? 'active' : ''} key={value} onClick={() => setTheme(value)}>{icon}<span>{label}</span></button>)}</div></Field><Field label="Visão padrão da agenda"><div className="segmented">{(['day', 'week', 'month'] as const).map((value) => <button type="button" key={value} className={agendaView === value ? 'active' : ''} onClick={() => setAgendaView(value)}>{({ day: 'Dia', week: 'Semana', month: 'Mês' })[value]}</button>)}</div></Field><Field label="Chave Google Gemini API (Opcional)"><Input type="password" placeholder="Chave de API do Google AI Studio (conta feraimentor@gmail.com)" defaultValue={localStorage.getItem('agenda_docente_gemini_key') || ''} onChange={(e) => localStorage.setItem('agenda_docente_gemini_key', e.target.value.trim())} /></Field><label className="switch-row"><div><strong>Mostrar fins de semana</strong><span>Inclui sábado e domingo na agenda.</span></div><input type="checkbox" checked={weekends} onChange={(event) => setWeekends(event.target.checked)} /></label><Button type="submit" loading={saving}>Salvar preferências</Button></form></Card>}
      {tab === 'security' && <Card className="settings-card"><div className="settings-heading"><span><ShieldCheck /></span><div><h2>Conta e segurança</h2><p>Acesso privado pelo Supabase Auth.</p></div></div><div className="security-row"><KeyRound /><div><strong>Alterar sua senha</strong><p>Enviaremos um link seguro para {user?.email}.</p></div><Button variant="secondary" onClick={async () => { const result = await requireSupabase().auth.resetPasswordForEmail(user?.email ?? '', { redirectTo: `${location.origin}/reset-password` }); if (result.error) toast.error(result.error.message); else toast.success('Link enviado.') }}>Enviar link</Button></div><div className="security-row"><LogOut /><div><strong>Encerrar sessão</strong><p>Você precisará entrar novamente neste dispositivo.</p></div><Button variant="danger" onClick={() => void signOut()}>Sair</Button></div></Card>}
      {tab === 'data' && <Card className="settings-card"><div className="settings-heading"><span><Download /></span><div><h2>Seus dados</h2><p>Portabilidade sem incluir tokens, senhas ou CSVs privados.</p></div></div><div className="data-summary"><div><strong>{institutions.data?.length ?? 0}</strong><span>instituições</span></div><div><strong>{cycles.data?.length ?? 0}</strong><span>ciclos</span></div></div><div className="export-box"><div><Badge tone="accent">JSON v1</Badge><h3>Exportar meus dados</h3><p>Baixe perfil, cronogramas normalizados, ações, notas e metadados de importação.</p></div><Button onClick={() => void exportData()}><Download size={16} /> Exportar JSON</Button></div></Card>}
    </div></div>
  </div>
}
