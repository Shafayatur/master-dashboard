-- Dashboard-owned data (Neon). The source DB is never written to.

CREATE TABLE monthly_targets (
  month         date PRIMARY KEY CHECK (EXTRACT(day FROM month) = 1),  -- first day of the month (Dhaka)
  target_amount numeric(16,2) NOT NULL CHECK (target_amount >= 0),     -- BDT
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE export_log (
  id         bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  tab        text NOT NULL,
  format     text NOT NULL CHECK (format IN ('csv', 'xlsx', 'pdf')),
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count  integer
);

CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  ip_hash    text NOT NULL,
  success    boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_ip_time ON login_attempts (ip_hash, created_at DESC);

INSERT INTO app_settings (key, value) VALUES
  ('segment_thresholds', '{"recentlyActiveDays": 30, "coolingDays": 60}'),
  ('reinvest_window_days', '30');
