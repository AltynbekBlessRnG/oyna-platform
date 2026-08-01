import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { DATABASE_SCHEMA } from "./schema";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    this.pool = connectionString ? new Pool({ connectionString, max: 10 }) : null;
  }

  get configured(): boolean {
    return this.pool !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn("DATABASE_URL is not set; using the in-memory pilot store");
      return;
    }
    await this.pool.query(DATABASE_SCHEMA);
    this.logger.log("PostgreSQL schema is ready");
  }

  async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error("Database is not configured");
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error("Database is not configured");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}

