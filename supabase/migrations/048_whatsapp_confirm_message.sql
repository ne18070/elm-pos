ALTER TABLE whatsapp_configs
  ADD COLUMN IF NOT EXISTS confirm_message TEXT NOT NULL DEFAULT
    '✅ *Commande confirmée !*\n\nVotre commande a bien été enregistrée. Notre équipe vous contactera pour la préparation ou la livraison.\n\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande, tapez *{mot_cle}*.';
