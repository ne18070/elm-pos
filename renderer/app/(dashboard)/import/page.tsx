'use client';

import { useState, useCallback } from 'react';
import {
  DatabaseZap, ChevronRight, CheckCircle2, XCircle, Loader2,
  Table2, ArrowRight, Play, Save, Trash2, RefreshCw, AlertTriangle,
  PlugZap, ListChecks, Shuffle, Eye,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notifications';
import { cn } from '@/lib/utils';
import {
  type DbConnection, type SourceType, type TargetEntity, type ColumnMapping, type ImportConfig,
  ELM_FIELDS, ENTITY_LABELS,
  getImportConfigs, saveImportConfig, deleteImportConfig, updateImportConfig, importRowsToSupabase,
  callProxy,
} from '@services/supabase/import-configs';

// ─── Types locaux ─────────────────────────────────────────────────────────────

interface TableInfo  { name: string; rows: number }
interface ColumnInfo { column: string; type: string; nullable: boolean }

type Step = 1 | 2 | 3 | 4 | 5;


// ─── Stepper ──────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: 'Connexion',  icon: PlugZap   },
  { n: 2, label: 'Table',      icon: Table2    },
  { n: 3, label: 'Mapping',    icon: Shuffle   },
  { n: 4, label: 'Aperçu',     icon: Eye       },
  { n: 5, label: 'Import',     icon: Play      },
];

function Stepper({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const done    = s.n < current;
        const active  = s.n === current;
        const Icon    = s.icon;
        return (
          <div key={s.n} className="flex items-center">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              active  && "bg-brand-600 text-white shadow-lg",
              done    && "text-status-success",
              !active && !done && "text-content-muted",
            )}>
              {done
                ? <CheckCircle2 className="w-4 h-4" />
                : <Icon className="w-4 h-4" />}
              <span className="hidden sm:block">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className={cn("w-4 h-4 mx-1", done ? "text-status-success" : "text-content-muted")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ImportPage() {
  const { business } = useAuthStore();
  const { success: notifOk, error: notifErr } = useNotificationStore();

  // Configs sauvegardées
  const [savedConfigs, setSavedConfigs] = useState<ImportConfig[] | null>(null);
  const [loadingConfigs, setLoadingConfigs]   = useState(false);

  // Wizard state
  const [step, setStep]               = useState<Step>(1);
  const [configName, setConfigName]   = useState('');
  const [dbType, setDbType]           = useState<SourceType>('postgresql');
  const [conn, setConn]               = useState<DbConnection>({ host: 'localhost', port: 5432, database: '', user: '', password: '' });
  const [testStatus, setTestStatus]   = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testError, setTestError]     = useState('');

  const [tables, setTables]           = useState<TableInfo[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');

  const [columns, setColumns]         = useState<ColumnInfo[]>([]);
  const [loadingCols, setLoadingCols] = useState(false);
  const [targetEntity, setTargetEntity] = useState<TargetEntity>('products');
  const [columnMap, setColumnMap]     = useState<ColumnMapping[]>([]);

  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const [savedConfigId, setSavedConfigId] = useState<string | null>(null);

  // ── Charger les configs sauvegardées ──────────────────────────────────────

  const loadSavedConfigs = useCallback(async () => {
    if (!business?.id) return;
    setLoadingConfigs(true);
    try {
      setSavedConfigs(await getImportConfigs(business.id));
    } catch { /* ignore */ } finally { setLoadingConfigs(false); }
  }, [business?.id]);

  // Charger au premier render
  if (savedConfigs === null && !loadingConfigs) loadSavedConfigs();

  // ── Step 1 : Test connexion ────────────────────────────────────────────────

  async function handleTest() {
    setTestStatus('loading');
    setTestError('');
    try {
      const cfg = { ...conn, type: dbType };
      const res = await callProxy('test', cfg);
      if (res?.success) {
        setTestStatus('ok');
      } else {
        setTestStatus('error');
        setTestError(res?.error ?? 'Connexion échouée');
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e?.message ?? String(e));
    }
  }

  async function goToStep2() {
    setLoadingTables(true);
    const cfg = { ...conn, type: dbType };
    const res = await callProxy('list_tables', cfg);
    setLoadingTables(false);
    if (!res?.success) { notifErr(res?.error ?? 'Erreur'); return; }
    setTables((res.data as TableInfo[]) ?? []);
    setStep(2);
  }

  // ── Step 2 : Sélection table ───────────────────────────────────────────────

  async function goToStep3() {
    if (!selectedTable) return;
    setLoadingCols(true);
    const cfg = { ...conn, type: dbType };
    const res = await callProxy('get_schema', cfg, { table: selectedTable });
    setLoadingCols(false);
    if (!res?.success) { notifErr(res?.error ?? 'Erreur'); return; }
    const cols: ColumnInfo[] = (res.data as ColumnInfo[]) ?? [];
    setColumns(cols);
    const elmFields = ELM_FIELDS[targetEntity].map((f) => f.key);
    setColumnMap(cols.map((c) => ({
      source:     c.column,
      target:     elmFields.find((f) => f === c.column.toLowerCase()) ?? '',
      multiplier: undefined,
    })));
    setStep(3);
  }

  // ── Step 3 → 4 : Aperçu ───────────────────────────────────────────────────

  async function goToStep4() {
    setLoadingPreview(true);
    const cfg = { ...conn, type: dbType };
    const res = await callProxy('fetch_rows', cfg, { table: selectedTable, limit: 10, offset: 0 });
    setLoadingPreview(false);
    if (!res?.success) { notifErr(res?.error ?? 'Erreur'); return; }
    setPreviewRows((res.data as Record<string, unknown>[]) ?? []);
    setStep(4);
  }

  function applyMapping(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const m of columnMap) {
      if (!m.target) continue;
      let val = row[m.source];
      if (m.multiplier && typeof val === 'number') val = val * m.multiplier;
      out[m.target] = val;
    }
    return out;
  }

  // ── Step 5 : Import ────────────────────────────────────────────────────────

  async function handleImport() {
    if (!business?.id) return;
    setImporting(true);
    setImportResult(null);

    const BATCH = 100;
    let offset  = 0;
    const allMapped: Record<string, unknown>[] = [];
    const cfg = { ...conn, type: dbType };

    // Récupérer toutes les lignes en batchs
    while (true) {
      const res = await callProxy('fetch_rows', cfg, { table: selectedTable, limit: BATCH, offset });
      const batch = res?.success ? (res.data as Record<string, unknown>[]) : [];
      if (!batch?.length) break;
      for (const row of batch) allMapped.push(applyMapping(row));
      if (batch.length < BATCH) break;
      offset += BATCH;
    }

    const result = await importRowsToSupabase(business.id, targetEntity, allMapped);
    setImportResult(result);
    setImporting(false);

    // Mettre à jour last_run_at si config sauvegardée
    if (savedConfigId) {
      await updateImportConfig(savedConfigId, {
        last_run_at: new Date().toISOString(),
        last_count:  result.imported,
      });
    }

    if (result.errors.length === 0) {
      notifOk(`${result.imported} lignes importées avec succès`);
    }
  }

  async function handleSaveConfig() {
    if (!business?.id || !configName.trim()) { notifErr('Donnez un nom à cette configuration'); return; }
    try {
      const saved = await saveImportConfig(business.id, {
        name:          configName.trim(),
        source_type:   dbType,
        connection:    conn,
        source_table:  selectedTable,
        target_entity: targetEntity,
        column_map:    columnMap,
      });
      setSavedConfigId(saved.id);
      notifOk('Configuration sauvegardée');
      loadSavedConfigs();
    } catch (e: any) { notifErr(e.message); }
  }

  async function handleDeleteConfig(id: string) {
    if (!confirm('Supprimer cette configuration ?')) return;
    await deleteImportConfig(id);
    notifOk('Configuration supprimée');
    loadSavedConfigs();
  }

  function loadConfig(cfg: ImportConfig) {
    setConfigName(cfg.name);
    setDbType(cfg.source_type);
    setConn(cfg.connection);
    setSelectedTable(cfg.source_table);
    setTargetEntity(cfg.target_entity);
    setColumnMap(cfg.column_map);
    setSavedConfigId(cfg.id);
    setTestStatus('idle');
    setStep(1);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (!business) return null;

  return (
    <div className="h-full flex flex-col bg-surface overflow-y-auto">
      {/* Header */}
      <div className="px-6 py-5 border-b border-surface-border bg-surface-card shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-content-brand">
            <DatabaseZap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-content-primary tracking-tight uppercase italic">Import Base de Données</h1>
            <p className="text-xs text-content-secondary mt-0.5">Connectez une DB externe, mappez les champs et importez vos données</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-6 space-y-6 pb-24">

        {/* ── Configs sauvegardées ─────────────────────────────────────────── */}
        {savedConfigs && savedConfigs.length > 0 && (
          <div className="card p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-content-muted">Configurations sauvegardées</p>
            <div className="space-y-2">
              {savedConfigs.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-input hover:bg-surface-hover group">
                  <DatabaseZap className="w-4 h-4 text-content-brand shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-content-primary truncate">{c.name}</p>
                    <p className="text-[10px] text-content-muted">
                      {c.source_type.toUpperCase()} · {c.source_table} → {ENTITY_LABELS[c.target_entity]}
                      {c.last_run_at && ` · Dernier import: ${new Date(c.last_run_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button onClick={() => loadConfig(c)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                    <RefreshCw className="w-3 h-3" /> Recharger
                  </button>
                  <button onClick={() => handleDeleteConfig(c.id)}
                    className="p-1.5 rounded-lg text-content-muted hover:text-status-error hover:bg-badge-error opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Wizard ───────────────────────────────────────────────────────── */}
        <div className="card p-6">
          <Stepper current={step} />

          {/* STEP 1 — Connexion */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Nom de la configuration</label>
                  <input className="input" placeholder="ex: MySQL POS Ancien Système"
                    value={configName} onChange={(e) => setConfigName(e.target.value)} />
                </div>
                <div>
                  <label className="label">Type de base de données</label>
                  <select className="input"
                    value={dbType}
                    onChange={(e) => {
                      const t = e.target.value as SourceType;
                      setDbType(t);
                      setConn((c) => ({ ...c, port: t === 'mysql' ? 3306 : 5432 }));
                    }}>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL / MariaDB</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hôte</label>
                  <input className="input" placeholder="localhost ou IP"
                    value={conn.host} onChange={(e) => setConn((c) => ({ ...c, host: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Port</label>
                  <input className="input" type="number"
                    value={conn.port} onChange={(e) => setConn((c) => ({ ...c, port: +e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="label">Nom de la base</label>
                <input className="input" placeholder="ma_base"
                  value={conn.database} onChange={(e) => setConn((c) => ({ ...c, database: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Utilisateur</label>
                  <input className="input" placeholder="root"
                    value={conn.user} onChange={(e) => setConn((c) => ({ ...c, user: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Mot de passe</label>
                  <input className="input" type="password"
                    value={conn.password} onChange={(e) => setConn((c) => ({ ...c, password: e.target.value }))} />
                </div>
              </div>

              {/* Test status */}
              {testStatus === 'ok' && (
                <div className="flex items-center gap-2 text-status-success text-sm font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> Connexion réussie
                </div>
              )}
              {testStatus === 'error' && (
                <div className="flex items-start gap-2 text-status-error text-sm">
                  <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{testError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleTest} disabled={testStatus === 'loading' || !conn.database}
                  className="btn-secondary flex items-center gap-2">
                  {testStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
                  Tester la connexion
                </button>
                <button onClick={goToStep2} disabled={testStatus !== 'ok' || loadingTables}
                  className="btn-primary flex items-center gap-2 ml-auto">
                  {loadingTables ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Suivant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Sélection table */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="label">Entité cible dans ELM</label>
                <select className="input w-64" value={targetEntity}
                  onChange={(e) => setTargetEntity(e.target.value as TargetEntity)}>
                  {(Object.entries(ENTITY_LABELS) as [TargetEntity, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-content-secondary">{tables.length} tables trouvées — sélectionnez celle à importer :</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {tables.map((t) => (
                  <button key={t.name}
                    onClick={() => setSelectedTable(t.name)}
                    className={cn(
                      "flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all",
                      selectedTable === t.name
                        ? "border-brand-500 bg-brand-500/10 text-content-primary"
                        : "border-surface-border hover:border-brand-500/40 text-content-secondary hover:text-content-primary"
                    )}>
                    <Table2 className={cn("w-4 h-4 mb-1", selectedTable === t.name ? "text-content-brand" : "text-content-muted")} />
                    <span className="text-xs font-bold truncate w-full">{t.name}</span>
                    <span className="text-[10px] text-content-muted">{t.rows.toLocaleString()} lignes</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)} className="btn-secondary">← Retour</button>
                <button onClick={goToStep3} disabled={!selectedTable || loadingCols}
                  className="btn-primary flex items-center gap-2 ml-auto">
                  {loadingCols ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Mapper les colonnes <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — Mapping colonnes */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                Faites correspondre les colonnes de <strong className="text-content-primary">{selectedTable}</strong> aux champs
                <strong className="text-content-primary"> {ENTITY_LABELS[targetEntity]}</strong> d'ELM.
              </p>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {/* Header */}
                <div className="grid grid-cols-[1fr_24px_1fr_100px] gap-2 px-3 py-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-content-muted">Source</span>
                  <span />
                  <span className="text-[10px] font-black uppercase tracking-widest text-content-muted">Champ ELM</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-content-muted">× Multiplier</span>
                </div>
                {columnMap.map((m, i) => {
                  const col = columns[i];
                  return (
                    <div key={m.source} className="grid grid-cols-[1fr_24px_1fr_100px] gap-2 items-center px-3 py-2 rounded-lg bg-surface-input">
                      {/* Source */}
                      <div>
                        <p className="text-sm font-mono text-content-primary">{m.source}</p>
                        <p className="text-[10px] text-content-muted">{col?.type}</p>
                      </div>
                      {/* Arrow */}
                      <ArrowRight className={cn("w-4 h-4", m.target ? "text-content-brand" : "text-content-muted")} />
                      {/* Target */}
                      <select
                        className="input text-xs py-1"
                        value={m.target}
                        onChange={(e) => setColumnMap((prev) => prev.map((x, j) => j === i ? { ...x, target: e.target.value } : x))}>
                        <option value="">(ignorer)</option>
                        {ELM_FIELDS[targetEntity].map((f) => (
                          <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                        ))}
                      </select>
                      {/* Multiplier */}
                      <input
                        type="number" step="0.01" placeholder="1.00"
                        className="input text-xs py-1"
                        value={m.multiplier ?? ''}
                        onChange={(e) => setColumnMap((prev) => prev.map((x, j) =>
                          j === i ? { ...x, multiplier: e.target.value ? +e.target.value : undefined } : x
                        ))} />
                    </div>
                  );
                })}
              </div>

              {/* Vérif champs requis */}
              {(() => {
                const missing = ELM_FIELDS[targetEntity]
                  .filter((f) => f.required && !columnMap.some((m) => m.target === f.key));
                return missing.length > 0 ? (
                  <div className="flex items-center gap-2 text-status-warning text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Champs requis non mappés : {missing.map((f) => f.label).join(', ')}
                  </div>
                ) : null;
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(2)} className="btn-secondary">← Retour</button>
                <button onClick={goToStep4} disabled={loadingPreview}
                  className="btn-primary flex items-center gap-2 ml-auto">
                  {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  Aperçu <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — Aperçu */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">
                Aperçu des 10 premières lignes après mapping :
              </p>

              {previewRows.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-surface-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-input border-b border-surface-border">
                      <tr>
                        {ELM_FIELDS[targetEntity].map((f) => (
                          <th key={f.key} className="px-3 py-2 text-left font-bold text-content-secondary whitespace-nowrap">
                            {f.label}{f.required ? <span className="text-status-error ml-0.5">*</span> : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => {
                        const mapped = applyMapping(row);
                        const hasRequired = ELM_FIELDS[targetEntity]
                          .filter((f) => f.required)
                          .every((f) => mapped[f.key] != null && mapped[f.key] !== '');
                        return (
                          <tr key={i} className={cn(
                            "border-b border-surface-border",
                            !hasRequired && "bg-badge-error",
                            i % 2 === 0 ? "" : "bg-surface-card/30",
                          )}>
                            {ELM_FIELDS[targetEntity].map((f) => (
                              <td key={f.key} className={cn(
                                "px-3 py-2 font-mono text-content-primary",
                                f.required && !mapped[f.key] && "text-status-error"
                              )}>
                                {mapped[f.key] != null ? String(mapped[f.key]) : <span className="text-content-muted italic">—</span>}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-content-muted text-sm italic">Aucune ligne trouvée.</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(3)} className="btn-secondary">← Retour</button>
                <button onClick={() => setStep(5)}
                  className="btn-primary flex items-center gap-2 ml-auto">
                  <Play className="w-4 h-4" /> Lancer l'import <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5 — Import */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="rounded-xl bg-surface-input border border-surface-border p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Source</span>
                  <span className="font-mono text-content-primary">{conn.host}/{conn.database} → {selectedTable}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Destination</span>
                  <span className="font-semibold text-content-primary">{ENTITY_LABELS[targetEntity]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-content-secondary">Colonnes mappées</span>
                  <span className="font-semibold text-content-primary">{columnMap.filter((m) => m.target).length} / {columnMap.length}</span>
                </div>
              </div>

              {/* Résultat */}
              {importResult && (
                <div className={cn(
                  "rounded-xl border p-4 space-y-2",
                  importResult.errors.length === 0
                    ? "bg-badge-success border-status-success"
                    : "bg-badge-warning border-status-warning"
                )}>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {importResult.errors.length === 0
                      ? <CheckCircle2 className="w-5 h-5 text-status-success" />
                      : <AlertTriangle className="w-5 h-5 text-status-warning" />}
                    {importResult.imported} lignes importées
                    {importResult.errors.length > 0 && ` · ${importResult.errors.length} erreur(s)`}
                  </div>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs font-mono text-status-error">
                      Ligne {e.row} : {e.message}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <button onClick={() => setStep(4)} className="btn-secondary">← Retour</button>

                <button onClick={handleSaveConfig} disabled={!!savedConfigId}
                  className="btn-secondary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {savedConfigId ? 'Déjà sauvegardé' : 'Sauvegarder la config'}
                </button>

                <button onClick={handleImport} disabled={importing}
                  className="btn-primary flex items-center gap-2 ml-auto">
                  {importing
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Import en cours…</>
                    : <><Play className="w-4 h-4" /> {importResult ? 'Ré-importer' : 'Lancer l\'import'}</>}
                </button>
              </div>

              {/* Bouton "nouvelle config" */}
              {importResult && importResult.errors.length === 0 && (
                <div className="text-center pt-2">
                  <button onClick={() => {
                    setStep(1); setTestStatus('idle'); setSelectedTable('');
                    setColumnMap([]); setImportResult(null); setSavedConfigId(null);
                  }} className="text-sm text-content-brand hover:underline flex items-center gap-1 mx-auto">
                    <ListChecks className="w-4 h-4" /> Faire un autre import
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
