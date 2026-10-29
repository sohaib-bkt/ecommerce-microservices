import { Injectable } from '@nestjs/common';

export type OrderStatus = 'PENDING' | 'PAID';

export interface OrderStatusSnapshot {
  orderId: string;
  status: OrderStatus;
  reason?: string;
  paymentId?: string;
  providerReference?: string;
  amount?: { amount: number; currency: string };
}

@Injectable()
export class OrderStatusService {
  private readonly orders = new Map<string, OrderStatusSnapshot>();

  applyPaymentCaptured(
    orderId: string,
    payload: {
      paymentId: string;
      providerReference: string;
      amount: { amount: number; currency: string };
    },
  ): OrderStatusSnapshot {
    // Idempotency: if the order is already PAID, do not overwrite the stored
    // snapshot or re-trigger downstream side effects for a duplicate event.
    const current = this.orders.get(orderId);
    if (current?.status === 'PAID') {
      return current;
    }

    const next: OrderStatusSnapshot = {
      orderId,
      status: 'PAID',
      paymentId: payload.paymentId,
      providerReference: payload.providerReference,
      amount: payload.amount,
    };

    this.orders.set(orderId, next);
    return next;
  }

  applyPaymentFailed(
    orderId: string,
    payload: {
      paymentId: string;
      reason: string;
      retryable: boolean;
      amount: { amount: number; currency: string };
    },
  ): OrderStatusSnapshot {
    // Idempotency: if the order is already PENDING with the same payment failure,
    // do not overwrite the stored snapshot or re-trigger downstream side effects.
    const current = this.orders.get(orderId);
    if (current?.status === 'PENDING' && current.paymentId === payload.paymentId) {
      return current;
    }

    const next: OrderStatusSnapshot = {
      orderId,
      status: 'PENDING',
      reason: payload.reason,
      paymentId: payload.paymentId,
      amount: payload.amount,
      providerReference: undefined,
    };

    this.orders.set(orderId, next);
    return next;
  }

  getStatus(orderId: string): OrderStatusSnapshot | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Idempotency check: returns true when the order already reflects the given
   * final status, so a duplicate Kafka event can be skipped before any side
   * effects (notifications, inventory deductions, etc.) are triggered.
   */
  isAlreadyProcessed(orderId: string, status: OrderStatus): boolean {
    return this.orders.get(orderId)?.status === status;
  }
}
