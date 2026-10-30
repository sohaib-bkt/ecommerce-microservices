import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { ProductController } from './product.controller.js';
import { ProductClientService } from './product.service.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'PRODUCT_PACKAGE',
        // Make ConfigService injectable inside the async factory. The factory
        // runs after ConfigModule has loaded .env, so every value is available.
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          const paths = resolveContractProtoPaths(
            config.getOrThrow<string>('PRODUCT_PROTO_PATH'),
            config.getOrThrow<string>('PRODUCT_PROTO_INCLUDE_DIR'),
            'api-gateway ProductService client',
          );
          Logger.log(`Using product-service proto: ${paths.protoPath}`);
          return {
            transport: Transport.GRPC,
            options: {
              package: 'ecommerce.product.v1',
              protoPath: paths.protoPath,
              url: config.getOrThrow<string>('PRODUCT_SERVICE_URL'),
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
  controllers: [ProductController],
  providers: [ProductClientService],
  exports: [ProductClientService],
})
export class ProductModule {}
