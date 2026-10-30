import { Module } from '@nestjs/common';
import { AccountGrpcController } from './account.grpc.controller.js';
import { AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';

@Module({
  controllers: [AccountGrpcController],
  providers: [AccountRepository, AccountService],
  exports: [AccountService],
})
export class AccountsModule {}