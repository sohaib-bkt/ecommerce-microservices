import { Module } from '@nestjs/common';
import { PaymentResultConsumer } from './payment-result.consumer.js';
import { OrderStatusService } from './order-status.service.js';

@Module({
  providers: [OrderStatusService],
  controllers: [PaymentResultConsumer],
  exports: [OrderStatusService],
})
export class OrdersModule {}
