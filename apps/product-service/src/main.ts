import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';

function resolveProtoPaths(): { protoPath: string; includeDir: string } {
  const { existsSync } = require('node:fs');
  const { join } = require('node:path');
  const { cwd } = require('node:process');
  const candidates = [
    'libs/contracts/proto',
    'node_modules/@ecommerce-platform/contracts/proto',
  ];
  for (const candidate of candidates) {
    const full = join(cwd(), candidate, 'product/v1/product.proto');
    if (existsSync(full)) {
      return { protoPath: full, includeDir: join(cwd(), candidate) };
    }
  }
  const fallback = join(cwd(), 'libs/contracts/proto');
  return {
    protoPath: join(fallback, 'product/v1/product.proto'),
    includeDir: fallback,
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const grpcPort = Number(process.env.GRPC_PORT ?? 50052);
  const { protoPath, includeDir } = resolveProtoPaths();
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
