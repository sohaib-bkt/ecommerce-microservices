import { Injectable } from '@nestjs/common';
import { OrderStatusRepository } from './order-status.repository.js';

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
  constructor(private readonly repository: OrderStatusRepository) {}

  async applyPaymentCaptured(
    orderId: string,
    payload: {
      paymentId: string;
      providerReference: string;
      amount: { amount: number; currency: string };
    },
  ): Promise<OrderStatusSnapshot> {
    return this.repository.applyPaymentCaptured(orderId, payload);
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
    return this.repository.applyPaymentFailed(orderId, payload);
  }

  async getStatus(orderId: string): Promise<OrderStatusSnapshot | undefined> {
    return this.repository.getByOrderId(orderId);
  }

  async isAlreadyProcessed(orderId: string, status: OrderStatus, paymentId?: string): Promise<boolean> {
    return this.repository.isAlreadyProcessed(orderId, status, paymentId);
  }
}