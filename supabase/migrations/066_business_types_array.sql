-- Ajoute le support multi-types par établissement
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS types text[] NOT NULL DEFAULT '{}';

-- Initialiser "types" depuis "type" existant pour les lignes déjà créées
UPDATE businesses
  SET types = ARRAY[type]
  WHERE type IS NOT NULL AND type <> '' AND array_length(types, 1) IS NULL;
