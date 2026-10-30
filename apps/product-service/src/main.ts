import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { AppModule } from './app/app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const grpcPort = Number(process.env.GRPC_PORT ?? 50052);
  const { protoPath, includeDir } = resolveContractProtoPaths(
    process.env.PRODUCT_PROTO_PATH ?? 'libs/contracts/proto/product/v1/product.proto',
    process.env.PRODUCT_PROTO_INCLUDE_DIR ?? 'libs/contracts/proto',
    'product-service ProductService server',
  );
  Logger.log(`Using product-service proto: ${protoPath}`);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${grpcPort}`,
      package: 'ecommerce.product.v1',
      protoPath,
      loader: {
        keepCase: false,
        longs: Number,
        enums: Number,
        defaults: true,
        oneofs: true,
        includeDirs: [includeDir],
      },
    },
  });

  const httpPort = Number(process.env.PORT ?? 3002);
  app.setGlobalPrefix('api');
  await app.startAllMicroservices();
  await app.listen(httpPort);

  Logger.log(`HTTP server running on http://localhost:${httpPort}/api`);
  Logger.log(
    `gRPC server running on 0.0.0.0:${grpcPort} (package: ecommerce.product.v1)`,
  );
}

bootstrap();
