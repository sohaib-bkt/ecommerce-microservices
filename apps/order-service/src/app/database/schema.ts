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