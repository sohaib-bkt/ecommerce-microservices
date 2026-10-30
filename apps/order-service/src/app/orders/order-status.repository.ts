import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.tokens.js';
import type { OrderStatus, OrderStatusSnapshot } from './order-status.service.js';

type Row = {
  order_id: string;
  status: OrderStatus;
  payment_id: string | null;
  provider_reference: string | null;
  amount_minor: string | null;
  currency: string | null;
  reason: string | null;
};

const toSnapshot = (row: Row): OrderStatusSnapshot => ({
  orderId: row.order_id,
  status: row.status,
  paymentId: row.payment_id ?? undefined,
  providerReference: row.provider_reference ?? undefined,
  amount:
    row.amount_minor != null && row.currency
      ? { amount: Number(row.amount_minor), currency: row.currency }
      : undefined,
  reason: row.reason ?? undefined,
});

@Injectable()
export class OrderStatusRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getByOrderId(orderId: string): Promise<OrderStatusSnapshot | undefined> {
    const result = await this.pool.query<Row>(
      'SELECT * FROM order_statuses WHERE order_id = $1',
      [orderId],
    );
    return result.rowCount ? toSnapshot(result.rows[0]) : undefined;
  }

  async applyPaymentCaptured(
    orderId: string,
    payload: {
      paymentId: string;
      providerReference: string;
      amount: { amount: number; currency: string };
    },
  ): Promise<OrderStatusSnapshot> {
    const current = await this.getByOrderId(orderId);
    if (current?.status === 'PAID') {
      return current;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<Row>(
        `INSERT INTO order_statuses (order_id, status, payment_id, provider_reference, amount_minor, currency, updated_at)
         VALUES ($1, 'PAID', $2, $3, $4, $5, now())
         ON CONFLICT (order_id) DO UPDATE SET
           status = 'PAID',
           payment_id = EXCLUDED.payment_id,
           provider_reference = EXCLUDED.provider_reference,
           amount_minor = EXCLUDED.amount_minor,
           currency = EXCLUDED.currency,
           updated_at = now()
         RETURNING *`,
        [orderId, payload.paymentId, payload.providerReference, payload.amount.amount, payload.amount.currency],
      );
      await client.query(
        `UPDATE orders SET status = 'PAID', payment_id = $2, updated_at = now() WHERE id = $1`,
        [orderId, payload.paymentId],
      );
      await client.query('COMMIT');
      return toSnapshot(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyPaymentFailed(
    orderId: string,
    payload: {
      paymentId: string;
      reason: string;
      retryable: boolean;
      amount: { amount: number; currency: string };
    },
  ): Promise<OrderStatusSnapshot> {
    const current = await this.getByOrderId(orderId);
    if (current?.status === 'PENDING' && current.paymentId === payload.paymentId) {
      return current;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<Row>(
        `INSERT INTO order_statuses (order_id, status, payment_id, amount_minor, currency, reason, updated_at)
         VALUES ($1, 'PENDING', $2, $3, $4, $5, now())
         ON CONFLICT (order_id) DO UPDATE SET
           status = 'PENDING',
           payment_id = EXCLUDED.payment_id,
           amount_minor = EXCLUDED.amount_minor,
           currency = EXCLUDED.currency,
           reason = EXCLUDED.reason,
           updated_at = now()
         RETURNING *`,
        [orderId, payload.paymentId, payload.amount.amount, payload.amount.currency, payload.reason],
      );
      await client.query(
        `UPDATE orders SET status = 'PENDING', payment_id = $2, updated_at = now() WHERE id = $1`,
        [orderId, payload.paymentId],
      );
      await client.query('COMMIT');
      return toSnapshot(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async isAlreadyProcessed(orderId: string, status: OrderStatus, paymentId?: string): Promise<boolean> {
    const current = await this.getByOrderId(orderId);
    return current?.status === status && (paymentId === undefined || current.paymentId === paymentId);
  }
}