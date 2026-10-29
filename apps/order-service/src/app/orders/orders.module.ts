import { Module } from '@nestjs/common';
import { PaymentResultConsumer } from './payment-result.consumer.js';
import { OrderStatusService } from './order-status.service.js';

@Module({
  providers: [OrderStatusService, PaymentResultConsumer],
  exports: [OrderStatusService, PaymentResultConsumer],
})
export class OrdersModule {}
