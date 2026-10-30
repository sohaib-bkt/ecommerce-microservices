import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import { AccountService } from './account.service.js';

@Controller()
export class AccountGrpcController {
  constructor(private readonly accountService: AccountService) {}

  @GrpcMethod('AccountService', 'GetAccount')
  async getAccount(request: ecommerce.account.v1.GetAccountRequest) {
    return { account: await this.accountService.getAccount(request.id) };
  }

  @GrpcMethod('AccountService', 'ListAccounts')
  listAccounts(request: ecommerce.account.v1.ListAccountsRequest) {
    return this.accountService.listAccounts(request);
  }

  @GrpcMethod('AccountService', 'CreateAccount')
  async createAccount(request: ecommerce.account.v1.CreateAccountRequest) {
    return { account: await this.accountService.createAccount(request) };
  }

  @GrpcMethod('AccountService', 'UpdateAccount')
  async updateAccount(request: ecommerce.account.v1.UpdateAccountRequest) {
    return { account: await this.accountService.updateAccount(request) };
  }
}