-- Messages B2C personnalisables pour chaque business
-- Les placeholders supportés :
--   {nom}      → nom de l'établissement
--   {mot_cle}  → mot-clé du menu
--   {commande} → ID court de la commande (8 chars)
--   {total}    → montant total de la commande

ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS msg_cart_footer TEXT NOT NULL
    DEFAULT 'Tapez *confirmer* pour valider ou *menu* pour modifier.',
  ADD COLUMN IF NOT EXISTS msg_shipping_question TEXT NOT NULL
    DEFAULT '🚚 *Comment souhaitez-vous recevoir votre commande ?*',
  ADD COLUMN IF NOT EXISTS msg_address_request TEXT NOT NULL
    DEFAULT '📍 *Adresse de livraison*\n\nPartagez votre localisation 📌 ou tapez votre adresse en texte.\n\n_Tapez *annuler* pour revenir au menu._',
  ADD COLUMN IF NOT EXISTS msg_delivery_confirmation TEXT NOT NULL
    DEFAULT '✅ *Votre commande a été livrée !*\n\n📦 *Commande :* #{commande}\n💰 *Total :* {total} FCFA\n\nMerci pour votre confiance ! 🙏';
