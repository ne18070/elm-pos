-- Ajoute le support TVA incluse dans le prix (prix TTC saisis)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT false;
