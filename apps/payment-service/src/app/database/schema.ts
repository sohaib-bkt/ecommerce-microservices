export const PAYMENT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY,
  order_id           TEXT NOT NULL UNIQUE,
  account_id         TEXT NOT NULL,
  amount_minor       BIGINT NOT NULL CHECK (amount_minor >= 0),
  currency           CHAR(3) NOT NULL,
  status             TEXT NOT NULL
                     CHECK (status IN ('PENDING','AUTHORIZED','CAPTURED','FAILED','REFUNDED')),
  method_type        TEXT NOT NULL DEFAULT 'CARD',
  provider           TEXT NOT NULL DEFAULT 'stripe',
  provider_reference TEXT,
  failure_reason     TEXT,
  source_event_id    TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_provider_reference_idx
  ON payments (provider_reference);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
