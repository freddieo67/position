import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 15000,
  query_timeout: 8000,
  statement_timeout: 8000,
  keepAlive: true,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});
