import { Inject, Injectable } from '@nestjs/common';
import type { EventEnvelope, OrderCreatedPayload, ecommerce } from '@ecommerce-platform/contracts';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.tokens.js';
import { ORDER_CREATED_TOPIC } from './order-event.constants.js';

type Order = ecommerce.order.v1.Order;

export interface PendingOrderEvent {
  eventId: string;
  topic: string;
  orderId: string;
  payload: EventEnvelope<'OrderCreated', OrderCreatedPayload>;
}

@Injectable()
export class OrderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createWithOutbox(
    order: Order,
    event: EventEnvelope<'OrderCreated', OrderCreatedPayload>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO orders (
          id, account_id, status, items, total_minor, currency,
          shipping_address, payment_id, created_at, updated_at
        ) VALUES ($1, $2, 'PENDING', $3::jsonb, $4, $5, $6::jsonb, NULL, now(), now())`,
        [
          order.id,
          order.accountId,
          JSON.stringify(order.items),
          order.total?.amount ?? 0,
          order.currency,
          order.shippingAddress ? JSON.stringify(order.shippingAddress) : null,
        ],
      );
      await client.query(
        `INSERT INTO order_outbox (event_id, topic, aggregate_id, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [event.id, ORDER_CREATED_TOPIC, order.id, JSON.stringify(event)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPendingEvents(limit = 50): Promise<PendingOrderEvent[]> {
    const result = await this.pool.query<{
      event_id: string;
      topic: string;
      aggregate_id: string;
      payload: EventEnvelope<'OrderCreated', OrderCreatedPayload>;
    }>(
      `SELECT event_id, topic, aggregate_id, payload
       FROM order_outbox
       WHERE published_at IS NULL
       ORDER BY created_at
       LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => ({
      eventId: row.event_id,
      topic: row.topic,
      orderId: row.aggregate_id,
      payload: row.payload,
    }));
  }

  async markEventPublished(eventId: string): Promise<void> {
    await this.pool.query(
      'UPDATE order_outbox SET published_at = now() WHERE event_id = $1 AND published_at IS NULL',
      [eventId],
    );
  }
}