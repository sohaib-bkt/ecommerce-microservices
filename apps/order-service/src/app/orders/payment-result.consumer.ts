import { Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { parse, paymentCapturedSchema, paymentFailedSchema, SchemaValidationError } from '@ecommerce-platform/contracts';
import { OrderStatusService } from './order-status.service.js';

export type PaymentResultEvent =
  | {
      id: string;
      type: 'PaymentCaptured';
      occurredAt: number;
      source: string;
      version: number;
      payload: {
        paymentId: string;
        orderId: string;
        amount: { amount: number; currency: string };
        providerReference: string;
      };
    }
  | {
      id: string;
      type: 'PaymentFailed';
      occurredAt: number;
      source: string;
      version: number;
      payload: {
        paymentId: string;
        orderId: string;
        amount: { amount: number; currency: string };
        reason: string;
        retryable: boolean;
      };
    };

@Controller()
export class PaymentResultConsumer {
  private readonly logger = new Logger(PaymentResultConsumer.name);

  constructor(private readonly orderStatusService: OrderStatusService) {}

  @EventPattern('payment.captured')
  async handleCaptured(data: unknown): Promise<void> {
    await this.handlePaymentResult(data);
  }

  @EventPattern('payment.failed')
  async handleFailed(data: unknown): Promise<void> {
    await this.handlePaymentResult(data);
  }

  async handlePaymentResult(data: unknown): Promise<void> {
    try {
      const event = parse<PaymentResultEvent>(data, paymentCapturedSchema) as PaymentResultEvent;
      if (event.type === 'PaymentCaptured') {
        const orderId = event.payload.orderId;
        // Idempotency: Kafka delivers at-least-once; skip duplicate captured events.
        if (await this.orderStatusService.isAlreadyProcessed?.(orderId, 'PAID')) {
          this.logger.log(
            `Skipping duplicate PaymentCaptured event for order ${orderId}`,
          );
          return;
        }
        await this.orderStatusService.applyPaymentCaptured(orderId, {
          paymentId: event.payload.paymentId,
          providerReference: event.payload.providerReference,
          amount: event.payload.amount,
        });
        return;
      }
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) {
        throw error;
      }
    }

    try {
      const event = parse<PaymentResultEvent>(data, paymentFailedSchema) as PaymentResultEvent;
      if (event.type === 'PaymentFailed') {
        const orderId = event.payload.orderId;
        // Idempotency: Kafka delivers at-least-once; skip duplicate failed events.
        if (
          await this.orderStatusService.isAlreadyProcessed?.(
            orderId,
            'PENDING',
            event.payload.paymentId,
          )
        ) {
          this.logger.log(
            `Skipping duplicate PaymentFailed event for order ${orderId}`,
          );
          return;
        }
        await this.orderStatusService.applyPaymentFailed(orderId, {
          paymentId: event.payload.paymentId,
          reason: event.payload.reason,
          retryable: event.payload.retryable,
          amount: event.payload.amount,
        });
        return;
      }
    } catch (error) {
      if (error instanceof SchemaValidationError) {
        this.logger.warn(`Dropping invalid payment result event: ${error.message}`);
        return;
      }
      throw error;
    }
  }
}
