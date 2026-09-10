-- ============================================================================
-- Migration 125 : ordre total du journal de stock (colonne « seq »)
--
-- Problème corrigé
-- ----------------
-- Toutes les lignes écrites par une même transaction reçoivent le même
-- created_at (= heure de DÉBUT de transaction, cf. now()). Or une seule
-- « Modification commande » (update_pending_order) fait, pour un même
-- produit, un UPDATE « +ancienne_qté » (remise en stock) puis un UPDATE
-- « -nouvelle_qté » (re-déduction) => 2 lignes de journal au created_at
-- identique.
--
-- getStockMovements trie uniquement par « created_at DESC » ; la PK est un
-- uuid aléatoire => aucun départage. Les lignes à horodatage égal reviennent
-- dans un ordre non déterministe, ce qui fait apparaître dans
-- StockHistoryModal :
--   * un faux « écart » fiche produit / dernier mouvement (rows[0] tombe sur
--     la ligne intermédiaire « +ancienne_qté » au lieu de la ligne finale) ;
--   * de fausses « ruptures de chaîne » (lignes voisines à l'écran mais pas
--     chronologiquement adjacentes).
--
-- Fix
-- ---
-- Colonne « seq » monotone (IDENTITY) => ordre total fiable, indépendant de
-- la résolution de created_at. Le tri passe de created_at à seq côté service.
-- Aucune modification du trigger : seq est auto-renseignée à chaque INSERT.
-- ============================================================================

-- ─── Colonne + backfill déterministe, puis attache de l'IDENTITY ────────────
-- Backfill dans l'ordre d'insertion physique (created_at puis ctid) AVANT
-- d'attacher l'identity, sinon les lignes existantes resteraient à NULL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'stock_movements'
      AND column_name  = 'seq'
  ) THEN
    ALTER TABLE public.stock_movements ADD COLUMN seq bigint;

    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, ctid) AS rn
      FROM public.stock_movements
    )
    UPDATE public.stock_movements m
    SET seq = o.rn
    FROM ordered o
    WHERE m.id = o.id;

    ALTER TABLE public.stock_movements ALTER COLUMN seq SET NOT NULL;
    ALTER TABLE public.stock_movements
      ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY;

    -- La séquence IDENTITY démarre à 1 : la caler après le max existant pour
    -- éviter toute collision au prochain INSERT.
    PERFORM setval(
      pg_get_serial_sequence('public.stock_movements', 'seq'),
      COALESCE((SELECT MAX(seq) FROM public.stock_movements), 1),
      (SELECT COUNT(*) > 0 FROM public.stock_movements)
    );
  END IF;
END $$;

-- ─── Index pour « WHERE product_id = ? ORDER BY seq DESC LIMIT ? » ──────────
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_seq
  ON public.stock_movements (product_id, seq DESC);

-- ─── Grants (baseline 085) ────────────────────────────────────────────────
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
