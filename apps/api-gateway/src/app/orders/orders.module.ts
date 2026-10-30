import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OrderClientService } from './order-client.service.js';
import { OrdersController } from './orders.controller.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'ORDER_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: 'ecommerce.order.v1',
            protoPath: config.getOrThrow<string>('ORDER_PROTO_PATH'),
            url: config.getOrThrow<string>('ORDER_SERVICE_URL'),
            loader: {
              keepCase: false,
              longs: Number,
              enums: Number,
              defaults: true,
              oneofs: true,
              includeDirs: [config.getOrThrow<string>('ORDER_PROTO_INCLUDE_DIR')],
            },
          },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrderClientService],
})
export class OrdersModule {}