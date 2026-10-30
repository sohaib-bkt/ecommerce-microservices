import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { AppModule } from './app/app.module';

function resolveOrderProto(): { protoPath: string; includeDir: string } {
  const configuredProto = process.env.ORDER_PROTO_PATH ?? 'libs/contracts/proto/order/v1/order.proto';
  const protoPath = isAbsolute(configuredProto)
    ? configuredProto
    : resolve(process.cwd(), configuredProto);
  const includeDir = process.env.ORDER_PROTO_INCLUDE_DIR
    ? resolve(process.cwd(), process.env.ORDER_PROTO_INCLUDE_DIR)
    : join(process.cwd(), 'libs/contracts/proto');

  if (!existsSync(protoPath)) {
    throw new Error(`Order proto not found: ${protoPath}`);
  }
  return { protoPath, includeDir };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      },
      consumer: {
        groupId: process.env.KAFKA_ORDER_GROUP_ID ?? 'order-service',
      },
    },
  });

  const grpcPort = Number(process.env.ORDER_GRPC_PORT ?? 50053);
  const { protoPath, includeDir } = resolveOrderProto();
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${grpcPort}`,
      package: 'ecommerce.order.v1',
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

  const port = process.env.PORT || 3003;
  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);
  Logger.log(`Order gRPC server running on 0.0.0.0:${grpcPort}`);
}

bootstrap();
