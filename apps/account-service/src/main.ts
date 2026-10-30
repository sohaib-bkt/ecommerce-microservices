/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { resolveContractProtoPaths } from '@ecommerce-platform/contracts';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const grpcPort = Number(process.env.ACCOUNT_GRPC_PORT ?? 50051);
  const { protoPath, includeDir } = resolveContractProtoPaths(
    process.env.ACCOUNT_PROTO_PATH ?? 'libs/contracts/proto/account/v1/account.proto',
    process.env.ACCOUNT_PROTO_INCLUDE_DIR ?? 'libs/contracts/proto',
    'account-service AccountService server',
  );
  Logger.log(`Using account-service proto: ${protoPath}`);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      url: `0.0.0.0:${grpcPort}`,
      package: 'ecommerce.account.v1',
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

  const port = process.env.PORT || 3001;
  await app.startAllMicroservices();
  await app.listen(port);
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
  Logger.log(`Account gRPC server running on 0.0.0.0:${grpcPort}`);
}

bootstrap();
