import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.tokens.js';
import { PAYMENT_SCHEMA_SQL } from './schema.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(PAYMENT_SCHEMA_SQL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
