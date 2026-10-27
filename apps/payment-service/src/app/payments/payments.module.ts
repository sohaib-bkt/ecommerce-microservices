import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.tokens.js';
import { PaymentRepository } from './payment.repository.js';
import { OrderCreatedConsumer } from './order-created.consumer.js';
import { PaymentsService } from './payments.service.js';

@Module({
  providers: [
    {
      provide: PaymentRepository,
      useFactory: (pool: Pool) => new PaymentRepository(pool),
      inject: [PG_POOL],
    },
    PaymentsService,
    OrderCreatedConsumer,
  ],
  exports: [PaymentsService, OrderCreatedConsumer],
})
export class PaymentsModule {}
