export const ORDER_STATUS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS order_statuses (
  order_id            TEXT PRIMARY KEY,
  status              TEXT NOT NULL
                      CHECK (status IN ('PENDING','PAID')),
  payment_id          TEXT,
  provider_reference  TEXT,
  amount_minor        BIGINT,
  currency            CHAR(3),
  reason              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export const ORDER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id                 UUID PRIMARY KEY,
  account_id         TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('PENDING','PAID')),
  items              JSONB NOT NULL,
  total_minor        BIGINT NOT NULL CHECK (total_minor >= 0),
  currency           CHAR(3) NOT NULL,
  shipping_address   JSONB,
  payment_id         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_outbox (
  event_id      TEXT PRIMARY KEY,
  topic         TEXT NOT NULL,
  aggregate_id  TEXT NOT NULL,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS order_outbox_pending_idx
  ON order_outbox (created_at) WHERE published_at IS NULL;
`;