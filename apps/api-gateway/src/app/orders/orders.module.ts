import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { OrderClientService } from './order-client.service.js';
import { OrdersController } from './orders.controller.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'ORDER_PACKAGE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const paths = resolveContractProtoPaths(
            config.getOrThrow<string>('ORDER_PROTO_PATH'),
            config.getOrThrow<string>('ORDER_PROTO_INCLUDE_DIR'),
            'api-gateway OrderService client',
          );
          Logger.log(`Using order-service proto: ${paths.protoPath}`);
          return {
            transport: Transport.GRPC,
            options: {
              package: 'ecommerce.order.v1',
              protoPath: paths.protoPath,
              url: config.getOrThrow<string>('ORDER_SERVICE_URL'),
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
  controllers: [OrdersController],
  providers: [OrderClientService],
})
export class OrdersModule {}