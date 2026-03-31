-- Ajout colonne menu_keyword sur whatsapp_configs (migration corrective)
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS menu_keyword TEXT NOT NULL DEFAULT 'menu';
