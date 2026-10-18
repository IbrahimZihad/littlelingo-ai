import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export function openDatabase() {
  const dbPath = process.env.DATABASE_PATH || './data/littlelingo.sqlite';
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  const columns = db.prepare('PRAGMA table_info(learners)').all().map(c => c.name);
  if (!columns.includes('caregiver_id')) db.exec('ALTER TABLE learners ADD COLUMN caregiver_id TEXT REFERENCES caregivers(id) ON DELETE CASCADE');
  db.exec('CREATE INDEX IF NOT EXISTS idx_learners_caregiver ON learners(caregiver_id)');
  return db;
}
