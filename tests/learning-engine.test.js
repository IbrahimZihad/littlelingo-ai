import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/services/auth.service.js';
import { getLearnerContext, getProgress } from '../src/services/learning-engine.service.js';
import { fallbackReply } from '../src/services/fallback.service.js';

const vocabulary = JSON.parse(fs.readFileSync(new URL('../src/data/vocabulary.json', import.meta.url), 'utf8'));

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

test('Buddy learner context includes level, practiced words, and recent quiz results', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO learners(id, level) VALUES(?, ?)').run('learner-context', 'L2');
  db.prepare('INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)').run('learner-context', 'cat');
  db.prepare('INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)').run('learner-context', 'dog');
  const attempt = db.prepare('INSERT INTO attempts(learner_id, item_id, skill, correct, session_id) VALUES(?, ?, ?, ?, ?)');
  attempt.run('learner-context', 'cat', 'animals', 0, 'session-1');
  attempt.run('learner-context', 'dog', 'animals', 1, 'session-1');

  const context = getLearnerContext(db, 'learner-context');
  assert.equal(context.level, 'L2');
  assert.deepEqual(context.learningHistory.recentWords, ['Dog', 'Cat']);
  assert.deepEqual(context.learningHistory.recentQuizResults.map(result => result.result), ['correct', 'needs-practice']);
  assert.equal(context.learningHistory.wordsPracticed, 2);
  db.close();
});

test('Fallback word teaching follows learner level and avoids a recently practiced word', () => {
  const levelWords = vocabulary.filter(item => item.level === 'L2');
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const reply = fallbackReply('Teach me a word', {
      level: 'L2',
      learningHistory: { recentWords: [levelWords[0].word] }
    });
    assert.match(reply.message, new RegExp(levelWords[1].word));
    assert.doesNotMatch(reply.message, new RegExp(levelWords[0].word));
  } finally {
    Math.random = originalRandom;
  }
});

test('Word Explorer practice and listening update caregiver dashboard counts', async () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8'));
  const caregiverId = randomUUID();
  const learnerId = randomUUID();
  db.prepare('INSERT INTO caregivers(id, email, password_hash) VALUES(?, ?, ?)').run(caregiverId, `${caregiverId}@example.test`, 'test');
  db.prepare('INSERT INTO learners(id, caregiver_id) VALUES(?, ?)').run(learnerId, caregiverId);
  const originalAuthSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'learning-engine-test-secret';
  const server = createApp(db).listen(0);

  try {
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/api/progress`;
    const headers = { authorization: `Bearer ${issueToken(caregiverId)}`, 'content-type': 'application/json' };
    const listenResponse = await fetch(`${url}/listen`, { method: 'POST', headers, body: JSON.stringify({ learnerId, itemId: 'cat' }) });
    assert.equal(listenResponse.status, 200);
    assert.equal((await listenResponse.json()).progress.lessonsCompleted, 1);

    const practiceResponse = await fetch(`${url}/practice`, { method: 'POST', headers, body: JSON.stringify({ learnerId, itemId: 'cat' }) });
    assert.equal(practiceResponse.status, 200);
    const practice = await practiceResponse.json();
    assert.equal(practice.progress.totalWordsPracticed, 1);
    assert.equal(practice.progress.masteredWords, 0);

    const repeatedPractice = await fetch(`${url}/practice`, { method: 'POST', headers, body: JSON.stringify({ learnerId, itemId: 'cat' }) });
    assert.equal((await repeatedPractice.json()).progress.totalWordsPracticed, 1);

    let levelOneResult;
    for (const word of vocabulary.filter(item => item.level === 'L1' && item.id !== 'cat')) {
      const response = await fetch(`${url}/practice`, { method: 'POST', headers, body: JSON.stringify({ learnerId, itemId: word.id }) });
      assert.equal(response.status, 200);
      levelOneResult = await response.json();
    }
    assert.equal(levelOneResult.levelAdvanced, true);
    assert.equal(levelOneResult.previousLevel, 'L1');
    assert.equal(levelOneResult.progress.level, 'L2');
    assert.equal(levelOneResult.progress.progress, 0);

    let levelTwoResult;
    for (const word of vocabulary.filter(item => item.level === 'L2')) {
      const response = await fetch(`${url}/practice`, { method: 'POST', headers, body: JSON.stringify({ learnerId, itemId: word.id }) });
      assert.equal(response.status, 200);
      levelTwoResult = await response.json();
    }
    assert.equal(levelTwoResult.levelAdvanced, true);
    assert.equal(levelTwoResult.previousLevel, 'L2');
    assert.equal(levelTwoResult.progress.level, 'L3');
  } finally {
    server.close();
    await once(server, 'close');
    db.close();
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
  }
});
