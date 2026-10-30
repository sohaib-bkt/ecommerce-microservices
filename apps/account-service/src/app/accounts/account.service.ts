import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { randomUUID } from 'node:crypto';
import { ecommerce } from '@ecommerce-platform/contracts';
import { AccountRepository } from './account.repository.js';
import type { DbStatus } from './account.repository.js';

type CreateAccountRequest = ecommerce.account.v1.CreateAccountRequest;
type UpdateAccountRequest = ecommerce.account.v1.UpdateAccountRequest;
type AccountStatus = ecommerce.account.v1.AccountStatus;

const STATUS_BY_PROTO: Partial<Record<AccountStatus, DbStatus>> = {
  [ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_ACTIVE]: 'ACTIVE',
  [ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_SUSPENDED]: 'SUSPENDED',
  [ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_CLOSED]: 'CLOSED',
};

function invalidArgument(message: string): RpcException {
  return new RpcException({ code: 3, message });
}

@Injectable()
export class AccountService {
  constructor(private readonly accountRepository: AccountRepository) {}

  async getAccount(id: string) {
    if (!id?.trim()) throw invalidArgument('Account ID is required');
    const account = await this.accountRepository.getById(id);
    if (!account) throw new RpcException({ code: 5, message: `Account not found: ${id}` });
    return account;
  }

  async listAccounts(request: ecommerce.account.v1.ListAccountsRequest) {
    const status = request.status === ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_UNSPECIFIED
      ? undefined
      : STATUS_BY_PROTO[request.status];
    if (request.status !== ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_UNSPECIFIED && !status) {
      throw invalidArgument('Account status is invalid');
    }

    const page = Math.max(1, request.page?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, request.page?.pageSize || 20));
    const result = await this.accountRepository.list({ page, pageSize, status });
    return {
      accounts: result.accounts,
      page: {
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
        currentPage: page,
      },
    };
  }

  async createAccount(request: CreateAccountRequest) {
    const email = String(request.email ?? '').trim().toLowerCase();
    const displayName = String(request.displayName ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw invalidArgument('A valid email address is required');
    }
    if (!displayName) throw invalidArgument('Display name is required');

    try {
      return await this.accountRepository.create({
        id: randomUUID(),
        email,
        displayName,
        shippingAddress: request.shippingAddress,
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new RpcException({ code: 6, message: 'An account with this email already exists' });
      }
      throw error;
    }
  }

  async updateAccount(request: UpdateAccountRequest) {
    if (!request.id?.trim()) throw invalidArgument('Account ID is required');
    const status = request.status === ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_UNSPECIFIED
      ? undefined
      : STATUS_BY_PROTO[request.status];
    if (request.status !== ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_UNSPECIFIED && !status) {
      throw invalidArgument('Account status is invalid');
    }
    const account = await this.accountRepository.update({
      id: request.id,
      displayName: String(request.displayName ?? '').trim(),
      shippingAddress: request.shippingAddress,
      status,
    });
    if (!account) throw new RpcException({ code: 5, message: `Account not found: ${request.id}` });
    return account;
  }
}