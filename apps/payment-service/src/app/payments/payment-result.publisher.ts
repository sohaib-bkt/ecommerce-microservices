import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Kafka } from 'kafkajs';
import type { EventEnvelope, PaymentCapturedPayload, PaymentFailedPayload } from '@ecommerce-platform/contracts';

@Injectable()
export class PaymentResultPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentResultPublisher.name);
  private readonly kafka: Kafka;
  private readonly producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: process.env.KAFKA_CLIENT_ID ?? 'payment-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
    this.logger.log('Connected payment-result Kafka producer');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publishCaptured(input: {
    paymentId: string;
    orderId: string;
    amount: { amount: number; currency: string };
    providerReference: string;
  }): Promise<void> {
    const event: EventEnvelope<'PaymentCaptured', PaymentCapturedPayload> = {
      id: `evt_${randomUUID()}`,
      type: 'PaymentCaptured',
      occurredAt: Date.now(),
      source: 'payment-service',
      version: 1,
      payload: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        amount: input.amount,
        providerReference: input.providerReference,
      },
    };

    await this.producer.send({
      topic: 'payment.captured',
      messages: [{ key: input.orderId, value: JSON.stringify(event) }],
    });
  }

  async publishFailed(input: {
    paymentId: string;
    orderId: string;
    amount: { amount: number; currency: string };
    reason: string;
    retryable: boolean;
  }): Promise<void> {
    const event: EventEnvelope<'PaymentFailed', PaymentFailedPayload> = {
      id: `evt_${randomUUID()}`,
      type: 'PaymentFailed',
      occurredAt: Date.now(),
      source: 'payment-service',
      version: 1,
      payload: {
        paymentId: input.paymentId,
        orderId: input.orderId,
        amount: input.amount,
        reason: input.reason,
        retryable: input.retryable,
      },
    };

    await this.producer.send({
      topic: 'payment.failed',
      messages: [{ key: input.orderId, value: JSON.stringify(event) }],
    });
  }
}
