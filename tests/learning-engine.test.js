import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { getProgress } from '../src/services/learning-engine.service.js';

test('Word Explorer progress counts each practiced word once and follows the selected level', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO learners(id, level) VALUES(?, ?)').run('learner-1', 'L1');

  const initial = getProgress(db, 'learner-1');
  assert.equal(initial.totalWords, 18);
  assert.equal(initial.practicedWords, 0);
  assert.equal(initial.progress, 0);

  db.prepare('INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)').run('learner-1', 'cat');
  db.prepare('INSERT OR IGNORE INTO word_practices(learner_id, item_id) VALUES(?, ?)').run('learner-1', 'cat');
  const levelOne = getProgress(db, 'learner-1');
  assert.equal(levelOne.practicedWords, 1);
  assert.equal(levelOne.progress, 6);

  db.prepare('UPDATE learners SET level=? WHERE id=?').run('L2', 'learner-1');
  const levelTwo = getProgress(db, 'learner-1');
  assert.equal(levelTwo.level, 'L2');
  assert.equal(levelTwo.totalWords, 6);
  assert.equal(levelTwo.practicedWords, 0);
  assert.equal(levelTwo.progress, 0);
  db.close();
});

test('Quiz mastery no longer advances the learner level automatically', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO learners(id, level, lessons_completed) VALUES(?, ?, ?)').run('learner-2', 'L1', 2);
  const insertAttempt = db.prepare('INSERT INTO attempts(learner_id, item_id, skill, correct, session_id) VALUES(?, ?, ?, 1, ?)');
  for (const itemId of ['cat', 'dog', 'bird', 'fish']) {
    insertAttempt.run('learner-2', itemId, 'vocabulary', 'session-1');
    insertAttempt.run('learner-2', itemId, 'vocabulary', 'session-1');
    insertAttempt.run('learner-2', itemId, 'vocabulary', 'session-2');
  }

  const progress = getProgress(db, 'learner-2');
  assert.equal(progress.masteredWords, 4);
  assert.equal(progress.level, 'L1');
  db.close();
});
