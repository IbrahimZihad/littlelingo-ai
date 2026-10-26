import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/services/auth.service.js';
import { getLearnerContext, getProgress } from '../src/services/learning-engine.service.js';
import { fallbackReply } from '../src/services/fallback.service.js';
import { vocabulary, quizzes, curriculumLessons } from '../src/data/curriculum.js';
import { openTestDatabase, closeTestDatabase, seed, seedLearner, dispose, write } from './helpers/database.js';

// Every case in this file talks to the same pooled connection: opening one per test
// against a managed server would measure the handshake rather than the queries.
let shared;
const database = async () => shared ??= await openTestDatabase();
after(async () => { if (shared) await closeTestDatabase(shared); });

test('Word Explorer progress counts each practiced word once and follows the selected level', async () => {
  const db = await database();
  const learnerId = await seedLearner(db, { level: 'L1' });
  try {
    const initial = await getProgress(db, learnerId);
    assert.equal(initial.totalWords, vocabulary.filter(word => word.level === 'L1').length);
    assert.equal(initial.practicedWords, 0);
    assert.equal(initial.progress, 0);

    await write(db, 'INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)', [learnerId, 'cat']);
    await write(db, 'INSERT IGNORE INTO word_practices(learner_id, item_id) VALUES(?, ?)', [learnerId, 'cat']);
    const levelOne = await getProgress(db, learnerId);
    assert.equal(levelOne.practicedWords, 1);
    assert.equal(levelOne.progress, Math.round(100 / initial.totalWords));

    await write(db, 'UPDATE learners SET level=? WHERE id=?', ['L2', learnerId]);
    const levelTwo = await getProgress(db, learnerId);
    assert.equal(levelTwo.level, 'L2');
    assert.equal(levelTwo.totalWords, vocabulary.filter(word => word.level === 'L2').length);
    assert.equal(levelTwo.practicedWords, 0);
    assert.equal(levelTwo.progress, 0);
  } finally {
    await dispose(db, { learnerIds: [learnerId] });
  }
});

test('Quiz mastery no longer advances the learner level automatically', async () => {
  const db = await database();
  const learnerId = await seedLearner(db, { level: 'L1' });
  try {
    await write(db, 'UPDATE learners SET lessons_completed=? WHERE id=?', [2, learnerId]);
    for (const itemId of ['cat', 'dog', 'bird', 'fish']) {
      for (const sessionId of ['session-1', 'session-1', 'session-2']) {
        await write(db, 'INSERT INTO attempts(learner_id, item_id, skill, correct, session_id) VALUES(?, ?, ?, 1, ?)', [learnerId, itemId, 'vocabulary', sessionId]);
      }
    }

    const progress = await getProgress(db, learnerId);
    assert.equal(progress.masteredWords, 4);
    assert.equal(progress.level, 'L1');
  } finally {
    await dispose(db, { learnerIds: [learnerId] });
  }
});

test('Buddy learner context includes level, practiced words, and recent quiz results', async () => {
  const db = await database();
  const learnerId = await seedLearner(db, { level: 'L2' });
  try {
    await write(db, 'INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)', [learnerId, 'cat']);
    await write(db, 'INSERT INTO word_practices(learner_id, item_id) VALUES(?, ?)', [learnerId, 'dog']);
    await write(db, 'INSERT INTO attempts(learner_id, item_id, skill, correct, session_id) VALUES(?, ?, ?, ?, ?)', [learnerId, 'cat', 'animals', 0, 'session-1']);
    await write(db, 'INSERT INTO attempts(learner_id, item_id, skill, correct, session_id) VALUES(?, ?, ?, ?, ?)', [learnerId, 'dog', 'animals', 1, 'session-1']);

    const context = await getLearnerContext(db, learnerId);
    assert.equal(context.level, 'L2');
    assert.deepEqual(context.learningHistory.recentWords, ['Dog', 'Cat']);
    assert.deepEqual(context.learningHistory.recentQuizResults.map(result => result.result), ['correct', 'needs-practice']);
    assert.equal(context.learningHistory.wordsPracticed, 2);
  } finally {
    await dispose(db, { learnerIds: [learnerId] });
  }
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
  const db = await database();
  const { caregiverId, learnerId } = await seed(db);
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalRateLimit = process.env.RATE_LIMIT_MAX_REQUESTS;
  const originalActivityRateLimit = process.env.LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS;
  process.env.AUTH_SECRET = 'learning-engine-test-secret';
  process.env.RATE_LIMIT_MAX_REQUESTS = '30';
  process.env.LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS = '500';
  const server = createApp(db).listen(0);

  try {
    await once(server, 'listening');
    const publicApi = `http://127.0.0.1:${server.address().port}/api`;
    assert.equal(vocabulary.filter(word => word.level === 'L1' && word.category === 'alphabet').length, 26);
    assert.equal(vocabulary.filter(word => word.level === 'L1' && word.category === 'numbers').length, 10);
    assert.equal(vocabulary.filter(word => word.level === 'L2' && word.category === 'numbers').length, 100);
    assert.equal(new Set(vocabulary.map(word => word.id)).size, vocabulary.length);
    for (const level of ['L1', 'L2', 'L3']) {
      const levelQuizzes = quizzes.filter(quiz => quiz.level === level);
      assert.equal(levelQuizzes.length, 10);
      assert.ok(levelQuizzes.every(quiz => quiz.options.every(option => option.itemId)));
    }
    const vocabularyIds = new Set(vocabulary.map(word => word.id));
    assert.ok(quizzes.every(quiz => quiz.options.every(option => vocabularyIds.has(option.itemId))));
    assert.equal(curriculumLessons.filter(lesson => lesson.level === 'L3').length, 3);
    const publicQuizResponse = await fetch(`${publicApi}/quizzes?level=L1`);
    const publicQuizzes = await publicQuizResponse.json();
    assert.equal(publicQuizResponse.status, 200);
    assert.equal(publicQuizzes.length, 10);
    assert.ok(publicQuizzes.every(quiz => !Object.hasOwn(quiz, 'answer')));
    const levelThreeResponse = await fetch(`${publicApi}/vocabulary?level=L3`);
    const levelThreeWords = await levelThreeResponse.json();
    assert.ok(levelThreeWords.length > 0);
    assert.ok(levelThreeWords.every(word => word.level === 'L3'));
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
    await dispose(db, { caregiverId, learnerIds: [learnerId] });
    if (originalAuthSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalAuthSecret;
    if (originalRateLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS;
    else process.env.RATE_LIMIT_MAX_REQUESTS = originalRateLimit;
    if (originalActivityRateLimit === undefined) delete process.env.LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS;
    else process.env.LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS = originalActivityRateLimit;
  }
});
