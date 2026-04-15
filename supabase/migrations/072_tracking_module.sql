-- ─── Module de suivi terrain ─────────────────────────────────────────────────
INSERT INTO app_modules (id, label, description, icon, is_core, sort_order) VALUES
  ('tracking', 'Suivi terrain (GPS)', 'Tracking en temps réel de la position des membres de l''équipe sur le terrain', 'MapPin', false, 11)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Par défaut, activé pour aucun type, doit être activé manuellement en backoffice
