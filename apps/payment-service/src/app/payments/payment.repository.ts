import { Pool } from 'pg';
import type { PaymentStatus } from '@ecommerce-platform/contracts';
import type { CreatePaymentInput, PaymentRecord, StripeEventApplyResult, StripeEventUpdate } from './payment.types.js';

type PaymentRow = {
  id: string;
  order_id: string;
  account_id: string;
  amount_minor: number;
  currency: string;
  status: PaymentStatus;
  method_type: string;
  provider: string;
  provider_reference: string | null;
  failure_reason: string | null;
  source_event_id: string;
  created_at: Date;
  updated_at: Date;
};

const toPaymentRecord = (row: PaymentRow): PaymentRecord => ({
  id: row.id,
  orderId: row.order_id,
  accountId: row.account_id,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  status: row.status,
  methodType: row.method_type,
  provider: row.provider,
  providerReference: row.provider_reference,
  failureReason: row.failure_reason,
  sourceEventId: row.source_event_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PaymentRepository {
  constructor(private readonly pool: Pool) {}

  async insertIfAbsent(input: CreatePaymentInput): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>(
      `INSERT INTO payments (
        id,
        order_id,
        account_id,
        amount_minor,
        currency,
        status,
        method_type,
        provider,
        provider_reference,
        failure_reason,
        source_event_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 'CARD', 'stripe', NULL, NULL, $6, now(), now())
      ON CONFLICT (order_id) DO NOTHING
      RETURNING *`,
      [input.id, input.orderId, input.accountId, input.amountMinor, input.currency, input.sourceEventId],
    );

    return result.rowCount ? toPaymentRecord(result.rows[0]) : null;
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE id = $1', [id]);
    return result.rowCount ? toPaymentRecord(result.rows[0]) : null;
  }

  async findByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const result = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    return result.rowCount ? toPaymentRecord(result.rows[0]) : null;
  }

  async setProviderReference(paymentId: string, providerReference: string): Promise<void> {
    await this.pool.query(
      'UPDATE payments SET provider_reference = $1, updated_at = now() WHERE id = $2',
      [providerReference, paymentId],
    );
  }

  async updateStatus(
    paymentId: string,
    status: PaymentStatus,
    failureReason?: string | null,
  ): Promise<void> {
    await this.pool.query(
      'UPDATE payments SET status = $1, failure_reason = $2, updated_at = now() WHERE id = $3',
      [status, failureReason ?? null, paymentId],
    );
  }

  async applyStripeEvent(input: StripeEventUpdate): Promise<StripeEventApplyResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const dedupeResult = await client.query<{ event_id: string }>(
        'INSERT INTO stripe_webhook_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING RETURNING event_id',
        [input.eventId, input.eventType],
      );

      if (dedupeResult.rowCount === 0) {
        await client.query('COMMIT');
        return 'duplicate';
      }

      const paymentResult = await client.query<PaymentRow>(
        'SELECT * FROM payments WHERE provider_reference = $1',
        [input.paymentIntentId],
      );

      if (paymentResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return 'not_found';
      }

      const payment = toPaymentRecord(paymentResult.rows[0]);

      if (input.nextStatus === null) {
        await client.query('COMMIT');
        return 'ignored';
      }

      if (!this.shouldApplyStatus(payment.status, input.nextStatus)) {
        await client.query('COMMIT');
        return 'ignored';
      }

      await client.query(
        'UPDATE payments SET status = $1, failure_reason = $2, updated_at = now() WHERE id = $3',
        [input.nextStatus, input.failureReason ?? null, payment.id],
      );

      await client.query('COMMIT');
      return 'applied';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private shouldApplyStatus(current: PaymentStatus, next: PaymentStatus): boolean {
    if (current === 'CAPTURED' || current === 'REFUNDED') {
      return false;
    }

    if (next === 'CAPTURED') {
      return current === 'PENDING' || current === 'AUTHORIZED' || current === 'FAILED';
    }

    if (next === 'FAILED') {
      return current === 'PENDING' || current === 'AUTHORIZED' || current === 'FAILED';
    }

    return false;
  }
}
