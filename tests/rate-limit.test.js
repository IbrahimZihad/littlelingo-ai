import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/services/auth.service.js';
import { openTestDatabase, closeTestDatabase, seed, dispose, write } from './helpers/database.js';

const start = async (env = {}) => {
  const db = await openTestDatabase();
  const previous = new Map(Object.keys(env).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  const server = createApp(db).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  return {
    db, server, base: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      await new Promise(resolve => server.close(resolve));
      await closeTestDatabase(db);
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
};

// The authenticated limits below need a real learner, but the bucket counters do not, so
// each case seeds its own account and deletes it again.
const seedAccount = async db => {
  const account = await seed(db, { level: 'L1' });
  return { ...account, headers: { authorization: `Bearer ${issueToken(account.caregiverId)}`, 'content-type': 'application/json' } };
};
const dropAccount = async (db, account) => {
  await dispose(db, account);
  await write(db, 'DELETE FROM revoked_tokens WHERE expires_at<?', [Math.floor(Date.now() / 1000)]);
};

const statusCounts = async (url, requests, init = {}) => {
  const counts = {};
  for (let i = 0; i < requests; i += 1) {
    const response = await fetch(url, init);
    counts[response.status] = (counts[response.status] || 0) + 1;
  }
  return counts;
};

test('the app trusts one proxy hop so visitors are not merged into one bucket', () => {
  const app = createApp({ query: () => { throw new Error('reading the database is not part of this assertion'); } });
  assert.equal(app.get('trust proxy'), 1);
});

test('platform health polling never exhausts the interactive API budget', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: 5 });
  try {
    const health = await statusCounts(`${running.base}/api/health`, 20);
    assert.deepEqual(health, { 200: 20 }, 'health checks must not be throttled by the /api limit');

    const lessons = await statusCounts(`${running.base}/api/lessons`, 5);
    assert.deepEqual(lessons, { 200: 5 }, 'the interactive budget is untouched by health polling');
  } finally {
    await running.close();
  }
});

test('word practice and listening are not throttled by the interactive API budget', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: 5 });
  try {
    const account = await seedAccount(running.db);
    try {
      const counts = await statusCounts(`${running.base}/api/progress/practice`, 40, {
        method: 'POST', headers: account.headers, body: JSON.stringify({ learnerId: account.learnerId, itemId: 'cat' })
      });
      assert.deepEqual(counts, { 200: 40 }, 'a child tapping cards must not hit 429 mid-lesson');

      const listen = await statusCounts(`${running.base}/api/progress/listen`, 40, {
        method: 'POST', headers: account.headers, body: JSON.stringify({ learnerId: account.learnerId, itemId: 'cat' })
      });
      assert.deepEqual(listen, { 200: 40 });
    } finally {
      await dropAccount(running.db, account);
    }
  } finally {
    await running.close();
  }
});

test('the default interactive budget covers a full word-explorer session', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: undefined });
  try {
    // Loading a level plus practising every word in it must fit in one window.
    const requests = 1 + 66 + 20;
    const lessons = await statusCounts(`${running.base}/api/lessons?level=L1`, requests);
    assert.deepEqual(lessons, { 200: requests }, `expected the default limit to be at least ${requests} per minute`);
  } finally {
    await running.close();
  }
});

test('interactive API requests are still rate limited per client', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: 3 });
  try {
    const counts = await statusCounts(`${running.base}/api/lessons`, 8);
    assert.deepEqual(counts, { 200: 3, 429: 5 });
  } finally {
    await running.close();
  }
});

test('a 429 is returned as JSON the child-facing app can read', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: 1 });
  try {
    await fetch(`${running.base}/api/lessons`);
    const throttled = await fetch(`${running.base}/api/lessons`);
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.match((await throttled.json()).error, /wait/i);
  } finally {
    await running.close();
  }
});

test('a forwarded client address is used for the rate limit key', async () => {
  const running = await start({ RATE_LIMIT_MAX_REQUESTS: 3 });
  try {
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${running.base}/api/lessons`, { headers: { 'x-forwarded-for': '203.0.113.7' } });
    }
    const exhausted = await fetch(`${running.base}/api/lessons`, { headers: { 'x-forwarded-for': '203.0.113.7' } });
    const otherVisitor = await fetch(`${running.base}/api/lessons`, { headers: { 'x-forwarded-for': '198.51.100.4' } });
    assert.equal(exhausted.status, 429);
    assert.equal(otherVisitor.status, 200, 'a different visitor must get their own budget');
  } finally {
    await running.close();
  }
});
