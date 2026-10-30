import { RpcException } from '@nestjs/microservices';
import { ecommerce } from '@ecommerce-platform/contracts';
import { AccountService } from './account.service.js';
import type { AccountRepository } from './account.repository.js';

describe('AccountService', () => {
  const account = {
    id: 'account_1',
    email: 'person@example.com',
    displayName: 'Person',
    status: ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_ACTIVE,
  };

  function makeRepository() {
    return {
      create: jest.fn().mockResolvedValue(account),
      getById: jest.fn().mockResolvedValue(account),
      list: jest.fn().mockResolvedValue({ accounts: [account], totalItems: 1 }),
      update: jest.fn().mockResolvedValue(account),
    };
  }

  it('normalizes email and display name before creating the account', async () => {
    const repository = makeRepository();
    const service = new AccountService(repository as unknown as AccountRepository);

    await expect(
      service.createAccount({
        email: '  PERSON@EXAMPLE.COM ',
        displayName: ' Person ',
      }),
    ).resolves.toEqual(account);

    expect(repository.create).toHaveBeenCalledWith({
      id: expect.any(String),
      email: 'person@example.com',
      displayName: 'Person',
      shippingAddress: undefined,
    });
  });

  it('rejects invalid email before touching the repository', async () => {
    const repository = makeRepository();
    const service = new AccountService(repository as unknown as AccountRepository);

    await expect(
      service.createAccount({ email: 'not-an-email', displayName: 'Person' }),
    ).rejects.toBeInstanceOf(RpcException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('maps case-insensitive email uniqueness violations to ALREADY_EXISTS', async () => {
    const repository = makeRepository();
    repository.create.mockRejectedValue({ code: '23505' });
    const service = new AccountService(repository as unknown as AccountRepository);

    try {
      await service.createAccount({ email: 'person@example.com', displayName: 'Person' });
      throw new Error('Expected createAccount to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({ code: 6 });
    }
  });

  it('returns NOT_FOUND when the requested account does not exist', async () => {
    const repository = makeRepository();
    repository.getById.mockResolvedValue(undefined);
    const service = new AccountService(repository as unknown as AccountRepository);

    try {
      await service.getAccount('missing');
      throw new Error('Expected getAccount to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(RpcException);
      expect((error as RpcException).getError()).toMatchObject({ code: 5 });
    }
  });

  it('bounds pagination and applies the requested status filter', async () => {
    const repository = makeRepository();
    const service = new AccountService(repository as unknown as AccountRepository);

    const result = await service.listAccounts({
      page: { page: 0, pageSize: 500 },
      status: ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_SUSPENDED,
    });

    expect(repository.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      status: 'SUSPENDED',
    });
    expect(result.page).toEqual({ totalItems: 1, totalPages: 1, currentPage: 1 });
  });

  it('updates status without changing immutable account fields', async () => {
    const repository = makeRepository();
    const service = new AccountService(repository as unknown as AccountRepository);

    await service.updateAccount({
      id: 'account_1',
      displayName: '',
      status: ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_CLOSED,
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'account_1',
      displayName: '',
      shippingAddress: undefined,
      status: 'CLOSED',
    });
  });
});