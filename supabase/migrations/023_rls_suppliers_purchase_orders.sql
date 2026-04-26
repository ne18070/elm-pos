-- RLS for suppliers
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_member_all" ON public.suppliers;
CREATE POLICY "suppliers_member_all" ON public.suppliers
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()));

-- RLS for purchase_orders
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_member_all" ON public.purchase_orders;
CREATE POLICY "purchase_orders_member_all" ON public.purchase_orders
  FOR ALL TO authenticated
  USING  (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM public.business_members WHERE user_id = auth.uid()));

-- RLS for purchase_order_items (joined via purchase_orders)
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_order_items_member_all" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_member_all" ON public.purchase_order_items
  FOR ALL TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE business_id IN (
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE business_id IN (
        SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
      )
    )
  );
