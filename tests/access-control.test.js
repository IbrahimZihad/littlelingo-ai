import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, createHmac } from 'node:crypto';
import { createApp } from '../src/app.js';
import { issueToken, verifyToken, tokenHash } from '../src/services/auth.service.js';
import { quizzes, curriculumLessons } from '../src/data/curriculum.js';
import { openTestDatabase, closeTestDatabase, seed, seedLearner, dispose, all, first } from './helpers/database.js';

async function start() {
  const db = await openTestDatabase();
  const originalSecret = process.env.AUTH_SECRET;
  const originalRateLimit = process.env.RATE_LIMIT_MAX_REQUESTS;
  process.env.AUTH_SECRET = 'access-control-test-secret';
  process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const account = await seed(db, { level: 'L1' });
  const { caregiverId, learnerId } = account;
  const otherLearnerId = await seedLearner(db, { level: 'L1' });
  const token = issueToken(caregiverId);
  const json = (path, init = {}) => fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  return {
    db, server, base, caregiverId, learnerId, otherLearnerId, json, token,
    async close() {
      server.close();
      await once(server, 'close');
      await dispose(db, { caregiverId, learnerIds: [learnerId, otherLearnerId] });
      await closeTestDatabase(db);
      if (originalSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = originalSecret;
      if (originalRateLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS; else process.env.RATE_LIMIT_MAX_REQUESTS = originalRateLimit;
    }
  };
}

test('a token past its expiry is rejected', () => {
  const key = 'access-control-test-secret';
  process.env.AUTH_SECRET = key;
  const payload = Buffer.from(JSON.stringify({ sub: randomUUID(), exp: Math.floor(Date.now() / 1000) - 60 })).toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  assert.equal(verifyToken(`${payload}.${signature}`), null, 'an expired signature is still a valid signature');
});

test('a token without an expiry claim is rejected', () => {
  const key = 'access-control-test-secret';
  process.env.AUTH_SECRET = key;
  const payload = Buffer.from(JSON.stringify({ sub: randomUUID() })).toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  assert.equal(verifyToken(`${payload}.${signature}`), null);
});

test('signing out invalidates the bearer token', async () => {
  const app = await start();
  try {
    assert.equal(verifyToken(app.token)?.caregiverId, app.caregiverId);
    const signedOut = await app.json('/auth/logout', { method: 'POST' });
    assert.equal(signedOut.status, 200);
    // The signature is still valid, so only the stored revocation can reject it.
    assert.equal(verifyToken(app.token)?.caregiverId, app.caregiverId);
    assert.ok(await first(app.db, 'SELECT 1 AS found FROM revoked_tokens WHERE token_hash=?', [tokenHash(app.token)]), 'the signed-out token must be in the denylist');
    assert.equal((await app.json('/auth/me')).status, 401);
    assert.equal((await app.json(`/progress/${app.learnerId}`)).status, 401);
  } finally {
    await app.close();
  }
});

test('quiz and lesson payloads carry no answer key', async () => {
  const app = await start();
  try {
    const payload = await (await app.json('/quizzes?level=L1')).json();
    for (const quiz of payload) {
      assert.equal(Object.hasOwn(quiz, 'answer'), false);
      for (const option of quiz.options) {
        assert.deepEqual(Object.keys(option).sort(), ['emoji', 'label']);
        assert.equal(Object.hasOwn(option, 'correct'), false);
        assert.equal(Object.hasOwn(option, 'itemId'), false);
      }
    }
    assert.ok(payload.length > 0);

    for (const level of ['L1', 'L2', 'L3']) {
      const lessons = await (await app.json(`/lessons?level=${level}`)).json();
      const challenged = lessons.filter(lesson => lesson.challenge);
      assert.ok(challenged.length > 0, `level ${level} has at least one challenge to check`);
      for (const lesson of challenged) {
        assert.equal(Object.hasOwn(lesson.challenge, 'answer'), false);
        for (const option of lesson.challenge.options) {
          assert.deepEqual(Object.keys(option).sort(), ['emoji', 'label']);
          assert.equal(Object.hasOwn(option, 'correct'), false);
        }
      }
    }
  } finally {
    await app.close();
  }
});

test('a quiz answer is graded by position and recorded against the question', async () => {
  const app = await start();
  try {
    const quiz = quizzes.find(question => question.level === 'L1');
    const answerIndex = quiz.options.findIndex(option => option.itemId === quiz.answer);
    const wrongIndex = quiz.options.findIndex(option => option.itemId !== quiz.answer);

    const wrong = await (await app.json('/progress/attempt', {
      method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, quizId: quiz.id, selectedOptionIndex: wrongIndex, sessionId: randomUUID() })
    })).json();
    assert.equal(wrong.correct, false);
    assert.equal(wrong.correctOptionIndex, answerIndex, 'the server reveals the right position only after the child has tried');

    const right = await (await app.json('/progress/attempt', {
      method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, quizId: quiz.id, selectedOptionIndex: answerIndex, sessionId: randomUUID() })
    })).json();
    assert.equal(right.correct, true);

    const stored = await all(app.db, 'SELECT item_id FROM attempts WHERE learner_id=? ORDER BY id', [app.learnerId]);
    assert.deepEqual(stored.map(row => row.item_id), [quiz.id, quiz.id], 'both tries count toward the same question');
  } finally {
    await app.close();
  }
});

test('a lesson challenge is graded on the server', async () => {
  const app = await start();
  try {
    const lesson = curriculumLessons.find(item => item.level === 'L1' && item.challenge);
    const answerIndex = lesson.challenge.options.findIndex(option => option.correct);
    const wrongIndex = lesson.challenge.options.findIndex(option => !option.correct);

    const wrong = await (await app.json(`/lessons/${lesson.id}/challenge`, {
      method: 'POST', body: JSON.stringify({ selectedOptionIndex: wrongIndex })
    })).json();
    assert.equal(wrong.correct, false);
    assert.equal(wrong.correctOptionIndex, answerIndex);

    const right = await (await app.json(`/lessons/${lesson.id}/challenge`, {
      method: 'POST', body: JSON.stringify({ selectedOptionIndex: answerIndex })
    })).json();
    assert.equal(right.correct, true);

    assert.equal((await app.json('/lessons/no-such-lesson/challenge', { method: 'POST', body: '{"selectedOptionIndex":0}' })).status, 404);

    const anonymous = await fetch(`${app.base}/lessons/${lesson.id}/challenge`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selectedOptionIndex: answerIndex })
    });
    assert.equal(anonymous.status, 401, 'a signed-out visitor must not be able to ask the server for the right answer');
  } finally {
    await app.close();
  }
});

test('practising a word outside the learner level is refused', async () => {
  const app = await start();
  try {
    const l2Word = (await (await app.json('/vocabulary?level=L2')).json())[0];
    for (const route of ['/progress/practice', '/progress/listen']) {
      const refused = await app.json(route, { method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, itemId: l2Word.id }) });
      assert.equal(refused.status, 409, `${route} must not credit an out-of-level word`);
      assert.match((await refused.json()).error, /Level/i);
    }
    const practiced = await first(app.db, 'SELECT COUNT(*) AS count FROM word_practices WHERE learner_id=?', [app.learnerId]);
    assert.equal(Number(practiced.count), 0);

    const unknown = await app.json('/progress/practice', { method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, itemId: 'not-a-word' }) });
    assert.equal(unknown.status, 404);
  } finally {
    await app.close();
  }
});

test('a learner belonging to another caregiver is not reachable', async () => {
  const app = await start();
  try {
    for (const [method, path, body] of [
      ['GET', `/progress/${app.otherLearnerId}`],
      ['POST', '/progress/practice', JSON.stringify({ learnerId: app.otherLearnerId, itemId: 'cat' })],
      ['POST', '/progress/level', JSON.stringify({ learnerId: app.otherLearnerId, level: 'L3' })]
    ]) {
      const response = await app.json(path, { method, body });
      assert.equal(response.status, 403, `${method} ${path}`);
    }
    assert.equal((await first(app.db, 'SELECT level FROM learners WHERE id=?', [app.otherLearnerId])).level, 'L1');
  } finally {
    await app.close();
  }
});

test('an unknown API route answers as an API, not as the single-page app', async () => {
  const app = await start();
  try {
    const response = await app.json('/does-not-exist');
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal((await response.json()).error, 'That endpoint does not exist.');

    const page = await fetch(`${app.base.replace('/api', '')}/some/client/route`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
  } finally {
    await app.close();
  }
});

test('a malformed or oversized request is reported as the caller error it is', async () => {
  const app = await start();
  try {
    const malformed = await app.json('/chat', { method: 'POST', body: '{"learnerId":' });
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /did not look right/i);

    const oversized = await app.json('/chat', {
      method: 'POST',
      body: JSON.stringify({ learnerId: app.learnerId, message: 'a'.repeat(40_000) })
    });
    assert.equal(oversized.status, 413);
    assert.match((await oversized.json()).error, /too long/i);
  } finally {
    await app.close();
  }
});

test('resetting progress returns the fresh level so the caregiver screen resyncs', async () => {
  const app = await start();
  try {
    const listened = await app.json('/progress/listen', { method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, itemId: 'cat' }) });
    assert.equal(listened.status, 200);
    const raised = await app.json('/progress/level', { method: 'POST', body: JSON.stringify({ learnerId: app.learnerId, level: 'L2' }) });
    assert.equal(raised.status, 200);

    const reset = await app.json('/progress/reset', { method: 'POST', headers: { 'x-learner-id': app.learnerId }, body: '{}' });
    assert.equal(reset.status, 200);
    const progress = await reset.json();
    assert.equal(progress.level, 'L1');
    assert.equal(progress.stars, 0);
    assert.equal(progress.practicedWords, 0);

    const foreign = await app.json('/progress/reset', { method: 'POST', headers: { 'x-learner-id': app.otherLearnerId }, body: '{}' });
    assert.equal(foreign.status, 403);
  } finally {
    await app.close();
  }
});
