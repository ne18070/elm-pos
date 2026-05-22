import { supabase } from './client';

// ─── Proxy abstraction (IPC Electron ou Edge Function) ────────────────────────

type DbAction = 'test' | 'list_tables' | 'get_schema' | 'fetch_rows';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.dbImport;
}

async function callProxy(
  action: DbAction,
  config: DbConnection & { type: SourceType },
  extra?: { table?: string; limit?: number; offset?: number }
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  if (isElectron()) {
    const ipc = (window as any).electronAPI.dbImport;
    switch (action) {
      case 'test':        return ipc.test(config);
      case 'list_tables': return ipc.tables(config);
      case 'get_schema':  return ipc.schema(config, extra?.table);
      case 'fetch_rows':  return ipc.rows(config, extra?.table, extra?.limit ?? 100, extra?.offset ?? 0);
    }
  }

  // Navigateur → Edge Function
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke('db-proxy', {
    body: { action, config, ...extra },
    headers: session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {},
  });
  if (res.error) return { success: false, error: res.error.message };
  return res.data ?? { success: false, error: 'Pas de réponse' };
}

export { callProxy, isElectron };

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceType   = 'postgresql' | 'mysql';
export type TargetEntity = 'products' | 'clients' | 'categories' | 'staff' | 'stock_entries' | 'orders';

export interface DbConnection {
  host:     string;
  port:     number;
  database: string;
  user:     string;
  password: string;
}

export interface ColumnMapping {
  source:      string;          // colonne source
  target:      string;          // champ ELM cible ('' = ignorer)
  multiplier?: number;          // ex: 1.18 pour convertir HT→TTC
}

export interface ImportConfig {
  id:            string;
  business_id:   string;
  name:          string;
  source_type:   SourceType;
  connection:    DbConnection;
  source_table:  string;
  target_entity: TargetEntity;
  column_map:    ColumnMapping[];
  last_run_at:   string | null;
  last_count:    number;
  created_at:    string;
}

// ─── Champs ELM par entité ────────────────────────────────────────────────────

export const ELM_FIELDS: Record<TargetEntity, { key: string; label: string; required?: boolean; numeric?: boolean }[]> = {
  products: [
    { key: 'name',        label: 'Nom du produit',  required: true          },
    { key: 'price',       label: 'Prix de vente',   required: true, numeric: true },
    { key: 'sku',         label: 'Référence (SKU)'                          },
    { key: 'cost_price',  label: 'Prix de revient', numeric: true           },
    { key: 'description', label: 'Description'                              },
    { key: 'barcode',     label: 'Code-barres'                              },
  ],
  clients: [
    { key: 'name',    label: 'Nom complet', required: true },
    { key: 'phone',   label: 'Téléphone'                  },
    { key: 'email',   label: 'Email'                      },
    { key: 'address', label: 'Adresse'                    },
  ],
  categories: [
    { key: 'name',        label: 'Nom de la catégorie', required: true },
    { key: 'description', label: 'Description'                        },
    { key: 'color',       label: 'Couleur (hex)'                      },
    { key: 'icon',        label: 'Icône (emoji)'                      },
  ],
  staff: [
    { key: 'full_name',  label: 'Nom complet',  required: true },
    { key: 'phone',      label: 'Téléphone'                   },
    { key: 'email',      label: 'Email'                       },
    { key: 'role',       label: 'Rôle (staff/manager/…)'     },
    { key: 'salary',     label: 'Salaire',      numeric: true },
    { key: 'hire_date',  label: 'Date d\'embauche'           },
  ],
  stock_entries: [
    { key: 'product_id',    label: 'ID Produit',       required: true          },
    { key: 'quantity',      label: 'Quantité',         required: true, numeric: true },
    { key: 'cost_per_unit', label: 'Coût unitaire',    numeric: true           },
    { key: 'supplier',      label: 'Fournisseur'                               },
    { key: 'notes',         label: 'Notes'                                     },
  ],
  orders: [
    { key: 'total',          label: 'Total',            required: true, numeric: true },
    { key: 'subtotal',       label: 'Sous-total',       numeric: true           },
    { key: 'tax_amount',     label: 'TVA',              numeric: true           },
    { key: 'discount_amount',label: 'Remise',           numeric: true           },
    { key: 'status',         label: 'Statut'                                    },
    { key: 'notes',          label: 'Notes'                                     },
    { key: 'created_at',     label: 'Date de commande'                          },
  ],
};

export const ENTITY_LABELS: Record<TargetEntity, string> = {
  products:     'Produits',
  clients:      'Clients',
  categories:   'Catégories',
  staff:        'Employés',
  stock_entries:'Entrées de stock',
  orders:       'Commandes',
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getImportConfigs(businessId: string): Promise<ImportConfig[]> {
  const { data, error } = await supabase
    .from('import_configs')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ImportConfig[];
}

export async function saveImportConfig(
  businessId: string,
  cfg: Omit<ImportConfig, 'id' | 'business_id' | 'last_run_at' | 'last_count' | 'created_at'>
): Promise<ImportConfig> {
  const { data, error } = await supabase
    .from('import_configs')
    .insert({ ...cfg, business_id: businessId } as unknown as import('./database.types').TablesInsert<'import_configs'>)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as ImportConfig;
}

export async function updateImportConfig(
  id: string,
  patch: Partial<Pick<ImportConfig, 'name' | 'connection' | 'column_map' | 'last_run_at' | 'last_count'>>
): Promise<void> {
  const { error } = await supabase
    .from('import_configs')
    .update({ ...patch, updated_at: new Date().toISOString() } as unknown as import('./database.types').TablesUpdate<'import_configs'>)
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteImportConfig(id: string): Promise<void> {
  const { error } = await supabase.from('import_configs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Import dans Supabase ─────────────────────────────────────────────────────

export async function importRowsToSupabase(
  businessId: string,
  entity: TargetEntity,
  rows: Record<string, unknown>[]
): Promise<{ imported: number; errors: { row: number; message: string }[] }> {
  const errors: { row: number; message: string }[] = [];
  let imported = 0;

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, business_id: businessId }));
    const { error } = await supabase.from(entity).insert(batch);
    if (error) {
      // Rejeter tout le batch, noter l'erreur pour la première ligne du batch
      errors.push({ row: i + 1, message: error.message });
    } else {
      imported += batch.length;
    }
  }

  return { imported, errors };
}
