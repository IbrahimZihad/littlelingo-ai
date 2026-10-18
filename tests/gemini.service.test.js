import test from 'node:test';
import assert from 'node:assert/strict';
import { askGemini } from '../src/services/gemini.service.js';

const withEnvironment = async (values, run) => {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
  }
};

test('Gemini reports when no API key is configured', async () => {
  await withEnvironment({ GEMINI_API_KEY: null }, async () => {
    assert.deepEqual(await askGemini('Hello, Buddy!', {}), {
      response: null,
      status: 'not_configured'
    });
  });
});

test('Gemini sends bounded curriculum context and returns a validated AI response', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key-never-sent-to-a-provider', GEMINI_MODEL: 'gemini-2.5-flash' }, async () => {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { url: String(url), body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                mode: 'LEARNING',
                message: 'A cat is a small pet. Can you say cat?',
                suggestedActivity: null,
                learningFeedback: null
              })
            }]
          }
        }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await askGemini('Help me practice cat.', {
      level: 'L1',
      detectedMode: 'LEARNING',
      activeLesson: { title: 'Animal Friends' },
      activeWord: { word: 'Cat', example: 'The cat is cute.' },
      focusWords: [{ word: 'Cat', example: 'The cat is cute.' }]
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.response.message, 'A cat is a small pet. Can you say cat?');
    const prompt = request.body.contents[0].parts[0].text;
    assert.match(prompt, /Animal Friends/);
    assert.match(prompt, /The cat is cute/);
    assert.equal(request.body.generationConfig.maxOutputTokens, 256);
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, 0);
  });
});

test('invalid Gemini content requests the local fallback', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-2.0-flash' }, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'not json' }] } }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    assert.deepEqual(await askGemini('Teach me a word.', {}), {
      response: null,
      status: 'invalid_response'
    });
  });
});

test('a timed-out Gemini request requests the local fallback', async () => {
  await withEnvironment({
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-2.0-flash',
    AI_TIMEOUT_MS: '5'
  }, async () => {
    globalThis.fetch = () => new Promise(() => {});
    const result = await askGemini('Teach me a word.', {});
    assert.equal(result.response, null);
    assert.equal(result.status, 'timeout');
  });
});
