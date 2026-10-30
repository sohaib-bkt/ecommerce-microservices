export const ACCOUNT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id               UUID PRIMARY KEY,
  email            TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  shipping_address JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_unique
  ON accounts (lower(email));
`;