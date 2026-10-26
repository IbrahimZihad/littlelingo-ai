import { randomUUID } from 'node:crypto';
import { openDatabase, closeDatabase } from '../../src/database/connection.js';

// The app no longer owns an embedded database, so the suite runs against a real MySQL
// server through the same pool, TLS pinning and schema the app uses. TEST_DATABASE_URL
// points at that server; leaving it unset is a hard failure rather than a silent skip,
// because a green run that tested nothing is worse than a red one.
export async function openTestDatabase() {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is required to run the tests, e.g. ' +
      'mysql://user:password@host.aivencloud.com:16707/defaultdb (add the CA with AIVEN_CA_CERT or AIVEN_CA_CERT_FILE).'
    );
  }
  return openDatabase(url);
}

export const closeTestDatabase = closeDatabase;

// Rows are written with generated identifiers and deleted again by dispose(), so a run
// never clears tables it does not own: the same managed database can hold a real
// caregiver account while the suite is running.
export async function seed(db, { level = 'L1', learners = 1, caregiverId = randomUUID() } = {}) {
  await write(db, 'INSERT INTO caregivers(id, email, password_hash) VALUES(?, ?, ?)', [
    caregiverId, `${caregiverId}@example.test`, 'test'
  ]);
  const learnerIds = [];
  for (let index = 0; index < learners; index += 1) {
    learnerIds.push(await seedLearner(db, { level, caregiverId }));
  }
  return { caregiverId, learnerId: learnerIds[0], learnerIds };
}

// A learner row with no caregiver, used both for the service-level tests and to prove
// the ownership check rejects a profile outside the signed-in account.
export async function seedLearner(db, { level = 'L1', caregiverId = null } = {}) {
  const learnerId = randomUUID();
  await write(db, 'INSERT INTO learners(id, caregiver_id, level) VALUES(?, ?, ?)', [learnerId, caregiverId, level]);
  return learnerId;
}

export async function dispose(db, { caregiverId, learnerIds }) {
  // attempts and word_practices disappear with the learner through ON DELETE CASCADE.
  await removeLearners(db, learnerIds);
  if (caregiverId) await write(db, 'DELETE FROM caregivers WHERE id=?', [caregiverId]);
}

export async function removeLearners(db, learnerIds) {
  if (!learnerIds?.length) return;
  await write(db, `DELETE FROM learners WHERE id IN (${learnerIds.map(() => '?').join(',')})`, learnerIds);
}

export const write = async (db, sql, params = []) => (await db.query(sql, params))[0];
export const all = async (db, sql, params = []) => (await db.query(sql, params))[0];
export const first = async (db, sql, params = []) => (await db.query(sql, params))[0][0] ?? null;
