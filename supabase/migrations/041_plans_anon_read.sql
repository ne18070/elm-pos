-- Allow anonymous (unauthenticated) users to read plans and payment_settings.
-- Needed for the public /subscribe page where no user session exists yet.

CREATE POLICY "plans_select_anon"
  ON public.plans FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "paysettings_select_anon"
  ON public.payment_settings FOR SELECT TO anon USING (true);
