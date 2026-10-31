import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EventEnvelope, ProductCreatedPayload, ProductUpdatedPayload } from '@ecommerce-platform/contracts';
import { Kafka, type Producer } from 'kafkajs';
import type { StoredProduct } from './product.service.js';

export const PRODUCT_CREATED_TOPIC = 'product.created';
export const PRODUCT_UPDATED_TOPIC = 'product.updated';

const productStatusName = (status: number): 'DRAFT' | 'ACTIVE' | 'ARCHIVED' => {
  if (status === 1) return 'DRAFT';
  if (status === 3) return 'ARCHIVED';
  return 'ACTIVE';
};

@Injectable()
export class ProductEventPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private readonly producer: Producer;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'product-service',
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

  async publishCreated(product: StoredProduct): Promise<void> {
    const event: EventEnvelope<'ProductCreated', ProductCreatedPayload> = {
      id: `evt_${randomUUID()}`,
      type: 'ProductCreated',
      occurredAt: Date.now(),
      source: 'product-service',
      version: 1,
      payload: {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        stockQuantity: product.stockQuantity,
        description: product.description,
        currency: product.currency,
        status: productStatusName(product.status),
        categoryIds: product.categoryIds,
        createdAt: product.createdAt.epochMillis,
        updatedAt: product.updatedAt.epochMillis,
      },
    };
    await this.publish(PRODUCT_CREATED_TOPIC, product.id, event);
  }

  async publishUpdated(product: StoredProduct): Promise<void> {
    const event: EventEnvelope<'ProductUpdated', ProductUpdatedPayload> = {
      id: `evt_${randomUUID()}`,
      type: 'ProductUpdated',
      occurredAt: Date.now(),
      source: 'product-service',
      version: 1,
      payload: {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        stockQuantity: product.stockQuantity,
        status: productStatusName(product.status),
        categoryIds: product.categoryIds,
        createdAt: product.createdAt.epochMillis,
        updatedAt: product.updatedAt.epochMillis,
      },
    };
    await this.publish(PRODUCT_UPDATED_TOPIC, product.id, event);
  }

  private async publish(topic: string, key: string, event: unknown): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(event) }],
    });
  }
}