-- ─── Journal d'activité (audit log) ─────────────────────────────────────────

create table if not exists activity_logs (
  id           uuid        primary key default gen_random_uuid(),
  business_id  uuid        not null references businesses(id) on delete cascade,
  user_id      uuid        references auth.users(id) on delete set null,
  user_name    text,
  action       text        not null,   -- ex: 'order.created', 'product.deleted'
  entity_type  text,                   -- ex: 'order', 'product', 'stock', 'user'
  entity_id    text,                   -- UUID ou identifiant de l'entité concernée
  metadata     jsonb,                  -- données contextuelles supplémentaires
  created_at   timestamptz not null default now()
);

-- Index pour les requêtes les plus courantes
create index if not exists activity_logs_biz_date_idx
  on activity_logs (business_id, created_at desc);

create index if not exists activity_logs_user_idx
  on activity_logs (user_id);

create index if not exists activity_logs_action_idx
  on activity_logs (action);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table activity_logs enable row level security;

-- Tout utilisateur authentifié peut insérer un log
create policy "activity_logs_insert"
  on activity_logs for insert
  to authenticated
  with check (true);

-- Seuls owner/admin voient les logs de leur établissement
create policy "activity_logs_select"
  on activity_logs for select
  to authenticated
  using (
    exists (
      select 1 from users
      where users.id = auth.uid()
        and users.business_id = activity_logs.business_id
        and users.role in ('owner', 'admin')
    )
  );
