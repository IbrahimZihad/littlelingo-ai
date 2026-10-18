import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { issueToken } from '../src/services/auth.service.js';

test('chat route returns curriculum-aware fallback and safe AI status when Gemini is not configured', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/database/schema.sql', import.meta.url), 'utf8'));
  const caregiverId = randomUUID();
  const learnerId = randomUUID();
  db.prepare('INSERT INTO caregivers(id, email, password_hash) VALUES(?, ?, ?)').run(
    caregiverId,
    `${caregiverId}@example.test`,
    'test'
  );
  db.prepare('INSERT INTO learners(id, caregiver_id) VALUES(?, ?)').run(learnerId, caregiverId);
  const server = createApp(db).listen(0);

  try {
    await new Promise(resolve => server.once('listening', resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${issueToken(caregiverId)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        learnerId,
        message: 'Help me practice this.',
        context: {
          level: 'L1',
          lessonId: 'animal-names',
          itemId: 'cat',
          currentTopic: 'animals'
        }
      })
    });

    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.source, 'fallback');
    assert.equal(result.aiStatus, 'not_configured');
    assert.match(result.message, /Cat/);
    assert.match(result.message, /cat/i);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    db.close();
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
