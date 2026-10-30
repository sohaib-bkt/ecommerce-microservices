import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import { OrderRepository } from './order.repository.js';

@Injectable()
export class OrderOutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderOutboxPublisher.name);
  private readonly producer: Producer;
  private readonly kafka: Kafka;
  private connected = false;
  private publishing = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly orderRepository: OrderRepository) {
    this.kafka = new Kafka({
      clientId: 'order-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = this.kafka.producer();
  }

  async onModuleInit(): Promise<void> {
    this.timer = setInterval(() => void this.flushPending(), 1000);
    await this.flushPending();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.connected) await this.producer.disconnect();
  }

  async flushPending(): Promise<void> {
    if (this.publishing) return;
    this.publishing = true;
    try {
      if (!this.connected) {
        await this.producer.connect();
        this.connected = true;
      }

      const events = await this.orderRepository.getPendingEvents();
      for (const event of events) {
        try {
          await this.producer.send({
            topic: event.topic,
            messages: [{ key: event.orderId, value: JSON.stringify(event.payload) }],
          });
          await this.orderRepository.markEventPublished(event.eventId);
        } catch (error) {
          this.logger.error(`Unable to publish order event ${event.eventId}`, error);
          break;
        }
      }
    } catch (error) {
      this.connected = false;
      this.logger.error('Order event outbox is unavailable; will retry', error);
    } finally {
      this.publishing = false;
    }
  }
}