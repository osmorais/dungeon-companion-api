import 'dotenv/config';
import postgres, {Sql} from 'postgres';

export class PostgresDatasource {
  private static instance: PostgresDatasource;
  readonly sql: Sql;

  private constructor() {
    const {PGHOST, PGDATABASE, PGUSER, PGPASSWORD, ENDPOINT_ID} = process.env;
    const url = `postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?options=project%3D${ENDPOINT_ID}`;
    this.sql = postgres(url, {ssl: 'require'});
  }

  static getInstance(): PostgresDatasource {
    if (!PostgresDatasource.instance) {
      PostgresDatasource.instance = new PostgresDatasource();
    }
    return PostgresDatasource.instance;
  }

  async disconnect(): Promise<void> {
    await this.sql.end();
  }
}
