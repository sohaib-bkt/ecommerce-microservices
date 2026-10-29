import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.tokens.js';
import { PaymentRepository } from './payment.repository.js';
import { OrderCreatedConsumer } from './order-created.consumer.js';
import { PaymentResultPublisher } from './payment-result.publisher.js';
import { PaymentsService } from './payments.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import { StripeWebhookService } from './stripe-webhook.service.js';

@Module({
  providers: [
    {
      provide: PaymentRepository,
      useFactory: (pool: Pool) => new PaymentRepository(pool),
      inject: [PG_POOL],
    },
    PaymentsService,
    OrderCreatedConsumer,
    PaymentResultPublisher,
    StripeWebhookService,
  ],
  controllers: [StripeWebhookController],
  exports: [PaymentsService, OrderCreatedConsumer, StripeWebhookService, PaymentResultPublisher],
})
export class PaymentsModule {}
