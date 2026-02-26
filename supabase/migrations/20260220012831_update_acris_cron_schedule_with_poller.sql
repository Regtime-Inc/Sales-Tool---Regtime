/*
  # Update ACRIS Cron Schedule and Add Poller

  1. Changes
    - Update the daily sync job to use mode: "auto" instead of socrata-only
    - Remove hardcoded lookbackDays: 3 (function now auto-detects)
    - Add a 6-hour poller job that checks Socrata for new data and triggers sync if found

  2. Functions
    - `trigger_acris_sync()` - updated to use mode: "auto"
    - `trigger_acris_poll()` - new function that calls the acris-poll edge function

  3. Scheduled Jobs
    - `acris-daily-sync` - daily at 08:00 UTC with mode: "auto"
    - `acris-poller` - every 6 hours to detect new Socrata data drops

  4. Important Notes
    - Vault secrets (project_url, service_role_key) must already be set
    - The poller is lightweight and only checks a single Socrata aggregation
    - If new data is found, the poller triggers a full auto sync
*/

-- Update the daily sync trigger function to use mode: "auto"
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
      'mode', 'auto',
      'source', 'cron'
    )
  );
END;
$$;

-- Create the poller trigger function
CREATE OR REPLACE FUNCTION public.trigger_acris_poll()
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
    RAISE NOTICE 'ACRIS poll skipped: vault secrets not set';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/acris-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Update daily sync schedule (unschedule old, reschedule new)
SELECT cron.unschedule('acris-daily-sync');

SELECT cron.schedule(
  'acris-daily-sync',
  '0 8 * * *',
  'SELECT public.trigger_acris_sync()'
);

-- Add 6-hour poller schedule
SELECT cron.schedule(
  'acris-poller',
  '0 */6 * * *',
  'SELECT public.trigger_acris_poll()'
);
