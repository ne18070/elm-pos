-- Lien de paiement Wave du marchand (optionnel)
-- Exemple : https://pay.wave.com/m/M_sn_8BA6UkixfXJl/c/sn/?
ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS wave_payment_url TEXT;
