-- ─── Workflow Cron Migration ──────────────────────────────────────────────────
-- Enable pg_net for HTTP requests from Postgres (to call Edge Functions)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: pg_cron is usually already enabled on Supabase.
-- If not, it can be enabled via the dashboard.

-- Function to trigger the workflow processor
-- This allows scheduling via pg_cron without repeating the HTTP config
CREATE OR REPLACE FUNCTION public.invoke_workflow_processor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- This is a placeholder. In production, you should use your project URL and service_role key.
  -- Alternatively, use the Supabase Dashboard -> Cron Jobs which is easier to manage.
  PERFORM net.http_post(
    url := (SELECT value FROM (SELECT current_setting('app.settings.supabase_url', true) AS value) s WHERE value IS NOT NULL) || '/functions/v1/workflow-processor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM (SELECT current_setting('app.settings.service_role_key', true) AS value) s WHERE value IS NOT NULL)
    )
  );
END;
$$;

-- Schedule the cron job if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unscheduling previous if exists (to avoid duplicates if migration is rerun)
    PERFORM cron.unschedule('workflow-processor-cron');
    
    PERFORM cron.schedule(
      'workflow-processor-cron',
      '*/5 * * * *',
      'SELECT public.invoke_workflow_processor()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
