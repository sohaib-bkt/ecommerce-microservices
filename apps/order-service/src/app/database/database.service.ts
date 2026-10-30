import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from './database.tokens.js';
import { ORDER_SCHEMA_SQL, ORDER_STATUS_SCHEMA_SQL } from './schema.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleInit(): Promise<void> {
    await this.pool.query(ORDER_STATUS_SCHEMA_SQL);
    await this.pool.query(ORDER_SCHEMA_SQL);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}