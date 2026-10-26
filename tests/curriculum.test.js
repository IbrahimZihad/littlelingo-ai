import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/services/auth.service.js';
import { vocabulary, curriculumLessons, curriculumTopic } from '../src/data/curriculum.js';
import { openTestDatabase, closeTestDatabase } from './helpers/database.js';

async function start() {
  const db = await openTestDatabase();
  const originalSecret = process.env.AUTH_SECRET;
  const originalRateLimit = process.env.RATE_LIMIT_MAX_REQUESTS;
  process.env.AUTH_SECRET = 'curriculum-test-secret';
  process.env.RATE_LIMIT_MAX_REQUESTS = '5000';
  const server = createApp(db).listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = issueToken(randomUUID());
  const json = path => fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return {
    json,
    async close() {
      server.close();
      await once(server, 'close');
      await closeTestDatabase(db);
      if (originalSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = originalSecret;
      if (originalRateLimit === undefined) delete process.env.RATE_LIMIT_MAX_REQUESTS; else process.env.RATE_LIMIT_MAX_REQUESTS = originalRateLimit;
    }
  };
}

test('every lesson has enough word cards to fill its grid', () => {
  for (const lesson of curriculumLessons) {
    const cards = vocabulary.filter(word => word.level === lesson.level && word.category === lesson.category);
    assert.ok(cards.length >= 4, `${lesson.id} has only ${cards.length} ${lesson.category} cards at ${lesson.level}`);
  }
});

test('lesson records are complete and levelled', () => {
  assert.equal(new Set(curriculumLessons.map(lesson => lesson.id)).size, curriculumLessons.length);
  for (const lesson of curriculumLessons) {
    assert.ok(['L1', 'L2', 'L3'].includes(lesson.level), `${lesson.id} has an unknown level`);
    assert.ok(lesson.title.trim().length > 0 && lesson.description.trim().length > 0, `${lesson.id} needs a title and description`);
    assert.ok(lesson.category.trim().length > 0, `${lesson.id} needs a category`);
  }
});

test('each challenge has one answer among three distinct options', () => {
  for (const lesson of curriculumLessons.filter(item => item.challenge)) {
    const { prompt, options } = lesson.challenge;
    assert.ok(prompt.trim().length > 0, `${lesson.id} has an empty challenge prompt`);
    assert.equal(options.length, 3, `${lesson.id} needs three challenge options`);
    assert.equal(options.filter(option => option.correct).length, 1, `${lesson.id} needs exactly one correct option`);
    assert.equal(new Set(options.map(option => option.label)).size, 3, `${lesson.id} repeats a challenge option`);
    for (const option of options) {
      assert.ok(option.label.trim().length > 0 && option.emoji.trim().length > 0, `${lesson.id} has an option without a label or emoji`);
    }
  }
});

test('a child can ask Buddy for any lesson category by name', () => {
  for (const lesson of curriculumLessons) {
    assert.equal(curriculumTopic(lesson.category), lesson.category, `${lesson.category} does not round-trip through the topic matcher`);
  }
});

test('the lessons API serves the family, feelings, toy, action, everyday and nature lessons', async () => {
  const app = await start();
  try {
    const expected = {
      L1: ['family-people', 'feelings-names'],
      L2: ['toy-box', 'action-words', 'everyday-things', 'nature-walk']
    };
    for (const [level, ids] of Object.entries(expected)) {
      const payload = await (await app.json(`/lessons?level=${level}`)).json();
      for (const id of ids) {
        const lesson = payload.find(item => item.id === id);
        assert.ok(lesson, `${id} is missing from /lessons?level=${level}`);
        assert.equal(lesson.level, level);
        assert.equal(Object.hasOwn(lesson.challenge, 'answer'), false);
        for (const option of lesson.challenge.options) {
          assert.deepEqual(Object.keys(option).sort(), ['emoji', 'label']);
        }
      }
    }
  } finally {
    await app.close();
  }
});
