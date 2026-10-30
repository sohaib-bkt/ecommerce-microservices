import { Inject, Injectable } from '@nestjs/common';
import { ecommerce } from '@ecommerce-platform/contracts';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.tokens.js';

type Account = ecommerce.account.v1.Account;
type AccountStatus = ecommerce.account.v1.AccountStatus;
type DbStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

type AccountRow = {
  id: string;
  email: string;
  display_name: string;
  status: DbStatus;
  shipping_address: Account['shippingAddress'] | null;
  created_at: Date;
  updated_at: Date;
};

const toStatus = (status: DbStatus): AccountStatus => {
  switch (status) {
    case 'ACTIVE':
      return ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_ACTIVE;
    case 'SUSPENDED':
      return ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_SUSPENDED;
    case 'CLOSED':
      return ecommerce.account.v1.AccountStatus.ACCOUNT_STATUS_CLOSED;
  }
};

const toAccount = (row: AccountRow): Account => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  status: toStatus(row.status),
  shippingAddress: row.shipping_address ?? undefined,
  createdAt: { epochMillis: row.created_at.getTime() },
  updatedAt: { epochMillis: row.updated_at.getTime() },
});

@Injectable()
export class AccountRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: {
    id: string;
    email: string;
    displayName: string;
    shippingAddress?: Account['shippingAddress'];
  }): Promise<Account> {
    const result = await this.pool.query<AccountRow>(
      `INSERT INTO accounts (id, email, display_name, status, shipping_address)
       VALUES ($1, $2, $3, 'ACTIVE', $4::jsonb)
       RETURNING *`,
      [
        input.id,
        input.email,
        input.displayName,
        input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
      ],
    );
    return toAccount(result.rows[0]);
  }

  async getById(id: string): Promise<Account | undefined> {
    const result = await this.pool.query<AccountRow>(
      'SELECT * FROM accounts WHERE id = $1',
      [id],
    );
    return result.rowCount ? toAccount(result.rows[0]) : undefined;
  }

  async list(input: {
    page: number;
    pageSize: number;
    status?: DbStatus;
  }): Promise<{ accounts: Account[]; totalItems: number }> {
    const conditions = input.status ? 'WHERE status = $1' : '';
    const values: Array<string | number> = input.status
      ? [input.status, input.pageSize, (input.page - 1) * input.pageSize]
      : [input.pageSize, (input.page - 1) * input.pageSize];
    const limitIndex = input.status ? 2 : 1;
    const offsetIndex = input.status ? 3 : 2;

    const [accountsResult, countResult] = await Promise.all([
      this.pool.query<AccountRow>(
        `SELECT * FROM accounts ${conditions}
         ORDER BY created_at DESC, id
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        values,
      ),
      this.pool.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM accounts ${conditions}`,
        input.status ? [input.status] : [],
      ),
    ]);

    return {
      accounts: accountsResult.rows.map(toAccount),
      totalItems: Number(countResult.rows[0]?.total ?? 0),
    };
  }

  async update(input: {
    id: string;
    displayName: string;
    shippingAddress?: Account['shippingAddress'];
    status?: DbStatus;
  }): Promise<Account | undefined> {
    const result = await this.pool.query<AccountRow>(
      `UPDATE accounts SET
         display_name = CASE WHEN $2 <> '' THEN $2 ELSE display_name END,
         shipping_address = CASE WHEN $3 THEN $4::jsonb ELSE shipping_address END,
         status = COALESCE($5, status),
         updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        input.id,
        input.displayName,
        input.shippingAddress !== undefined,
        input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
        input.status ?? null,
      ],
    );
    return result.rowCount ? toAccount(result.rows[0]) : undefined;
  }
}

export type { DbStatus };