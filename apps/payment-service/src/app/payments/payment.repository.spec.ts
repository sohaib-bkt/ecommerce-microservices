import { Pool } from 'pg';
import { PAYMENT_SCHEMA_SQL } from '../database/schema';
import { PaymentRepository } from './payment.repository';

const describeDb = process.env.PAYMENT_DB_TESTS === '1' ? describe : describe.skip;

describeDb('PaymentRepository', () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  beforeAll(async () => {
    await pool.query(PAYMENT_SCHEMA_SQL);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE payments, stripe_webhook_events RESTART IDENTITY;');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('creates one payment row per order and keeps the first payment id', async () => {
    const repo = new PaymentRepository(pool);

    const first = await repo.insertIfAbsent({
      id: '11111111-1111-4111-8111-111111111111',
      orderId: 'ord-1',
      accountId: 'acct-1',
      amountMinor: 1500,
      currency: 'USD',
      sourceEventId: 'evt-1',
    });

    const second = await repo.insertIfAbsent({
      id: '22222222-2222-4222-8222-222222222222',
      orderId: 'ord-1',
      accountId: 'acct-2',
      amountMinor: 2000,
      currency: 'USD',
      sourceEventId: 'evt-2',
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(first?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(await repo.findByOrderId('ord-1')).not.toBeNull();
  });

  it('applies a success webhook and ignores duplicate or stale failure events', async () => {
    const repo = new PaymentRepository(pool);

    const payment = await repo.insertIfAbsent({
      id: '33333333-3333-4333-8333-333333333333',
      orderId: 'ord-2',
      accountId: 'acct-2',
      amountMinor: 2500,
      currency: 'USD',
      sourceEventId: 'evt-3',
    });

    expect(payment).not.toBeNull();

    await repo.setProviderReference(payment!.id, 'pi_123');
    const firstApply = await repo.applyStripeEvent({
      eventId: 'evt_success_1',
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_123',
      nextStatus: 'CAPTURED',
    });
    expect(firstApply).toBe('applied');

    const duplicate = await repo.applyStripeEvent({
      eventId: 'evt_success_1',
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_123',
      nextStatus: 'FAILED',
    });
    expect(duplicate).toBe('duplicate');

    const staleFailure = await repo.applyStripeEvent({
      eventId: 'evt_failure_1',
      eventType: 'payment_intent.payment_failed',
      paymentIntentId: 'pi_123',
      nextStatus: 'FAILED',
    });
    expect(staleFailure).toBe('ignored');

    const current = await repo.findById(payment!.id);
    expect(current?.status).toBe('CAPTURED');
  });

  it('returns not_found when the payment intent is unknown and rolls back the dedupe row', async () => {
    const repo = new PaymentRepository(pool);

    const payment = await repo.insertIfAbsent({
      id: '44444444-4444-4444-8444-444444444444',
      orderId: 'ord-3',
      accountId: 'acct-3',
      amountMinor: 500,
      currency: 'USD',
      sourceEventId: 'evt-4',
    });

    await repo.setProviderReference(payment!.id, 'pi_abc');

    const result = await repo.applyStripeEvent({
      eventId: 'evt_unknown_1',
      eventType: 'payment_intent.succeeded',
      paymentIntentId: 'pi_missing',
      nextStatus: 'CAPTURED',
    });

    expect(result).toBe('not_found');
    const row = await pool.query('SELECT COUNT(*)::int AS count FROM stripe_webhook_events');
    expect(Number(row.rows[0].count)).toBe(0);
  });
});
