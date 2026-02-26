/*
  # Enable pg_cron and pg_net for daily ACRIS sync scheduling

  1. Extensions
    - Enable `pg_cron` for scheduled job execution
    - Enable `pg_net` for async HTTP calls from within PostgreSQL

  2. Functions
    - `trigger_acris_sync()` - calls the acris-sync edge function via pg_net
    - Reads project URL and service role key from vault secrets

  3. Scheduled Job
    - Runs daily at 08:00 UTC (3:00 AM ET, after ACRIS 1-2:15 AM maintenance)
    - Calls the acris-sync edge function with service_role auth

  4. Important Notes
    - After deploying, you must populate vault secrets:
      ```sql
      SELECT vault.create_secret('https://YOUR_PROJECT.supabase.co', 'project_url');
      SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
      ```
    - The cron job will no-op gracefully if secrets are not yet set
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.trigger_acris_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
    LIMIT 1;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'ACRIS sync skipped: vault secrets project_url or service_role_key not set';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/acris-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'source', 'cron',
      'lookbackDays', 3
    )
  );
END;
$$;

SELECT cron.schedule(
  'acris-daily-sync',
  '0 8 * * *',
  'SELECT public.trigger_acris_sync()'
);
