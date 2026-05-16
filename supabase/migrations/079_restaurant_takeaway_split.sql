-- Commandes à emporter / livraison + addition partagée

alter table orders
  add column if not exists order_channel    text not null default 'salle'
    check (order_channel in ('salle', 'emporter', 'livraison')),
  add column if not exists delivery_address text;

-- Index pour filtrer rapidement les commandes emporter/livraison du jour
create index if not exists orders_channel_date_idx
  on orders (business_id, order_channel, created_at desc)
  where order_channel in ('emporter', 'livraison');

-- Table des demandes de suppression de données (Play Store compliance)
create table if not exists deletion_requests (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  type        text not null default 'account' check (type in ('account', 'data')),
  data_types  text[],
  reason      text,
  status      text not null default 'pending' check (status in ('pending', 'processing', 'done')),
  created_at  timestamptz not null default now()
);

alter table deletion_requests enable row level security;

create policy "public insert only" on deletion_requests
  for insert with check (true);
