import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { AppModule } from './app/app.module';

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
  const { protoPath, includeDir } = resolveContractProtoPaths(
    process.env.ORDER_PROTO_PATH ?? 'libs/contracts/proto/order/v1/order.proto',
    process.env.ORDER_PROTO_INCLUDE_DIR ?? 'libs/contracts/proto',
    'order-service OrderService server',
  );
  Logger.log(`Using order-service proto: ${protoPath}`);
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
