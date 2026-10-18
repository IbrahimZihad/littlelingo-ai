import test from 'node:test';
import assert from 'node:assert/strict';
import { askGemini } from '../src/services/gemini.service.js';

test('Gemini requests signal local fallback when no API key is configured', async () => {
  const configuredKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    assert.equal(await askGemini('Hello, Buddy!', {}), null);
  } finally {
    if (configuredKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = configuredKey;
  }
});
