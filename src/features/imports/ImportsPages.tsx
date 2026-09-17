import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle2, FileSpreadsheet, History, Import, RefreshCcw, ShieldCheck, TriangleAlert, UploadCloud } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Card, EmptyState, ErrorState, Input, LoadingState, PageTitle } from '../../components/ui'
import { useWorkspace } from '../../app/providers/WorkspaceProvider'
import { queryKeys, useCycles, useImports, useInstitutions } from '../data/queries'
import { useAuth } from '../auth/AuthProvider'
import { decodeCsvBytes } from '../../lib/csv/decode'
import { sha256Bytes, sha256Text } from '../../lib/csv/hash'
import { parseScheduleCsv } from '../../lib/csv/parser'
import type { CsvCanonicalField, CsvColumnMapping, ImportPreview, ScheduleEvent } from '../../types/domain'
import { requireSupabase } from '../../lib/supabase/client'
import type { ImportBatch } from '../../types/database'
import { normalizeHeader } from '../../lib/csv/normalizers'

export function ImportsPage() {
  const { selectedCycleId } = useWorkspace()
  const cycles = useCycles()
  const imports = useImports(selectedCycleId)
  const cycle = cycles.data?.find((item) => item.id === selectedCycleId)
  if (imports.isLoading) return <LoadingState label="Carregando histórico…" />
  if (imports.isError) return <ErrorState message={imports.error.message} />
  return <div><PageTitle eyebrow={cycle?.code ?? 'Cronogramas'} title="Importações" description="Versões auditáveis, atualizações seguras e rollback da versão mais recente." action={<Link to="/imports/new" className="button button-primary button-md"><UploadCloud size={16} /> Atualizar cronograma</Link>} />
    {!imports.data?.length ? <EmptyState icon={<Import />} title="Nenhuma importação ainda." description="Envie o CSV oficial para criar sua agenda." action={<Link className="button button-primary button-md" to="/imports/new">Importar CSV</Link>} /> : <div className="import-history"><div className="history-line" />{imports.data.map((batch, index) => <Card className="import-card" key={batch.id}><span className={`history-dot ${batch.status}`}><History /></span><div className="import-version"><span>Versão {batch.version_number}</span><strong>{index === 0 && batch.status === 'succeeded' ? 'Versão atual' : statusLabel(batch.status)}</strong></div><div className="import-copy"><div><h2>{batch.version_number === 1 ? 'Importação inicial' : 'Atualização do cronograma'}</h2><Badge tone={batch.status === 'succeeded' ? 'positive' : batch.status === 'rolled_back' ? 'warning' : 'neutral'}>{statusLabel(batch.status)}</Badge></div><p>{formatDateTime(batch.completed_at ?? batch.created_at)} · {batch.file_name}</p><div className="diff-pills"><span className="created">+{batch.created_count} criados</span><span className="updated">~{batch.updated_count} atualizados</span><span className="removed">−{batch.removed_count} removidos</span><span>{batch.unchanged_count} sem alteração</span></div></div><Link className="button button-secondary button-sm" to={`/imports/${batch.id}`}>Detalhar <ArrowRight size={15} /></Link></Card>)}</div>}
  </div>
}

export function NewImportPage() {
  const { user } = useAuth()
  const { selectedCycleId, setSelectedCycleId } = useWorkspace()
  const cycles = useCycles()
  const institutions = useInstitutions()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileHash, setFileHash] = useState('')
  const [encoding, setEncoding] = useState('')
  const [csvText, setCsvText] = useState('')
  const [manualMapping, setManualMapping] = useState<CsvColumnMapping>({})
  const [processing, setProcessing] = useState(false)
  const [importing, setImporting] = useState(false)

  // Controle de Destino (Instituição & Ciclo)
  const [targetInstitutionId, setTargetInstitutionId] = useState<string>('')
  const [isNewInstitution, setIsNewInstitution] = useState<boolean>(false)
  const [newInstitutionName, setNewInstitutionName] = useState<string>('')
  const [newInstitutionShortName, setNewInstitutionShortName] = useState<string>('')

  const [targetCycleId, setTargetCycleId] = useState<string>('')
  const [isNewCycle, setIsNewCycle] = useState<boolean>(false)
  const [newCycleCode, setNewCycleCode] = useState<string>('')

  // Estado de sucesso da última importação para permitir fluxo contínuo
  const [lastImported, setLastImported] = useState<{
    batchId: string
    cycleCode: string
    institutionName: string
    eventCount: number
    classCount: number
  } | null>(null)

  const hasExistingInstitutions = Boolean(institutions.data && institutions.data.length > 0)

  // Sincronização inicial inteligente
  const initializedRef = useRef(false)
  if (!initializedRef.current && institutions.data !== undefined) {
    initializedRef.current = true
    if (institutions.data.length > 0) {
      // Se há um ciclo ativo no workspace, acha a instituição dele
      const activeCycle = cycles.data?.find((c) => c.id === selectedCycleId)
      if (activeCycle) {
        setTargetInstitutionId(activeCycle.institution_id)
        setTargetCycleId(activeCycle.id)
      } else {
        const firstInst = institutions.data[0]
        if (firstInst) {
          setTargetInstitutionId(firstInst.id)
          const instCycles = (cycles.data || []).filter((c) => c.institution_id === firstInst.id)
          const firstCycle = instCycles[0]
          if (firstCycle) {
            setTargetCycleId(firstCycle.id)
          } else {
            setIsNewCycle(true)
          }
        } else {
          setIsNewInstitution(true)
          setIsNewCycle(true)
        }
      }
    } else {
      setIsNewInstitution(true)
      setIsNewCycle(true)
    }
  }

  // Ciclos disponíveis para a instituição selecionada
  const availableCycles = (cycles.data || []).filter((c) => c.institution_id === targetInstitutionId)

  // Checagem de importações para o ciclo alvo
  const activeCycleIdForCheck = (!isNewInstitution && !isNewCycle && targetCycleId) ? targetCycleId : undefined
  const cycleImports = useImports(activeCycleIdForCheck)
  const identical = Boolean(
    activeCycleIdForCheck &&
    fileHash &&
    cycleImports.data?.[0]?.file_hash === fileHash &&
    cycleImports.data?.[0]?.status === 'succeeded'
  )

  const suggestCycleCode = (startDate?: string | null): string => {
    if (!startDate) return '2026.2'
    const date = new Date(`${startDate}T00:00:00Z`)
    const year = isNaN(date.getUTCFullYear()) ? new Date().getFullYear() : date.getUTCFullYear()
    const month = isNaN(date.getUTCMonth()) ? 7 : date.getUTCMonth() + 1
    return `${year}.${month >= 7 ? 2 : 1}`
  }

  const processFile = async (nextFile: File) => {
    if (!nextFile.name.toLowerCase().endsWith('.csv')) return toast.error('Selecione um arquivo .csv.')
    setProcessing(true)
    setFile(nextFile)
    setPreview(null)
    setLastImported(null)
    try {
      const bytes = new Uint8Array(await nextFile.arrayBuffer())
      const decoded = decodeCsvBytes(bytes)
      const [hash, parsed] = await Promise.all([sha256Bytes(bytes), parseScheduleCsv(decoded.text)])
      setFileHash(hash)
      setPreview(parsed)
      setEncoding(decoded.encoding)
      setCsvText(decoded.text)
      setManualMapping({})

      // Sugere código do ciclo se ainda não tiver preenchido
      if (!newCycleCode && (isNewCycle || isNewInstitution || availableCycles.length === 0)) {
        setNewCycleCode(suggestCycleCode(parsed.periodStart))
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível ler o CSV.')
    } finally {
      setProcessing(false)
    }
  }

  const drop = (event: DragEvent) => {
    event.preventDefault()
    const next = event.dataTransfer.files[0]
    if (next) void processFile(next)
  }

  const applyManualMapping = async () => {
    if (!csvText) return
    setProcessing(true)
    try {
      setPreview(await parseScheduleCsv(csvText, manualMapping))
    } finally {
      setProcessing(false)
    }
  }

  // Validação dos dados de destino
  const isInstitutionReady = !hasExistingInstitutions || isNewInstitution
    ? Boolean(newInstitutionName.trim())
    : Boolean(targetInstitutionId)

  const isCycleReady = isNewInstitution || isNewCycle || availableCycles.length === 0
    ? Boolean(newCycleCode.trim())
    : Boolean(targetCycleId)

  const canConfirm = Boolean(
    file &&
    preview &&
    !preview.fatal &&
    !identical &&
    isInstitutionReady &&
    isCycleReady &&
    user
  )

  const confirm = async () => {
    if (!file || !preview || preview.fatal || identical || !user) return
    setImporting(true)
    const client = requireSupabase()

    try {
      let finalInstitutionId = targetInstitutionId
      let finalInstitutionName = ''

      // 1. Resolver Instituição
      if (!hasExistingInstitutions || isNewInstitution) {
        const trimmedName = newInstitutionName.trim()
        if (!trimmedName) throw new Error('Informe o nome da instituição.')

        // Verifica se já existe instituição com o mesmo nome para o usuário
        const existing = institutions.data?.find(
          (i) => i.name.trim().toLowerCase() === trimmedName.toLowerCase()
        )
        if (existing) {
          finalInstitutionId = existing.id
          finalInstitutionName = existing.name
        } else {
          const createdInst = await client.from('institutions').insert({
            user_id: user.id,
            name: trimmedName,
            short_name: newInstitutionShortName.trim() || null,
          }).select('id, name').single()

          if (createdInst.error) throw createdInst.error
          finalInstitutionId = String(createdInst.data.id)
          finalInstitutionName = createdInst.data.name
        }
      } else {
        const instObj = institutions.data?.find((i) => i.id === finalInstitutionId)
        finalInstitutionName = instObj?.name || 'Instituição'
      }

      // 2. Resolver Ciclo
      let finalCycleId = targetCycleId
      let finalCycleCode = ''

      if (isNewInstitution || isNewCycle || availableCycles.length === 0 || !finalCycleId) {
        const trimmedCode = newCycleCode.trim()
        if (!trimmedCode) throw new Error('Informe o código do ciclo.')

        // Verifica se já existe ciclo com o mesmo código para essa instituição
        const existingCycle = cycles.data?.find(
          (c) => c.institution_id === finalInstitutionId && c.code.trim().toLowerCase() === trimmedCode.toLowerCase()
        )
        if (existingCycle) {
          finalCycleId = existingCycle.id
          finalCycleCode = existingCycle.code
        } else {
          const createdCycle = await client.from('cycles').insert({
            user_id: user.id,
            institution_id: finalInstitutionId,
            code: trimmedCode,
            start_date: preview.periodStart || null,
            end_date: preview.periodEnd || null,
          }).select('id, code').single()

          if (createdCycle.error) throw createdCycle.error
          finalCycleId = String(createdCycle.data.id)
          finalCycleCode = createdCycle.data.code
        }
      } else {
        const cycleObj = cycles.data?.find((c) => c.id === finalCycleId)
        finalCycleCode = cycleObj?.code || 'Ciclo'
      }

      // 3. Preparar e Executar Importação
      const batchId = crypto.randomUUID()
      const storagePath = `${user.id}/${finalCycleId}/${batchId}/original.csv`

      const headerSignature = await sha256Text(preview.headers.map(normalizeHeader).join('|'))
      const existingTemplate = await client.from('import_templates').select('id').eq('header_signature', headerSignature).maybeSingle()
      if (existingTemplate.error) throw existingTemplate.error

      let templateId = existingTemplate.data ? String(existingTemplate.data.id) : null
      if (!templateId) {
        const template = await client.from('import_templates').insert({
          user_id: user.id,
          institution_id: finalInstitutionId,
          name: `Mapeamento ${newInstitutionShortName.trim() || finalInstitutionName}`,
          header_signature: headerSignature,
          column_mapping: preview.columnMapping,
        }).select('id').single()
        if (template.error) throw template.error
        templateId = String(template.data.id)
      }

      const uploaded = await client.storage.from('schedule-imports').upload(storagePath, file, { contentType: file.type || 'text/csv', upsert: false })
      if (uploaded.error) throw uploaded.error

      const payload = preview.events.map(toRpcEvent)
      const result = await client.rpc('apply_schedule_import', {
        p_batch_id: batchId,
        p_institution_id: finalInstitutionId,
        p_cycle_id: finalCycleId,
        p_file_name: file.name,
        p_file_hash: fileHash,
        p_storage_path: storagePath,
        p_total_rows: preview.rawRowCount,
        p_warning_count: preview.issues.filter((issue) => issue.level === 'warning').length,
        p_payload: payload,
        p_template_id: templateId,
      })

      if (result.error) {
        await client.storage.from('schedule-imports').remove([storagePath])
        throw result.error
      }

      setSelectedCycleId(finalCycleId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.institutions }),
        queryClient.invalidateQueries({ queryKey: queryKeys.cycles }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events(finalCycleId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.classes(finalCycleId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.imports(finalCycleId) }),
      ])

      toast.success(`Cronograma salvo com sucesso no ciclo ${finalCycleCode}!`)

      setLastImported({
        batchId,
        cycleCode: finalCycleCode,
        institutionName: finalInstitutionName,
        eventCount: preview.validRowCount,
        classCount: preview.classes.length,
      })

      // Limpa os dados do arquivo atual para a tela ficar pronta para o próximo CSV
      setFile(null)
      setPreview(null)
      setFileHash('')
      setCsvText('')
      setManualMapping({})
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'A importação falhou; o cronograma anterior foi preservado.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <PageTitle
        eyebrow="Nova versão"
        title="Importar cronograma"
        description="O arquivo é processado no navegador. Nada muda antes da sua confirmação."
      />

      {lastImported && (
        <div className="warning-banner positive" style={{ marginBottom: '20px' }}>
          <CheckCircle2 size={24} />
          <div style={{ flex: 1 }}>
            <strong>Cronograma salvo com sucesso!</strong>
            <p style={{ margin: '4px 0 10px', fontSize: '0.84rem' }}>
              Foram importados com êxito <strong>{lastImported.eventCount} eventos</strong> e <strong>{lastImported.classCount} turmas</strong> no ciclo <strong>{lastImported.cycleCode}</strong> ({lastImported.institutionName}).
              A tela abaixo já está limpa e pronta para você importar outro cronograma de qualquer instituição.
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link className="button button-primary button-sm" to="/agenda">
                Ver Agenda
              </Link>
              <Link className="button button-secondary button-sm" to="/classes">
                Ver Turmas
              </Link>
              <Link className="button button-secondary button-sm" to={`/imports/${lastImported.batchId}`}>
                Detalhes da importação
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="import-layout">
        <div>
          <Card
            className={`dropzone ${file ? 'has-file' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const next = event.target.files?.[0]
                if (next) void processFile(next)
              }}
            />
            {processing ? (
              <LoadingState label="Lendo e validando o CSV…" />
            ) : file ? (
              <>
                <span className="file-icon"><FileSpreadsheet /></span>
                <h2>{file.name}</h2>
                <p>{formatBytes(file.size)} · {encoding.toUpperCase()} · SHA-256 {fileHash.slice(0, 10)}…</p>
                <Button variant="secondary" onClick={() => fileInput.current?.click()}>Trocar arquivo</Button>
              </>
            ) : (
              <>
                <span className="drop-icon"><UploadCloud /></span>
                <h2>Arraste seu CSV para cá</h2>
                <p>ou selecione o arquivo oficial exportado do cronograma</p>
                <Button onClick={() => fileInput.current?.click()}>Selecionar CSV</Button>
                <small>Somente .csv · até 10 MB · Suporta qualquer instituição</small>
              </>
            )}
          </Card>

          {identical && (
            <div className="warning-banner positive">
              <CheckCircle2 />
              <div>
                <strong>Este arquivo já é a versão atual deste ciclo.</strong>
                <span>Nenhuma alteração é necessária e uma nova versão não será criada.</span>
              </div>
            </div>
          )}

          {preview?.fatal && preview.headers.length > 0 && (
            <ManualMappingCard
              preview={preview}
              mapping={manualMapping}
              onChange={setManualMapping}
              onApply={() => void applyManualMapping()}
              loading={processing}
            />
          )}

          {preview && <PreviewTable preview={preview} />}
        </div>

        <aside className="import-summary">
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Destino</p>
              {hasExistingInstitutions && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !isNewInstitution
                    setIsNewInstitution(next)
                    if (next) setIsNewCycle(true)
                  }}
                  style={{ fontSize: '0.73rem', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                >
                  {isNewInstitution ? 'Selecionar existente' : '+ Nova instituição'}
                </button>
              )}
            </div>

            {/* Instituição */}
            {hasExistingInstitutions && !isNewInstitution ? (
              <div style={{ marginBottom: '12px' }}>
                <label className="field-label" style={{ fontSize: '0.76rem', marginBottom: '4px' }}>Instituição</label>
                <select
                  className="input"
                  value={targetInstitutionId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setTargetInstitutionId(nextId)
                    const instCycles = (cycles.data || []).filter((c) => c.institution_id === nextId)
                    const firstCycle = instCycles[0]
                    if (firstCycle) {
                      setTargetCycleId(firstCycle.id)
                      setIsNewCycle(false)
                    } else {
                      setTargetCycleId('')
                      setIsNewCycle(true)
                    }
                  }}
                >
                  {institutions.data?.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} {inst.short_name ? `(${inst.short_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '12px', display: 'grid', gap: '8px' }}>
                <div>
                  <label className="field-label" style={{ fontSize: '0.76rem', marginBottom: '4px' }}>Nome da Instituição *</label>
                  <Input
                    placeholder="Ex: Escola da Nuvem, Senac"
                    value={newInstitutionName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewInstitutionName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" style={{ fontSize: '0.76rem', marginBottom: '4px' }}>Sigla (opcional)</label>
                  <Input
                    placeholder="Ex: EdN, SENAC"
                    value={newInstitutionShortName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewInstitutionShortName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Ciclo */}
            {availableCycles.length > 0 && !isNewInstitution && !isNewCycle ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="field-label" style={{ fontSize: '0.76rem', margin: 0 }}>Ciclo</label>
                  <button
                    type="button"
                    onClick={() => setIsNewCycle(true)}
                    style={{ fontSize: '0.73rem', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  >
                    + Novo ciclo
                  </button>
                </div>
                <select
                  className="input"
                  value={targetCycleId}
                  onChange={(e) => setTargetCycleId(e.target.value)}
                >
                  {availableCycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.name ? `— ${c.name}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label className="field-label" style={{ fontSize: '0.76rem', margin: 0 }}>Código do Ciclo *</label>
                  {availableCycles.length > 0 && !isNewInstitution && (
                    <button
                      type="button"
                      onClick={() => setIsNewCycle(false)}
                      style={{ fontSize: '0.73rem', background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      Selecionar existente
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Ex: 2026.2, C7-2026"
                  value={newCycleCode}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewCycleCode(e.target.value)}
                  required
                />
              </div>
            )}
          </Card>

          {preview && (
            <Card>
              <p className="eyebrow">Reconhecimento</p>
              <h2>{preview.validRowCount} eventos</h2>
              <dl>
                <div><dt>Turmas</dt><dd>{preview.classes.length}</dd></div>
                <div><dt>Período</dt><dd>{formatPeriod(preview.periodStart, preview.periodEnd)}</dd></div>
                <div><dt>Ações CP</dt><dd>{preview.actionRowCount}</dd></div>
                <div><dt>Horário pendente</dt><dd>{preview.pendingTimeCount}</dd></div>
              </dl>
              <div className="class-chips">
                {preview.classes.map((item) => <Badge key={item} tone="accent">{item}</Badge>)}
              </div>
            </Card>
          )}

          {preview && (
            <Card className="validation-card">
              <p className="eyebrow">Validação</p>
              {preview.fatal ? (
                <p className="validation error"><TriangleAlert /> Há erros bloqueantes.</p>
              ) : (
                <p className="validation success"><ShieldCheck /> Pronto para importar.</p>
              )}
              <ul>
                {preview.issues.slice(0, 5).map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={issue.level}>
                    <span>{issue.level === 'error' ? 'Erro' : 'Aviso'}</span>
                    {issue.message}
                    {issue.row && <small>Linha {issue.row}</small>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Button
            className="confirm-import"
            disabled={!canConfirm}
            loading={importing}
            onClick={() => void confirm()}
          >
            {cycleImports.data?.length ? 'Aplicar atualização' : 'Importar cronograma'} <ArrowRight size={16} />
          </Button>
        </aside>
      </div>
    </div>
  )
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const sample = [...preview.events.slice(0, 4), ...preview.events.slice(-2)]
  return <Card className="preview-card"><div className="section-heading"><div><p className="eyebrow">Prévia</p><h2>Linhas reconhecidas</h2></div><Badge tone={preview.fatal ? 'warning' : 'positive'}>{preview.fatal ? 'Revisar' : 'Estrutura válida'}</Badge></div><div className="table-scroll"><table><thead><tr><th>Data</th><th>Turma</th><th>Aula</th><th>Horário</th><th>Ação CP</th></tr></thead><tbody>{sample.map((event) => <tr key={event.rowHash}><td>{formatDate(event.eventDate)}</td><td><Badge tone="accent">{event.classCode}</Badge></td><td>{event.title}</td><td>{event.startTime ? `${event.startTime}–${event.endTime}` : <Badge tone="warning">A confirmar</Badge>}</td><td>{event.actionText ?? '—'}</td></tr>)}</tbody></table></div></Card>
}

const MAPPING_FIELDS: [CsvCanonicalField, string, boolean][] = [
  ['date', 'Data', true], ['class', 'Turma', true], ['title', 'Aula', true], ['time', 'Horário', false],
  ['instructor', 'Instrutor', false], ['action', 'Ações CP', false], ['materials', 'Materiais', false],
]

function ManualMappingCard({ preview, mapping, onChange, onApply, loading }: { preview: ImportPreview; mapping: CsvColumnMapping; onChange: (value: CsvColumnMapping) => void; onApply: () => void; loading: boolean }) {
  return <Card className="mapping-card"><div><p className="eyebrow">Mapeamento manual</p><h2>Algum cabeçalho mudou?</h2><p>Associe as colunas essenciais. Campos opcionais podem ficar sem seleção.</p></div><div className="mapping-grid">{MAPPING_FIELDS.map(([field, label, required]) => <label className="field" key={field}><span className="field-label">{label}{required && ' *'}</span><select className="input" value={mapping[field] ?? preview.columnMapping[field] ?? ''} onChange={(event) => onChange({ ...mapping, [field]: event.target.value || undefined })}><option value="">Não mapear</option>{preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><Button variant="secondary" loading={loading} onClick={onApply}>Validar mapeamento</Button></Card>
}

export function ImportDetailPage() {
  const { importId } = useParams()
  const { selectedCycleId } = useWorkspace()
  const imports = useImports(selectedCycleId)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [rollingBack, setRollingBack] = useState(false)
  const batch = imports.data?.find((item) => item.id === importId)
  const changes = useQuery({
    queryKey: ['import-changes', importId], enabled: Boolean(importId),
    queryFn: async () => { const result = await requireSupabase().from('import_changes').select('*').eq('import_batch_id', importId!).order('created_at'); if (result.error) throw new Error(result.error.message); return result.data as ImportChange[] },
  })
  if (imports.isLoading || changes.isLoading) return <LoadingState />
  if (!batch) return <EmptyState title="Importação não encontrada." description="Ela pode pertencer a outro ciclo ou não estar disponível para este usuário." />
  const latest = imports.data?.find((item) => item.status === 'succeeded')
  const canRollback = latest?.id === batch.id && Boolean(batch.previous_batch_id)
  const rollback = async () => {
    setRollingBack(true)
    const result = await requireSupabase().rpc('rollback_latest_import', { p_import_batch_id: batch.id })
    setRollingBack(false)
    if (result.error) return toast.error(result.error.message)
    await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.events(selectedCycleId) }), queryClient.invalidateQueries({ queryKey: queryKeys.imports(selectedCycleId) })])
    toast.success('Versão anterior restaurada.'); navigate('/imports')
  }
  return <div><Link className="back-link" to="/imports"><ArrowLeft size={16} /> Histórico</Link><PageTitle eyebrow={`Versão ${batch.version_number}`} title={batch.version_number === 1 ? 'Importação inicial' : 'Atualização do cronograma'} description={`${formatDateTime(batch.completed_at ?? batch.created_at)} · ${batch.file_name}`} action={<Badge tone={batch.status === 'succeeded' ? 'positive' : 'warning'}>{statusLabel(batch.status)}</Badge>} />
    <div className="detail-kpis"><MiniKpi label="Linhas válidas" value={batch.valid_rows} /><MiniKpi label="Criados" value={batch.created_count} tone="created" /><MiniKpi label="Atualizados" value={batch.updated_count} tone="updated" /><MiniKpi label="Removidos" value={batch.removed_count} tone="removed" /><MiniKpi label="Sem alteração" value={batch.unchanged_count} /></div>
    <div className="import-detail-grid"><Card className="section-card"><p className="eyebrow">Arquivo e auditoria</p><dl className="metadata-list"><div><dt>Arquivo</dt><dd>{batch.file_name}</dd></div><div><dt>SHA-256</dt><dd><code>{batch.file_hash.slice(0, 18)}…</code></dd></div><div><dt>Versão</dt><dd>{batch.version_number}</dd></div><div><dt>Total de linhas</dt><dd>{batch.total_rows}</dd></div><div><dt>Avisos</dt><dd>{batch.warning_count}</dd></div><div><dt>Erros</dt><dd>{batch.error_count}</dd></div></dl><p className="privacy-note"><ShieldCheck /> O CSV está em bucket privado. Nenhuma URL pública é exposta.</p>{canRollback && <Button variant="danger" loading={rollingBack} onClick={() => void rollback()}><RefreshCcw size={16} /> Restaurar versão anterior</Button>}</Card><Card className="section-card"><div className="section-heading"><div><p className="eyebrow">Diff oficial</p><h2>Alterações detalhadas</h2></div></div>{changes.data?.length ? <div className="change-list">{changes.data.slice(0, 30).map((change) => <div key={change.id}><Badge tone={change.change_type === 'created' ? 'positive' : change.change_type === 'removed' ? 'warning' : 'accent'}>{changeLabel(change.change_type)}</Badge><div><strong>{String(change.after_snapshot?.title ?? change.before_snapshot?.title ?? change.entity_type)}</strong><span>{String(change.after_snapshot?.event_date ?? change.before_snapshot?.event_date ?? '')}</span></div></div>)}</div> : <p className="muted-block">Nenhuma alteração estrutural registrada.</p>}</Card></div>
  </div>
}

interface ImportChange { id: string; entity_type: 'event' | 'action'; entity_id: string; change_type: 'created' | 'updated' | 'removed'; before_snapshot: Record<string, unknown> | null; after_snapshot: Record<string, unknown> | null }
function toRpcEvent(event: ScheduleEvent) { return { class_code: event.classCode, class_source_label: event.classSourceLabel, event_date: event.eventDate, title: event.title, event_kind: event.eventKind, start_time: event.startTime, end_time: event.endTime, time_status: event.timeStatus, original_time_text: event.originalTimeText, instructor_name: event.instructorName, materials_source_status: event.materialsSourceStatus, action_text: event.actionText, normalized_action_text: event.normalizedActionText, source_row_number: event.sourceRowNumber, source_order: event.sourceOrder, identity_hash: event.identityHash, row_hash: event.rowHash, source_payload: event.sourcePayload } }
function statusLabel(status: ImportBatch['status']) { return ({ processing: 'Processando', succeeded: 'Concluída', failed: 'Falhou', rolled_back: 'Revertida' } as const)[status] }
function changeLabel(value: ImportChange['change_type']) { return ({ created: 'Criado', updated: 'Atualizado', removed: 'Removido' } as const)[value] }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function formatDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
function formatPeriod(start: string | null, end: string | null) { return start && end ? `${formatDate(start)} → ${formatDate(end)}` : '—' }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }
function MiniKpi({ label, value, tone }: { label: string; value: number; tone?: string }) { return <Card className={`mini-kpi ${tone ?? ''}`}><strong>{value}</strong><span>{label}</span></Card> }
