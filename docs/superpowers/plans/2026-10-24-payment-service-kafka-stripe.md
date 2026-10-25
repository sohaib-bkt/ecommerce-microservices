# Payment Service Kafka + Stripe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume `order.created` in payment-service, create exactly one durable payment per order, create a Stripe PaymentIntent idempotently, and let a signed Stripe webhook drive the payment to its final status.

**Architecture:** payment-service becomes a Nest hybrid app: HTTP for the Stripe webhook and read endpoints, plus an `@nestjs/microservices` Kafka consumer. Postgres is the idempotency backbone: `payments.order_id` is unique, `payments.id` is the Stripe idempotency key, and `stripe_webhook_events.event_id` deduplicates webhook deliveries. A Stripe gateway port has a real SDK adapter and an explicit fake adapter for local verification.

**Tech Stack:** NestJS 11.2.7, `@nestjs/microservices` Kafka transport, KafkaJS 2.2.4, `@nestjs/config` 12.0.1, Postgres 16, `pg` 8.23.1, Stripe Node SDK 23.0.1, Jest + SWC, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-24-payment-service-kafka-stripe-design.md`

## Global Constraints

- Node 24.15.0, Nx 23.3.0. Always invoke Nx through `npx nx`.
- Topic is `order.created`. Event type is `OrderCreated`. Consumer group defaults to `payment-service`.
- Do not modify `libs/contracts`. Import the existing `orderCreatedSchema`, `parse`, `SchemaValidationError`, `OrderCreatedEvent` pieces from `@ecommerce-platform/contracts`.
- All money amounts are integer minor units (`Money.amount`), matching Stripe.
- Local development uses `STRIPE_GATEWAY=fake`. Never use a live Stripe key in this plan.
- `.env` is gitignored and already contains API-gateway values. Append payment values; never overwrite the file. `.env.example` is tracked.
- Startup is fail-fast: missing required config, Postgres unavailable, or Kafka unavailable must prevent the HTTP server from listening.
- The working tree is clean except for the uncommitted `docs/` directory. Each commit step stages only the paths it lists; do not sweep in unrelated files.
- Never log Stripe secrets, webhook signatures, raw webhook bodies, or card data. Log ids and statuses only.
- Normal unit suite (`npx nx test payment-service`) must not require Docker. Repository integration tests are opt-in via `PAYMENT_DB_TESTS=1`.

## Review Focus

1. **Partial-success redelivery:** a payment row exists with `provider_reference = NULL` (crash between Stripe and the DB write). A redelivery must call Stripe with the same idempotency key, never create a second PaymentIntent.
2. **Zero-amount / non-letter currency:** a zero amount passes the shared schema. It must produce one `FAILED` row and be acknowledged, never an insert error that blocks the partition forever.
3. **Duplicate and late webhooks:** the same Stripe event id must be a no-op; a late `payment_intent.payment_failed` must not overwrite `CAPTURED`; a genuine success after `FAILED` may move to `CAPTURED`.
4. **Invalid or missing webhook signature:** must return 400 before any DB write, including no `stripe_webhook_events` row.
5. **Webhook for an unknown PaymentIntent:** must return 500 and roll back the dedupe row so Stripe retries, rather than acknowledging and losing the event.

---

### Task 1: Local Postgres + Kafka, dependencies, and config

**Files:**
- Create: `docker-compose.yml`
- Modify: `apps/payment-service/package.json` (via `npm install`)
- Modify: `.env.example`
- Modify: `.env` (local only, ignored)
- Modify: `apps/payment-service/src/app/app.module.ts`

**Interfaces:**
- Produces: Postgres at `localhost:5432` (`ecommerce/ecommerce`, db `ecommerce`) and Kafka at `localhost:9092`.
- Produces: `ConfigModule` is global in `AppModule`.
- Produces: packages `kafkajs`, `pg`, `stripe`, `@nestjs/config`, `@nestjs/microservices` declared in `apps/payment-service/package.json`.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ecommerce
      POSTGRES_PASSWORD: ecommerce
      POSTGRES_DB: ecommerce
    ports:
      - "5432:5432"
    volumes:
      - payment-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ecommerce -d ecommerce"]
      interval: 5s
      timeout: 5s
      retries: 10

  kafka:
    image: apache/kafka:3.9.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    healthcheck:
      test: ["CMD-SHELL", "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 >/dev/null 2>&1"]
      interval: 10s
      timeout: 10s
      retries: 12

volumes:
  payment-postgres-data:
```

- [ ] **Step 2: Start infrastructure and verify health**

Run: `docker compose up -d`
Run: `docker compose ps`
Expected: both `postgres` and `kafka` show `healthy` within ~60s. If Kafka is not healthy, run `docker compose logs kafka` before continuing.

- [ ] **Step 3: Install dependencies into the payment-service workspace**

```bash
npm install -w @ecommerce-platform/payment-service \
  @nestjs/config@^12.0.1 \
  @nestjs/microservices@^11.2.7 \
  kafkajs@^2.2.4 \
  pg@^8.23.1 \
  stripe@^23.0.1

npm install -D -w @ecommerce-platform/payment-service @types/pg@^8.23.1
```

Expected: the five runtime packages appear in `apps/payment-service/package.json` dependencies and `@types/pg` in devDependencies.

- [ ] **Step 4: Append payment configuration to `.env.example` and `.env`**

Append:

```dotenv
# payment-service
DATABASE_URL=postgres://ecommerce:ecommerce@localhost:5432/ecommerce
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=payment-service
KAFKA_GROUP_ID=payment-service
STRIPE_GATEWAY=fake
# Required only when STRIPE_GATEWAY=stripe
# STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_secret
```

- [ ] **Step 5: Make config global in `apps/payment-service/src/app/app.module.ts`**

```ts
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 6: Verify the app still builds**

Run: `npx nx build payment-service`
Expected: success. The app does not use the new packages yet.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example package.json apps/payment-service/package.json package-lock.json \
  apps/payment-service/src/app/app.module.ts \
  docs/superpowers/specs/2026-10-24-payment-service-kafka-stripe-design.md \
  docs/superpowers/plans/2026-10-24-payment-service-kafka-stripe.md
git commit -m "chore(payment): add Postgres/Kafka dev stack and config"
```

---

### Task 2: Database module, schema, and payment repository

**Files:**
- Create: `apps/payment-service/src/app/database/database.tokens.ts`
- Create: `apps/payment-service/src/app/database/schema.ts`
- Create: `apps/payment-service/src/app/database/database.service.ts`
- Create: `apps/payment-service/src/app/database/database.module.ts`
- Create: `apps/payment-service/src/app/payments/payment.types.ts`
- Create: `apps/payment-service/src/app/payments/payment.repository.ts`
- Test: `apps/payment-service/src/app/payments/payment.repository.spec.ts`

**Interfaces:**
- Consumes: `DATABASE_URL` from `ConfigService`.
- Produces: `PG_POOL` token (`symbol`) providing a `pg.Pool`.
- Produces: `PAYMENT_SCHEMA_SQL: string`.
- Produces:

```ts
import type {
  EventEnvelope,
  OrderCreatedPayload,
  PaymentStatus,
} from '@ecommerce-platform/contracts';

export type OrderCreatedEvent = EventEnvelope<'OrderCreated', OrderCreatedPayload>;

export interface PaymentRecord {
  id: string;
  orderId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  methodType: string;
  provider: string;
  providerReference: string | null;
  failureReason: string | null;
  sourceEventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentInput {
  id: string;
  orderId: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  sourceEventId: string;
}

export interface StripeEventUpdate {
  eventId: string;
  eventType: string;
  paymentIntentId: string;
  nextStatus: PaymentStatus | null;
  failureReason?: string;
}

export type StripeEventApplyResult =
  | 'applied' | 'duplicate' | 'ignored' | 'not_found';

export class PaymentRepository {
  constructor(pool: Pool);
  insertIfAbsent(input: CreatePaymentInput): Promise<PaymentRecord | null>;
  findById(id: string): Promise<PaymentRecord | null>;
  findByOrderId(orderId: string): Promise<PaymentRecord | null>;
  setProviderReference(paymentId: string, providerReference: string): Promise<void>;
  updateStatus(paymentId: string, status: PaymentStatus, failureReason?: string | null): Promise<void>;
  applyStripeEvent(input: StripeEventUpdate): Promise<StripeEventApplyResult>;
}
```

- [ ] **Step 1: Write the failing integration test**

Create `payment.repository.spec.ts`. Gate it:

```ts
const describeDb = process.env.PAYMENT_DB_TESTS === '1' ? describe : describe.skip;

describeDb('PaymentRepository', () => {
  // new Pool({ connectionString: process.env.DATABASE_URL })
  // beforeAll: pool.query(PAYMENT_SCHEMA_SQL)
  // beforeEach: TRUNCATE payments, stripe_webhook_events
  // afterAll: pool.end()
});
```

Test cases and assertions:

1. `insertIfAbsent` returns a `PENDING` row; a second insert with the same `orderId` and a different `id` returns `null`; `findByOrderId` returns the first id.
2. After `setProviderReference(id, 'pi_1')` and an `applyStripeEvent` with event `evt_1`, status `CAPTURED`, payment intent `pi_1`: result is `'applied'`, status is `CAPTURED`.
3. Repeating the same event id with `FAILED` returns `'duplicate'` and status stays `CAPTURED`.
4. A new event id with `FAILED` against the captured payment returns `'ignored'` and status stays `CAPTURED`.
5. A new event id with `CAPTURED` against a `FAILED` payment returns `'applied'` and status becomes `CAPTURED`.
6. An event for `pi_missing` returns `'not_found'`; `SELECT count(*) FROM stripe_webhook_events` is `0` (the dedupe insert rolled back).
7. An event with `nextStatus: null` returns `'ignored'` and records the event id.

- [ ] **Step 2: Run the test and verify it fails**

Run:
```bash
PAYMENT_DB_TESTS=1 \
DATABASE_URL=postgres://ecommerce:ecommerce@localhost:5432/ecommerce \
npx nx test payment-service --testPathPattern=payment.repository.spec.ts
```
Expected: FAIL because `payment.repository` and `schema` do not exist.

- [ ] **Step 3: Implement the schema**

`apps/payment-service/src/app/database/schema.ts`:

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

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_idx
  ON payments (provider_reference) WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Implement the database module**

`database.tokens.ts` exports `export const PG_POOL = Symbol('PG_POOL');`.

`database.service.ts`:

```ts
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
  async onModuleInit(): Promise<void> { await this.pool.query(PAYMENT_SCHEMA_SQL); }
  async onModuleDestroy(): Promise<void> { await this.pool.end(); }
}
```

`database.module.ts` is `@Global()`, imports `ConfigModule`, provides `PG_POOL` with `new Pool({ connectionString: config.getOrThrow('DATABASE_URL') })`, provides `DatabaseService`, and exports `PG_POOL`.

- [ ] **Step 5: Implement `PaymentRepository`**

Use `INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING *` for `insertIfAbsent`. Map snake_case columns to the `PaymentRecord` shape and `Number(row.amount_minor)`.

`applyStripeEvent` must use a single client and transaction:

1. `BEGIN`.
2. `INSERT INTO stripe_webhook_events ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id`. No row → `COMMIT`, return `'duplicate'`.
3. `nextStatus === null` → `COMMIT`, return `'ignored'`.
4. `UPDATE payments SET status = $1, failure_reason = $2, updated_at = now() WHERE provider_reference = $3 AND status NOT IN ('CAPTURED','REFUNDED') RETURNING id`.
5. Updated row → `COMMIT`, return `'applied'`.
6. No updated row → `SELECT 1 FROM payments WHERE provider_reference = $3`. Exists → `COMMIT`, return `'ignored'` (absorbing status). Missing → `ROLLBACK`, return `'not_found'`.
7. Any thrown error → `ROLLBACK`, rethrow; always release the client.

- [ ] **Step 6: Run the integration test and verify it passes**

Run the same command as Step 2. Expected: all 7 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/payment-service/src/app/database \
  apps/payment-service/src/app/payments/payment.types.ts \
  apps/payment-service/src/app/payments/payment.repository.ts \
  apps/payment-service/src/app/payments/payment.repository.spec.ts
git commit -m "feat(payment): add Postgres payment repository with idempotency guards"
```

---

### Task 3: Stripe gateway port and adapters

**Files:**
- Modify: `apps/payment-service/tsconfig.app.json` (add `"esModuleInterop": true`)
- Modify: `apps/payment-service/tsconfig.spec.json` (add `"esModuleInterop": true`)
- Create: `apps/payment-service/src/app/payments/stripe/stripe.gateway.ts`
- Create: `apps/payment-service/src/app/payments/stripe/stripe-sdk.gateway.ts`
- Create: `apps/payment-service/src/app/payments/stripe/fake-stripe.gateway.ts`
- Create: `apps/payment-service/src/app/payments/stripe/stripe.module.ts`
- Test: `apps/payment-service/src/app/payments/stripe/stripe-sdk.gateway.spec.ts`
- Test: `apps/payment-service/src/app/payments/stripe/fake-stripe.gateway.spec.ts`

**Interfaces:**
- Produces tokens: `STRIPE_CLIENT` (a `Stripe` instance) and `STRIPE_GATEWAY`.
- Produces:

```ts
export interface CreatePaymentIntentInput {
  amountMinor: number;
  currency: string;
  paymentId: string;
  orderId: string;
  eventId: string;
  idempotencyKey: string;
}

export interface PaymentIntentResult { id: string; status: string; }

export interface StripeGateway {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
}

export class StripeGatewayError extends Error {
  constructor(message: string, readonly retryable: boolean);
}
```

- [ ] **Step 1: Write the failing SDK adapter test**

Inject a fake Stripe client shaped as `{ paymentIntents: { create: jest.fn() } }`.

Assertions:

1. A successful call returns `{ id: 'pi_123', status: 'requires_payment_method' }` and calls `paymentIntents.create` with:
   `amount: 1999`, `currency: 'usd'`, `automatic_payment_methods: { enabled: true }`, metadata `{ paymentId: 'pay_1', orderId: 'order_1', eventId: 'evt_1' }`, and request options `{ idempotencyKey: 'pay_1' }`.
2. Rejection with `{ type: 'StripeConnectionError', message: 'down' }` throws `StripeGatewayError` with `retryable === true`.
3. Rejection with `{ type: 'StripeRateLimitError', message: 'slow down' }` throws `StripeGatewayError` with `retryable === true`.
4. Rejection with `{ type: 'StripeInvalidRequestError', message: 'bad amount' }` throws `StripeGatewayError` with `retryable === false`.
5. Rejection with `{ type: 'StripeAuthenticationError', message: 'bad key' }` throws `StripeGatewayError` with `retryable === false`.

- [ ] **Step 2: Write the failing fake adapter test**

Assert `FakeStripeGateway.createPaymentIntent({ paymentId: 'pay_1', ... })` resolves to `{ id: 'pi_fake_pay_1', status: 'requires_payment_method' }`.

- [ ] **Step 3: Run both tests and verify they fail**

Run: `npx nx test payment-service --testPathPattern=stripe.*gateway.spec.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the gateway types and adapters**

`stripe.gateway.ts` contains the interfaces, tokens, and `StripeGatewayError`.

`stripe-sdk.gateway.ts`:

```ts
@Injectable()
export class StripeSdkGateway implements StripeGateway {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    // stripe.paymentIntents.create({ amount, currency: input.currency.toLowerCase(),
    //   automatic_payment_methods: { enabled: true },
    //   metadata: { paymentId, orderId, eventId } },
    //   { idempotencyKey: input.idempotencyKey })
  }
}
```

Export `toStripeGatewayError(error: unknown): StripeGatewayError`. Map `StripeConnectionError`, `StripeAPIError`, and `StripeRateLimitError` to `retryable: true`; map `StripeAuthenticationError`, `StripePermissionError`, `StripeInvalidRequestError`, and `StripeIdempotencyError` to `retryable: false`; unknown errors default to `retryable: true`. Identify Stripe errors by the `type` string so tests can pass plain objects.

`fake-stripe.gateway.ts` returns `pi_fake_${input.paymentId}`.

`stripe.module.ts`:

```ts
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Stripe(
          (config.get<string>('STRIPE_GATEWAY') ?? 'stripe') === 'fake'
            ? 'sk_test_fake'
            : config.getOrThrow<string>('STRIPE_SECRET_KEY'),
        ),
    },
    {
      provide: STRIPE_GATEWAY,
      inject: [ConfigService, STRIPE_CLIENT],
      useFactory: (config: ConfigService, client: Stripe) => {
        if ((config.get<string>('STRIPE_GATEWAY') ?? 'stripe') === 'fake') {
          new Logger('StripeGateway').warn(
            'Using FakeStripeGateway: no real Stripe charges will be created',
          );
          return new FakeStripeGateway();
        }
        return new StripeSdkGateway(client);
      },
    },
  ],
  exports: [STRIPE_CLIENT, STRIPE_GATEWAY],
})
export class StripeModule {}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx nx test payment-service --testPathPattern=stripe.*gateway.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/payment-service/tsconfig.app.json apps/payment-service/tsconfig.spec.json \
  apps/payment-service/src/app/payments/stripe
git commit -m "feat(payment): add Stripe gateway port with SDK and fake adapters"
```

---

### Task 4: OrderCreated ingestion, PaymentsService, and Kafka bootstrap

**Files:**
- Create: `apps/payment-service/src/app/payments/payments.service.ts`
- Create: `apps/payment-service/src/app/payments/order-created.consumer.ts`
- Create: `apps/payment-service/src/app/payments/payments.module.ts`
- Modify: `apps/payment-service/src/app/app.module.ts` (import `PaymentsModule`)
- Modify: `apps/payment-service/src/main.ts` (raw body, Kafka microservice, shutdown hooks)
- Test: `apps/payment-service/src/app/payments/payments.service.spec.ts`
- Test: `apps/payment-service/src/app/payments/order-created.consumer.spec.ts`

**Interfaces:**
- Consumes: `PaymentRepository`, `STRIPE_GATEWAY`, `StripeGatewayError`, and `OrderCreatedEvent` from `./payment.types`.
- Produces: `PaymentsService.handleOrderCreated(event: OrderCreatedEvent): Promise<void>`.
- Produces: `ORDER_CREATED_TOPIC = 'order.created'`.

- [ ] **Step 1: Write the failing `PaymentsService` tests**

Use a fake repository with jest mocks and a fake gateway. Cases:

1. **First delivery:** `findByOrderId` returns `null`; `insertIfAbsent` returns a PENDING record with id `pay_1`. Assert one `createPaymentIntent` call with `paymentId: 'pay_1'`, `idempotencyKey: 'pay_1'`, amount/currency/order/event from the envelope, and `setProviderReference('pay_1', 'pi_1')`.
2. **Duplicate with provider reference:** `findByOrderId` returns `{ ...record, providerReference: 'pi_1', status: 'CAPTURED' }`. Assert no `insertIfAbsent`, no Stripe call.
3. **Partial success:** existing record has `providerReference: null`, `status: 'PENDING'`. Assert Stripe is called with the **same** `idempotencyKey` as the existing record id.
4. **Existing FAILED:** existing record has `providerReference: null`, `status: 'FAILED'`. Assert no Stripe call.
5. **Zero amount:** `insertIfAbsent` returns a PENDING record with `amountMinor: 0`. Assert `updateStatus(record.id, 'FAILED', expect.any(String))`, no Stripe call, and the promise resolves.
6. **Non-letter currency:** record has `currency: '12$'`. Same expected behavior as zero amount.
7. **Retryable Stripe error:** gateway rejects `new StripeGatewayError('down', true)`. Assert `handleOrderCreated` rejects and `setProviderReference` is not called.
8. **Non-retryable Stripe error:** gateway rejects `new StripeGatewayError('bad request', false)`. Assert `updateStatus(record.id, 'FAILED', 'bad request')` and the promise resolves.

- [ ] **Step 2: Write the failing consumer tests**

1. A malformed payload (`{ type: 'OrderCreated' }` missing required envelope/payload fields) does not throw and does not call `handleOrderCreated`.
2. A valid `OrderCreated` envelope calls `handleOrderCreated` once with the parsed event.
3. A `StripeGatewayError('down', true)` rejection from `handleOrderCreated` propagates (so Kafka retries).

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx nx test payment-service --testPathPattern='(payments.service|order-created.consumer).spec.ts'`
Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement `PaymentsService`**

The algorithm:

1. `findByOrderId(payload.orderId)`.
2. If found: return if `providerReference` is set; return if `status === 'FAILED'`; otherwise continue to payment start.
3. If not found: `insertIfAbsent({ id: randomUUID(), orderId, accountId, amountMinor: total.amount, currency: total.currency.toUpperCase(), sourceEventId: event.id })`.
4. If the insert returns `null` (concurrent delivery), re-read by order id and follow the found-row rule; if the re-read is still null, return.
5. Validate `amountMinor > 0` and `/^[A-Z]{3}$/i.test(currency)`. On failure: `updateStatus(id, 'FAILED', 'Invalid amount or currency')` and return.
6. Call `stripe.createPaymentIntent({ amountMinor, currency: currency.toLowerCase(), paymentId: id, orderId, eventId: event.id, idempotencyKey: id })`.
7. `setProviderReference(id, intent.id)`.
8. Catch `StripeGatewayError`: non-retryable → `updateStatus(id, 'FAILED', error.message)` and return; retryable → rethrow. Unknown errors → rethrow.

- [ ] **Step 5: Implement the consumer**

```ts
export const ORDER_CREATED_TOPIC = 'order.created';

@Controller()
export class OrderCreatedConsumer {
  private readonly logger = new Logger(OrderCreatedConsumer.name);
  constructor(private readonly payments: PaymentsService) {}

  @EventPattern(ORDER_CREATED_TOPIC)
  async handle(@Payload() data: unknown): Promise<void> {
    try {
      const event = parse<OrderCreatedEvent>(data, orderCreatedSchema);
      await this.payments.handleOrderCreated(event);
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        this.logger.error(`Dropping invalid OrderCreated event: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}
```

- [ ] **Step 6: Wire `PaymentsModule` and `AppModule`**

`PaymentsModule` imports `DatabaseModule` and `StripeModule`, declares `OrderCreatedConsumer`, provides `PaymentRepository` and `PaymentsService`, and exports `PaymentsService`.

`AppModule` imports `ConfigModule.forRoot({ isGlobal: true })` and `PaymentsModule`.

- [ ] **Step 7: Implement Kafka bootstrap in `main.ts`**

```ts
const app = await NestFactory.create(AppModule, { rawBody: true });
app.setGlobalPrefix('api');
app.enableShutdownHooks();

const config = app.get(ConfigService);
app.connectMicroservice<MicroserviceOptions>({
  transport: Transport.KAFKA,
  options: {
    client: {
      clientId: config.get<string>('KAFKA_CLIENT_ID') ?? 'payment-service',
      brokers: config.getOrThrow<string>('KAFKA_BROKERS').split(',').map((b) => b.trim()).filter(Boolean),
      retry: { retries: 5 },
    },
    consumer: {
      groupId: config.get<string>('KAFKA_GROUP_ID') ?? 'payment-service',
      retry: { retries: 5 },
    },
  },
});

await app.startAllMicroservices();
await app.listen(process.env.PORT || 3004);
```

Keep the existing startup log. `rawBody: true` is required by Task 5.

- [ ] **Step 8: Run the unit tests and build**

Run: `npx nx test payment-service`
Expected: PASS, including the repository spec being skipped (no `PAYMENT_DB_TESTS`).
Run: `npx nx build payment-service`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add apps/payment-service/src/main.ts \
  apps/payment-service/src/app/app.module.ts \
  apps/payment-service/src/app/payments/payments.service.ts \
  apps/payment-service/src/app/payments/payments.service.spec.ts \
  apps/payment-service/src/app/payments/order-created.consumer.ts \
  apps/payment-service/src/app/payments/order-created.consumer.spec.ts \
  apps/payment-service/src/app/payments/payments.module.ts
git commit -m "feat(payment): consume order.created and start Stripe payments idempotently"
```

---

### Task 5: Stripe webhook verification and status updates

**Files:**
- Create: `apps/payment-service/src/app/payments/stripe/stripe-webhook.verifier.ts`
- Create: `apps/payment-service/src/app/payments/stripe-webhook.service.ts`
- Create: `apps/payment-service/src/app/payments/stripe-webhook.controller.ts`
- Modify: `apps/payment-service/src/app/payments/stripe/stripe.module.ts` (provide/export verifier)
- Modify: `apps/payment-service/src/app/payments/payments.module.ts` (controller + service)
- Test: `apps/payment-service/src/app/payments/stripe/stripe-webhook.verifier.spec.ts`
- Test: `apps/payment-service/src/app/payments/stripe-webhook.service.spec.ts`
- Test: `apps/payment-service/src/app/payments/stripe-webhook.controller.spec.ts`

**Interfaces:**
- Produces: `StripeWebhookVerifier.verify(payload: Buffer, signature: string): Stripe.Event`.
- Produces: `StripeWebhookService.handle(event: Stripe.Event): Promise<StripeEventApplyResult>`.
- Produces: `POST /api/webhooks/stripe`.

- [ ] **Step 1: Write the failing verifier test**

Use `new Stripe('sk_test_fake')` and a config stub returning `'whsec_test'`.

1. `const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', object: 'payment_intent' } } });`
2. `const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });`
3. `verify(Buffer.from(payload), signature)` returns an event with id `evt_1`.
4. `verify(Buffer.from(payload), 'bad')` throws.
5. `verify(Buffer.from(payload + 'x'), signature)` throws.

- [ ] **Step 2: Write the failing webhook service test**

Use a fake repository. Cases:

1. `payment_intent.succeeded` → `applyStripeEvent({ eventId, eventType, paymentIntentId: 'pi_1', nextStatus: 'CAPTURED' })`.
2. `payment_intent.payment_failed` with `last_payment_error.message = 'card declined'` → `FAILED`, failure reason `'card declined'`.
3. `payment_intent.canceled` → `FAILED`, failure reason `'PaymentIntent canceled'`.
4. `charge.refunded` → `nextStatus: null` (record the event id, no status update).

- [ ] **Step 3: Write the failing controller test**

Call the controller method directly with `{ rawBody: Buffer.from(payload) }`.

1. Missing `rawBody` → rejects with `BadRequestException`; service not called.
2. Verifier throws → rejects with `BadRequestException`; service not called.
3. Valid signature and service result `'applied'` → resolves `{ received: true }`.
4. Service result `'duplicate'` → resolves `{ received: true }`.
5. Service result `'not_found'` → rejects with `InternalServerErrorException`.

- [ ] **Step 4: Run the tests and verify they fail**

Run: `npx nx test payment-service --testPathPattern='stripe-webhook.*spec.ts'`
Expected: FAIL because the modules do not exist.

- [ ] **Step 5: Implement the verifier**

```ts
@Injectable()
export class StripeWebhookVerifier {
  private readonly secret: string;
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }
  verify(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, this.secret);
  }
}
```

Register it in `StripeModule` providers and exports.

- [ ] **Step 6: Implement the webhook service**

Map the three supported event types; everything else passes `nextStatus: null`. Use `event.data.object.id` as `paymentIntentId` for supported events. Return the repository result unchanged.

- [ ] **Step 7: Implement the controller**

```ts
export interface StripeWebhookRequest { rawBody?: Buffer; }

@Controller('webhooks')
export class StripeWebhookController {
  constructor(
    private readonly verifier: StripeWebhookVerifier,
    private readonly webhooks: StripeWebhookService,
  ) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: StripeWebhookRequest,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    // missing raw body -> BadRequestException
    // verifier.verify in try/catch -> BadRequestException('Invalid Stripe signature')
    // not_found -> InternalServerErrorException
    // otherwise { received: true }
  }
}
```

Register `StripeWebhookController` and `StripeWebhookService` in `PaymentsModule`.

- [ ] **Step 8: Run the tests and build**

Run: `npx nx test payment-service --testPathPattern='stripe-webhook.*spec.ts'`
Expected: PASS.
Run: `npx nx build payment-service`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add apps/payment-service/src/app/payments/stripe/stripe-webhook.verifier.ts \
  apps/payment-service/src/app/payments/stripe/stripe-webhook.verifier.spec.ts \
  apps/payment-service/src/app/payments/stripe/stripe.module.ts \
  apps/payment-service/src/app/payments/stripe-webhook.service.ts \
  apps/payment-service/src/app/payments/stripe-webhook.service.spec.ts \
  apps/payment-service/src/app/payments/stripe-webhook.controller.ts \
  apps/payment-service/src/app/payments/stripe-webhook.controller.spec.ts \
  apps/payment-service/src/app/payments/payments.module.ts
git commit -m "feat(payment): confirm Stripe payments via signed webhooks"
```

---

### Task 6: Payment read endpoints, e2e setup, and verification script

**Files:**
- Create: `apps/payment-service/src/app/payments/payments.controller.ts`
- Create: `apps/payment-service/src/app/payments/payments.controller.spec.ts`
- Modify: `apps/payment-service/src/app/payments/payments.module.ts` (controller)
- Create: `tools/verify-payment-flow.mjs`
- Modify: `apps/payment-service-e2e/src/support/global-setup.ts`

**Interfaces:**
- Produces: `GET /api/payments/order/:orderId` and `GET /api/payments/:id`.
- Produces response shape:

```ts
{
  id: string; orderId: string; accountId: string;
  amountMinor: number; currency: string; status: PaymentStatus;
  methodType: string; providerReference: string | null;
  failureReason: string | null;
  createdAt: string; updatedAt: string;
}
```

- [ ] **Step 1: Write the failing controller test**

1. `findById` returns a record → response has the record's fields and ISO date strings.
2. `findById` returns `null` → rejects with `NotFoundException`.
3. `findByOrderId` returns a record → response matches.
4. `findByOrderId` returns `null` → rejects with `NotFoundException`.

- [ ] **Step 2: Run it and verify it fails**

Run: `npx nx test payment-service --testPathPattern=payments.controller.spec.ts`
Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Declare `@Get('order/:orderId')` **before** `@Get(':id')`. Use `ParseUUIDPipe` on `:id`. Map `PaymentRecord` to the response shape; convert dates with `.toISOString()`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx nx test payment-service --testPathPattern=payments.controller.spec.ts`
Expected: PASS.

- [ ] **Step 5: Update the payment e2e global setup**

Before waiting for port 3004, check Postgres (5432) and Kafka (9092) with `waitForPortOpen(port, { host, retries: 2, retryDelay: 250 })` inside `try/catch`. On failure, throw:

```text
Postgres/Kafka is not reachable. Run `docker compose up -d` before the payment e2e suite.
```

Then wait for the app port as before.

- [ ] **Step 6: Write `tools/verify-payment-flow.mjs`**

Run it as `node --env-file=.env tools/verify-payment-flow.mjs`. It reads `PAYMENT_BASE_URL` (default `http://localhost:3004`), `KAFKA_BROKERS`, `STRIPE_WEBHOOK_SECRET`, and `DATABASE_URL`.

Use default imports for the CommonJS packages: `import kafkaJs from 'kafkajs'; const { Kafka } = kafkaJs;` and `import pg from 'pg'; const { Pool } = pg;`. Import `Stripe` as a default import.

Sequence:

1. `GET /api` must return 200.
2. Build an `OrderCreated` envelope with a fresh `randomUUID()` event id, `source: 'verify-payment-flow'`, `version: 1`, a unique `orderId`, one item, and `total: { currency: 'USD', amount: 1999 }`.
3. Produce it to `order.created` with `key: orderId` using KafkaJS, then disconnect the producer.
4. Poll `GET /api/payments/order/:orderId` every 500 ms for up to 30 s until the response is `PENDING`. Assert `providerReference` starts with `pi_fake_`.
5. Build a `payment_intent.succeeded` event referencing that `providerReference`; sign the exact JSON body with `new Stripe('sk_test_fake').webhooks.generateTestHeaderString({ payload, secret: STRIPE_WEBHOOK_SECRET })`; POST it to `/api/webhooks/stripe` with the `stripe-signature` header.
6. Poll until status is `CAPTURED`.
7. Re-produce the **same** envelope (same event id) and wait 2 s. Re-fetch and assert the `providerReference` and `CAPTURED` status did not change.
8. With `pg`, assert `payments` has exactly 1 row for the order and `stripe_webhook_events` has exactly 1 row for the webhook event id.
9. Print `PASS` and exit 0; on any failure print the failing step and exit 1.

- [ ] **Step 7: Run the manual end-to-end verification**

```bash
docker compose up -d
npx nx serve payment-service
# in a second shell:
node --env-file=.env tools/verify-payment-flow.mjs
```

Expected: the script prints each step and finishes with `PASS`. If it stalls, check `docker compose ps`, the payment-service log, and that `STRIPE_GATEWAY=fake` is set.

- [ ] **Step 8: Commit**

```bash
git add apps/payment-service/src/app/payments/payments.controller.ts \
  apps/payment-service/src/app/payments/payments.controller.spec.ts \
  apps/payment-service/src/app/payments/payments.module.ts \
  tools/verify-payment-flow.mjs \
  apps/payment-service-e2e/src/support/global-setup.ts
git commit -m "feat(payment): expose payment lookups and add end-to-end verifier"
```

---

### Task 7: Documentation and full verification

**Files:**
- Create: `apps/payment-service/README.md`
- Modify: `docs/superpowers/specs/2026-10-24-payment-service-kafka-stripe-design.md` only if an implementation detail changed (record it under "Decisions").

**Interfaces:**
- Produces: runbook for local development, webhook testing, and switching to real Stripe.

- [ ] **Step 1: Write the payment-service README**

Include:

- Architecture in one paragraph.
- `docker compose up -d` and required env vars.
- `npx nx serve payment-service`.
- The two REST endpoints and the webhook endpoint.
- The manual verification command.
- How to switch from `STRIPE_GATEWAY=fake` to real Stripe test keys:
  `STRIPE_GATEWAY=stripe`, `STRIPE_SECRET_KEY=sk_test_...`, and
  `stripe listen --forward-to localhost:3004/api/webhooks/stripe` for the webhook secret.
- Known limitations from the design: one payment per order, 24h Stripe idempotency window,
  startup DDL, no DLQ, no payment events published yet.

- [ ] **Step 2: Run the complete unit/build/lint suite**

```bash
npx nx run-many -t build test lint --skip-nx-cache
npx nx typecheck payment-service --skip-nx-cache
```

Expected: all projects pass. The repository integration spec is skipped unless
`PAYMENT_DB_TESTS=1`.

- [ ] **Step 3: Run the repository integration tests**

```bash
PAYMENT_DB_TESTS=1 \
DATABASE_URL=postgres://ecommerce:ecommerce@localhost:5432/ecommerce \
npx nx test payment-service --testPathPattern=payment.repository.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Re-run the manual end-to-end verification from a clean database**

```bash
docker compose down -v
docker compose up -d
npx nx serve payment-service
# second shell:
node --env-file=.env tools/verify-payment-flow.mjs
```

Expected: `PASS`.

- [ ] **Step 5: Run the payment-service e2e suite**

Stop the manual `nx serve` process from Step 4, then run:

```bash
npx nx run payment-service-e2e:e2e --skip-nx-cache
```

Expected: 1 suite passed, 1 test passed. The target starts its own payment-service
instance; Postgres and Kafka must still be up.

- [ ] **Step 6: Confirm no unrelated files are staged**

Run: `git status --short`
Expected: only the files listed in this plan plus `docs/`. Do not stage unrelated files.

- [ ] **Step 7: Commit**

```bash
git add apps/payment-service/README.md
git commit -m "docs(payment): document Kafka/Stripe flow and local verification"
```
