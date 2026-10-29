import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { EventEnvelope, OrderCreatedPayload } from '@ecommerce-platform/contracts';
import { Kafka } from 'kafkajs';

export const ORDER_CREATED_TOPIC = 'order.created';

@Injectable()
export class OrderEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'api-gateway',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publishOrderCreated(
    event: EventEnvelope<'OrderCreated', OrderCreatedPayload>,
  ): Promise<void> {
    await this.producer.send({
      topic: ORDER_CREATED_TOPIC,
      messages: [{ key: event.payload.orderId, value: JSON.stringify(event) }],
    });
  }
}