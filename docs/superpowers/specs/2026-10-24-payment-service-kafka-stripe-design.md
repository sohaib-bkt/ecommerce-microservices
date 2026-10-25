# Payment Service: Kafka `order.created` → Stripe PaymentIntent → Webhook Confirmation

**Status:** Draft for approval
**Date:** 2026-10-24
**Owner:** payment-service
**Related:** `libs/contracts` order/payment events, `apps/payment-service`

## 1. Intent

When an order is created, payment-service must start a payment without charging the
customer twice. The service consumes the `OrderCreated` event from Kafka, creates a
durable local payment record guarded by a unique `order_id`, creates a Stripe
PaymentIntent (idempotently), and lets Stripe's signed webhook move the record to its
final state.

Repeated Kafka delivery, concurrent consumers, and repeated Stripe webhook delivery
must all be safe. The customer is charged at most once per order.

## 2. Scope

### In scope

- Kafka consumer for topic `order.created` in payment-service.
- Runtime validation of the event with `orderCreatedSchema` / `parse` from
  `@ecommerce-platform/contracts`.
- Postgres persistence for payments and processed Stripe webhook events.
- Stripe PaymentIntent creation through a narrow gateway port (real SDK + fake).
- Signed Stripe webhook endpoint that updates the payment status.
- A read-only REST endpoint to inspect a payment.
- Docker Compose for local Postgres and Kafka.
- Unit tests for idempotency/validation/failure paths, Postgres integration tests for
  the unique constraints, and a manual end-to-end verification script.

### Out of scope

- Order-service publishing `OrderCreated` (it does not publish events yet; the
  verification script acts as the producer).
- Publishing `PaymentInitiated` / `PaymentAuthorized` / `PaymentCaptured` to Kafka.
  The local payment row is the source of truth for this slice.
- Checkout UI, Stripe Elements, and returning a `client_secret` to a browser.
- Refunds, capture/void flows, and payment retries after a terminal failure.
- Production migration tooling, outbox pattern, and DLQ/retry topics.
- gRPC server implementation for the existing `PaymentService` proto.

### Anti-goals

- Charging in the Kafka handler before a durable record exists.
- Relying on Kafka's "exactly once" semantics. Kafka delivery is at-least-once.
- Using an in-memory map as the idempotency guard.
- Trusting an unsigned webhook payload.
- Logging secrets, raw webhook bodies, or card data.

## 3. Architecture

```
order-service (future publisher)
        │  topic: order.created
        ▼
┌──────────────────────────── payment-service ────────────────────────────┐
│ NestJS Kafka consumer (@EventPattern)                                   │
│   1. validate envelope + payload with orderCreatedSchema                │
│   2. insert payments row ON CONFLICT (order_id) DO NOTHING              │
│   3. if no Stripe intent yet: create PaymentIntent with                 │
│      idempotencyKey = payments.id                                       │
│   4. store payment_intent id on the row                                 │
│                                                                          │
│ HTTP: POST /api/webhooks/stripe                                          │
│   1. verify Stripe signature against the raw body                       │
│   2. one transaction: insert stripe event id (dedupe) + update payment  │
│   3. return 200; return 500 on retryable processing failure             │
└──────────────────────────────────────────────────────────────────────────┘
        │                                   ▲
        │ PaymentIntent create              │ signed webhook
        ▼                                   │
     Stripe ────────────────────────────────┘
```

Payment service remains a hybrid Nest app: HTTP on `PORT` (default `3004`) and a
Kafka microservice connection. HTTP is needed for the Stripe webhook.

## 4. Data model

Postgres. The schema is applied on startup with `CREATE TABLE IF NOT EXISTS`
(bootstrap only; a real migration tool is a follow-up).

```sql
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
```

- `payments.order_id UNIQUE` is the primary idempotency guard. One order gets at
  most one payment row, forever.
- `payments.id` is generated before the Stripe call and reused as the Stripe
  idempotency key.
- `provider_reference` is the Stripe PaymentIntent id (`pi_...`).
- `source_event_id` is kept for traceability, not for deduplication.
- `amount_minor` is Stripe's smallest currency unit, matching
  `ecommerce.common.v1.Money.amount`. The constraint is `>= 0` so a zero-amount
  event can be persisted as `FAILED` for traceability instead of becoming a poison
  message that can never be inserted. Negative amounts are already rejected by the
  shared `moneySchema`.
- `method_type` defaults to `CARD` because `OrderCreatedPayload` has no payment
  method yet.

## 5. Idempotency rules

### 5.1 Kafka redelivery

The consumer is idempotent on `order_id`, not on the Kafka offset.

1. Validate the event. Invalid events are logged and acknowledged (dropped); retrying
   can never make them valid.
2. `INSERT INTO payments (...) VALUES (...) ON CONFLICT (order_id) DO NOTHING
   RETURNING *`.
3. If the insert returns a row, this consumer owns the payment. Create the Stripe
   PaymentIntent with `{ idempotencyKey: payment.id }` and persist
   `provider_reference`.
4. If the insert conflicts, load the existing row:
   - `provider_reference` set → already done; return without calling Stripe.
   - `status = 'FAILED'` → terminal for ingestion; return without calling Stripe.
     Otherwise a duplicate delivery could retry a payment the policy already
     rejected.
   - `provider_reference` null and status `PENDING`/`AUTHORIZED` → a previous
     attempt crashed between Stripe and the DB update (or a concurrent consumer is
     working). Call Stripe again with the same `payment.id` idempotency key;
     Stripe returns the original PaymentIntent.
5. Concurrent consumers across replicas are safe: one insert wins; both Stripe
   calls carry the same idempotency key.

Kafka handler failures are allowed to propagate for retryable errors. KafkaJS does not
commit the offset when `eachMessage` rejects, so the message is retried. Because the
handler is idempotent, retries cannot double-charge.

### 5.2 Stripe idempotency window

Stripe keeps idempotency keys for 24 hours. The normal repeated-delivery case is fully
covered. The residual edge case is a crash after Stripe creates the intent but before
`provider_reference` is stored, followed by a redelivery more than 24 hours later.
That is accepted for this slice and documented as a follow-up (reconciliation by
`metadata.orderId` / PaymentIntent search).

### 5.3 Webhook redelivery

Stripe may deliver the same event more than once. The insert into
`stripe_webhook_events` and the payment update run in one transaction:

- `INSERT ... ON CONFLICT (event_id) DO NOTHING`; no row means duplicate → 200.
- Payment not found → rollback and return 500 so Stripe retries.
- Unknown event type → record the event id and return 200.
- Status transitions from webhooks:

  | Current | `succeeded` | `payment_failed` / `canceled` |
  |---|---|---|
  | `PENDING` | `CAPTURED` | `FAILED` |
  | `AUTHORIZED` | `CAPTURED` | `FAILED` |
  | `FAILED` | `CAPTURED` | `FAILED` (update reason) |
  | `CAPTURED` | no-op | no-op |
  | `REFUNDED` | no-op | no-op |

  `CAPTURED` and `REFUNDED` are absorbing. `FAILED` is absorbing for *ingestion*
  (a duplicate Kafka event does not retry Stripe) but not for *webhooks*: if
  Stripe reports a genuine success for an intent, success wins. A `FAILED` row
  created without a PaymentIntent cannot receive a webhook, so this does not
  resurrect locally rejected payments.

## 6. Kafka integration

- Transport: `@nestjs/microservices` `Transport.KAFKA` (KafkaJS under the hood).
- Topic: `order.created` (constant `ORDER_CREATED_TOPIC` in payment-service).
- Handler: `@EventPattern(ORDER_CREATED_TOPIC)` in `OrderCreatedConsumer`.
- Consumer group: `KAFKA_GROUP_ID` (default `payment-service`; Nest appends
  `-server` by default, so the effective id is `payment-service-server`).
- `fromBeginning: false`.
- Broker list parsed from `KAFKA_BROKERS` (comma-separated).
- The consumer validates with:
  `parse<OrderCreatedEvent>(data, orderCreatedSchema)`.
  `orderCreatedSchema` already pins `type` to `OrderCreated`.
- Invalid JSON is converted to a string by Nest's Kafka parser (it does not throw);
  the schema check rejects it and the handler acknowledges.

### Error policy

- Validation failure → log `event.id` if present, drop, ack. This includes
  negative amounts and currencies that are not exactly 3 characters, because the
  shared schema rejects them before the handler runs.
- `amount_minor === 0` or currency not three ASCII letters (`/^[A-Z]{3}$/i`) →
  insert a `FAILED` row with a reason, ack. A zero amount passes the shared
  schema, so it must not be allowed to cause an insert error and endless retry.
- Stripe retryable error (connection, API 5xx, rate limit) → throw, let Kafka retry.
- Stripe non-retryable error (auth, permission, invalid request, idempotency) →
  mark `FAILED` with the reason, ack. Retrying cannot succeed.
- Database errors → throw, let Kafka retry.

## 7. Stripe integration

### 7.1 PaymentIntent, not Checkout Session

Use a PaymentIntent because the payment service is backend-owned and the existing
payment domain is generic (not Stripe-hosted checkout). A Checkout Session would bake
Stripe-hosted UI concerns into this slice.

- Create with:
  - `amount`: `payload.total.amount`
  - `currency`: `payload.total.currency.toLowerCase()`
  - `automatic_payment_methods: { enabled: true }`
  - `metadata: { paymentId, orderId, eventId }`
  - request option `idempotencyKey: payment.id`
- Do not hardcode a Stripe API version; let the SDK pin its own.
- Automatic capture. `payment_intent.succeeded` maps to `CAPTURED`. `AUTHORIZED` is
  reserved for a future manual-capture flow.
- Because there is no checkout UI in this slice, a real PaymentIntent remains
  `requires_payment_method` until a client confirms it. That is expected. The
  verification path uses a signed webhook fixture (and, with real test keys, Stripe
  CLI/dashboard confirmation).

### 7.2 Gateway port

```ts
export interface CreatePaymentIntentInput {
  amountMinor: number;
  currency: string;
  paymentId: string;
  orderId: string;
  eventId: string;
  idempotencyKey: string;
}

export interface PaymentIntentResult {
  id: string;
  status: string;
}

export interface StripeGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
}
```

Two adapters:

- `StripeSdkGateway`: calls `stripe.paymentIntents.create`.
- `FakeStripeGateway`: selected with `STRIPE_GATEWAY=fake`; returns deterministic
  `pi_fake_<paymentId>` ids and makes no network call. Loud startup log. Used for
  local development and the manual verification script.

`STRIPE_GATEWAY` defaults to `stripe`, which requires `STRIPE_SECRET_KEY`.

### 7.3 Webhook verification

`POST /api/webhooks/stripe`

- `NestFactory.create(AppModule, { rawBody: true })`.
- Read `req.rawBody`; reject with 400 if it is missing.
- `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`.
- Invalid/missing signature → 400, no DB writes.
- Supported events:
  - `payment_intent.succeeded` → `CAPTURED`
  - `payment_intent.payment_failed` → `FAILED` with
    `last_payment_error?.message ?? 'Payment failed'`
  - `payment_intent.canceled` → `FAILED` with `PaymentIntent canceled`
- Find the payment by `payment_intent` id (`provider_reference`).
- Respond `{ received: true }` on success or duplicate.

## 8. Configuration

`ConfigModule.forRoot({ isGlobal: true })`, `.env` at the workspace root.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | `postgres://ecommerce:ecommerce@localhost:5432/ecommerce` |
| `KAFKA_BROKERS` | yes | — | `localhost:9092` |
| `KAFKA_CLIENT_ID` | no | `payment-service` | Kafka client id |
| `KAFKA_GROUP_ID` | no | `payment-service` | Consumer group |
| `STRIPE_GATEWAY` | no | `stripe` | `stripe` or `fake` |
| `STRIPE_SECRET_KEY` | when `stripe` | — | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | yes | — | Webhook signing secret (`whsec_...`) |

Local `.env` uses `STRIPE_GATEWAY=fake` and a test webhook secret. `.env.example` is
tracked; `.env` is gitignored.

Startup is fail-fast: missing required config, an unavailable Postgres, or an
unavailable Kafka broker prevents the HTTP server from listening. The Kafka client
uses a small retry budget so a missing broker surfaces as a startup error instead of
hanging forever. Consequently, `apps/payment-service-e2e` now requires
`docker compose up -d`; its global setup checks Postgres and Kafka and fails with a
clear message if they are missing. The unit test suite does not require infrastructure.

## 9. HTTP surface

- `GET /api` — existing hello endpoint.
- `GET /api/payments/:id` — read a payment by UUID; 404 if missing. Fields:
  `id`, `orderId`, `accountId`, `amountMinor`, `currency`, `status`, `methodType`,
  `providerReference`, `failureReason`, `createdAt`, `updatedAt`.
- `GET /api/payments/order/:orderId` — same response shape, looked up by the
  domain order id. This is what the verification script polls, because the payment
  UUID is generated inside the service. Declare this route before `:id` so
  `order` is not parsed as a UUID.
- `POST /api/webhooks/stripe` — Stripe webhook.

No gRPC server in this slice.

## 10. Failure handling summary

| Failure | Behavior |
|---|---|
| Invalid event schema (including negative amount) | Log, ack, no DB write |
| Amount = 0 / non-letter currency | Insert `FAILED` row, ack |
| Existing `FAILED` row on redelivery | No Stripe call, ack |
| Postgres unavailable | Throw; Kafka retries |
| Stripe retryable error | Throw; Kafka retries |
| Stripe non-retryable error | Mark `FAILED`, ack |
| Webhook bad signature | 400, no DB write |
| Webhook unknown payment | 500, transaction rolled back, Stripe retries |
| Duplicate webhook event | 200, no second update |
| Duplicate Kafka delivery | No second row, no second charge |

## 11. Testing

### Unit tests (always run)

- Event validation: valid envelope accepted; missing/invalid fields rejected.
- First delivery creates one row and calls Stripe once.
- Same event twice → one row, one Stripe call.
- Same order, different event id → one row, one Stripe call.
- Existing row without `provider_reference` → Stripe called again with the same
  idempotency key.
- Existing row with status `FAILED` → no Stripe call on redelivery.
- Zero amount → one `FAILED` row, no Stripe call, no throw.
- Invalid currency letters → one `FAILED` row, no Stripe call.
- Invalid event → no repository/gateway calls, no throw.
- Retryable Stripe error → throws.
- Non-retryable Stripe error → row marked `FAILED`, no throw.
- Webhook: valid success/failure/canceled updates; duplicate event id no-op;
  late failure cannot overwrite `CAPTURED`; a genuine success after `FAILED`
  becomes `CAPTURED`; unknown payment returns 500; bad signature returns 400;
  missing raw body returns 400.
- Fake gateway returns a deterministic id; real gateway passes the exact
  amount/currency/metadata/idempotency key to the SDK (mocked Stripe client).
- `GET /api/payments/order/:orderId` resolves the row and 404s when missing.

### Postgres integration tests (opt-in `PAYMENT_DB_TESTS=1`)

- `UNIQUE(order_id)` rejects a second insert.
- `insertIfAbsent` returns `null` on conflict.
- `stripe_webhook_events` primary key rejects duplicate events.
- Webhook transaction rolls back the event row when the payment is missing.

### Manual end-to-end (documented script)

1. `docker compose up -d`.
2. `nx serve payment-service` with `STRIPE_GATEWAY=fake`.
3. `node tools/verify-payment-flow.mjs`:
   - produces a valid `OrderCreated` to `order.created` keyed by `orderId`;
   - polls `GET /api/payments/order/:orderId` until `PENDING`;
   - sends a signed `payment_intent.succeeded` webhook;
   - polls until `CAPTURED`;
   - re-produces the same event and asserts the record did not change / no second
     intent.
4. Verify in Postgres that `payments` has one row for the order and
   `stripe_webhook_events` has one row for the event.

## 12. Security

- Webhook signature verification is mandatory; the raw body is never parsed before
  verification.
- Secrets come from env; `.env` is gitignored.
- Logs include ids and statuses, never keys, signatures, raw bodies, or card data.
- The fake gateway is opt-in and logs a warning at startup.

## 13. Decisions made (review these)

1. **Postgres + `pg` + startup DDL**, not an ORM. Least new machinery while giving a
   real unique constraint. Migration tooling is deferred.
2. **PaymentIntent**, not Checkout Session. Backend-owned flow; no UI in this slice.
3. **Automatic capture.** `succeeded` → `CAPTURED`; `AUTHORIZED` reserved for manual
   capture.
4. **Unique `order_id` as the idempotency gate.** Stronger than deduping by event id,
   and it survives redelivery with a new event id.
5. **NestJS Kafka transport**, not raw KafkaJS, for decorator-based consumption and
   lifecycle integration.
6. **One payment per order, forever.** Retrying a failed payment needs a new attempt
   model; not in this slice. `FAILED` is terminal for Kafka ingestion but not for a
   genuine Stripe success webhook.
7. **No payment events published to Kafka yet.** Follow-up once the order flow needs
   them.
8. **A fake Stripe adapter** for local tests/e2e, selectable only by explicit config.
9. **Zero-amount events produce a `FAILED` row** rather than being dropped, so the
   failure is auditable and duplicate deliveries are idempotent. The shared
   `moneySchema` is not changed.
10. **Both payment lookups are exposed over REST** (`:id` and `order/:orderId`)
    because the verification script cannot know the generated UUID.
11. **Fail-fast startup.** Infra must be up before the service serves HTTP;
    payment e2e requires `docker compose up -d`.

## 14. Known limitations / follow-ups

- Crash-after-Stripe + redelivery after Stripe's 24h idempotency window can create a
  second intent. Add reconciliation by `metadata.orderId`.
- Startup DDL is not a migration strategy.
- No DLQ; a permanently failing retryable error blocks its partition.
- No outbox for future payment events.
- No client secret / checkout UI.
- Order-service does not publish `OrderCreated` yet.
