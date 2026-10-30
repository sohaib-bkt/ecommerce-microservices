import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { DatabaseModule } from '../database/database.module.js';
import { OrderCreationService } from './order-creation.service.js';
import { OrderGrpcController } from './order.grpc.controller.js';
import { OrderOutboxPublisher } from './order-outbox.publisher.js';
import { OrderRepository } from './order.repository.js';
import { OrderStatusRepository } from './order-status.repository.js';
import { OrderStatusService } from './order-status.service.js';
import { PaymentResultConsumer } from './payment-result.consumer.js';
import { ProductClientService } from './product-client.service.js';

@Module({
  imports: [
    DatabaseModule,
    ClientsModule.registerAsync([
      {
        name: 'ORDER_PRODUCT_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const paths = resolveContractProtoPaths(
            config.get<string>('PRODUCT_PROTO_PATH') ?? 'libs/contracts/proto/product/v1/product.proto',
            config.get<string>('PRODUCT_PROTO_INCLUDE_DIR') ?? 'libs/contracts/proto',
            'order-service ProductService client',
          );
          Logger.log(`Using product-service proto: ${paths.protoPath}`);
          return {
            transport: Transport.GRPC,
            options: {
              package: 'ecommerce.product.v1',
              protoPath: paths.protoPath,
              url: config.get<string>('PRODUCT_SERVICE_URL') ?? 'localhost:50052',
              loader: {
                keepCase: false,
                longs: Number,
                enums: Number,
                defaults: true,
                oneofs: true,
                includeDirs: [paths.includeDir],
              },
            },
          };
        },
      },
    ]),
  ],
  controllers: [PaymentResultConsumer, OrderGrpcController],
  providers: [
    OrderStatusRepository,
    OrderStatusService,
    ProductClientService,
    OrderRepository,
    OrderOutboxPublisher,
    OrderCreationService,
  ],
  exports: [OrderStatusService],
})
export class OrdersModule {}