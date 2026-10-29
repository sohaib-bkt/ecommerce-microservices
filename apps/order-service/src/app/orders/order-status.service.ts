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
}
