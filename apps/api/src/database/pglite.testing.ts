import { PGlite } from "@electric-sql/pglite";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { DatabaseService } from "./database.service";
import { DATABASE_SCHEMA } from "./schema";

interface Queryable {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
}

function toResult<T extends QueryResultRow>(result: { rows: T[]; affectedRows?: number }): QueryResult<T> {
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length, command: "", oid: 0, fields: [] };
}

function adapt(target: Queryable): PoolClient {
  return { query: async (text: string, values?: unknown[]) => toResult(await target.query<QueryResultRow>(text, values)) } as unknown as PoolClient;
}

/**
 * Настоящий PostgreSQL внутри процесса тестов: SQL проверяется на движке, а не на хранилище в памяти.
 * Схема та же, что на проде.
 */
export class PgliteDatabase extends DatabaseService {
  private constructor(private readonly db: PGlite) {
    super();
  }

  static async create(): Promise<PgliteDatabase> {
    const db = new PGlite();
    await db.exec(DATABASE_SCHEMA);
    return new PgliteDatabase(db);
  }

  override get configured(): boolean {
    return true;
  }

  override async onModuleInit(): Promise<void> {}

  override async query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return toResult(await this.db.query<T>(text, values));
  }

  override async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(adapt(tx)));
  }

  override async onModuleDestroy(): Promise<void> {
    await this.db.close();
  }
}
