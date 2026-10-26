import test from 'node:test';
import assert from 'node:assert/strict';
import { askGemini, resetGeminiHealth, geminiHealth } from '../src/services/gemini.service.js';

const withEnvironment = async (values, run) => {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  resetGeminiHealth();
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = originalFetch;
    resetGeminiHealth();
  }
};

const jsonReply = (payload) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }]
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

const tutorPayload = {
  mode: 'LEARNING',
  message: 'A cat is a small pet. Can you say cat?',
  suggestedActivity: null,
  learningFeedback: null
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
      return jsonReply(tutorPayload);
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
    assert.match(prompt, /<untrusted_child_content>/, 'child text must be fenced as untrusted content');
    assert.equal(request.body.generationConfig.maxOutputTokens, 512);
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, 0);
    assert.ok(request.body.generationConfig.responseSchema, 'structured output keeps the model from replying in prose');
  });
});

test('Gemini uses a thinking level instead of a token budget on Gemini 3 models', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' }, async () => {
    let request;
    globalThis.fetch = async (url, options) => {
      request = { body: JSON.parse(options.body) };
      return jsonReply(tutorPayload);
    };
    await askGemini('Tell me about cats.', {});
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, undefined);
  });
});

test('a fenced model reply is parsed', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' }, async () => {
    globalThis.fetch = async () => jsonReply(`Here is the answer:\n\`\`\`json\n${JSON.stringify(tutorPayload)}\n\`\`\``);
    const result = await askGemini('Tell me about cats.', {});
    assert.equal(result.status, 'ready');
    assert.equal(result.response.mode, 'LEARNING');
  });
});

test('learning feedback from the model is kept and bounded', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' }, async () => {
    globalThis.fetch = async () => jsonReply({ ...tutorPayload, learningFeedback: 'Great blending!' });
    const result = await askGemini('Help me practice cat.', {});
    assert.equal(result.response.learningFeedback, 'Great blending!');
  });
});

test('a model reply that asks for personal details is rejected', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' }, async () => {
    globalThis.fetch = async () => jsonReply({ mode: 'CONVERSATION', message: 'What is your full name and address?' });
    assert.deepEqual(await askGemini('Hello.', {}), { response: null, status: 'invalid_response' });
  });
});

test('invalid Gemini content requests the local fallback', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-2.0-flash' }, async () => {
    globalThis.fetch = async () => jsonReply('not json');
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

test('a saturated provider is retried once before falling back', async () => {
  await withEnvironment({ GEMINI_API_KEY: 'test-key', GEMINI_MODEL: 'gemini-3.1-flash-lite' }, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls === 1
        ? new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 })
        : jsonReply(tutorPayload);
    };
    const result = await askGemini('Tell me about cats.', {});
    assert.equal(calls, 2);
    assert.equal(result.status, 'ready');
    assert.equal(geminiHealth().recentFailures, 0);
  });
});

test('the circuit breaker stops hammering a failing provider', async () => {
  await withEnvironment({
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    AI_TIMEOUT_MS: '300',
    GEMINI_BREAKER_COOLDOWN_MS: '60000'
  }, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 });
    };
    for (let i = 0; i < 3; i += 1) assert.equal((await askGemini('Teach me a word.', {})).status, 'provider_error');
    const callsAtOpen = calls;

    const blocked = await askGemini('Teach me a word.', {});
    assert.equal(blocked.status, 'unavailable');
    assert.equal(calls, callsAtOpen, 'an open breaker must not send more provider requests');
    assert.ok(geminiHealth().cooldownRemainingMs > 0);
  });
});

// Measured against the live account: three of eight turns succeeded, so a strictly
// consecutive streak was reset before it ever reached the threshold and every child
// kept paying the full timeout for a provider that was already known to be flaky.
test('a provider that fails between successes still trips the breaker', async () => {
  await withEnvironment({
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    AI_TIMEOUT_MS: '300',
    GEMINI_BREAKER_COOLDOWN_MS: '60000'
  }, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls % 2 === 1
        ? new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 })
        : jsonReply(tutorPayload);
    };
    // fail, succeed, fail, succeed, fail
    for (let i = 0; i < 5; i += 1) await askGemini('Teach me a word.', {});
    assert.equal(geminiHealth().cooldownRemainingMs > 0, true, 'interleaved successes must not reset the failure window');

    const callsAtOpen = calls;
    assert.equal((await askGemini('Teach me a word.', {})).status, 'unavailable');
    assert.equal(calls, callsAtOpen);
  });
});

test('a failed recovery probe re-opens the breaker without a fresh threshold', async () => {
  await withEnvironment({
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    AI_TIMEOUT_MS: '300',
    GEMINI_BREAKER_COOLDOWN_MS: '40',
    GEMINI_BREAKER_WINDOW_MS: '60000'
  }, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 });
    };
    for (let i = 0; i < 3; i += 1) await askGemini('Teach me a word.', {});
    assert.equal(geminiHealth().cooldownRemainingMs > 0, true);

    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal((await askGemini('Teach me a word.', {})).status, 'provider_error', 'one request is allowed after the cooldown');
    assert.equal(geminiHealth().cooldownRemainingMs > 0, true, 'the failed probe must immediately re-open the breaker');

    const callsAtOpen = calls;
    assert.equal((await askGemini('Teach me a word.', {})).status, 'unavailable');
    assert.equal(calls, callsAtOpen);
  });
});

test('a successful recovery probe clears the breaker state', async () => {
  await withEnvironment({
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    AI_TIMEOUT_MS: '300',
    GEMINI_BREAKER_COOLDOWN_MS: '40',
    GEMINI_BREAKER_WINDOW_MS: '60000'
  }, async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return calls <= 3
        ? new Response(JSON.stringify({ error: { code: 503, message: 'high demand' } }), { status: 503 })
        : jsonReply(tutorPayload);
    };
    for (let i = 0; i < 3; i += 1) await askGemini('Teach me a word.', {});
    await new Promise(resolve => setTimeout(resolve, 60));

    assert.equal((await askGemini('Teach me a word.', {})).status, 'ready');
    assert.equal(geminiHealth().cooldownRemainingMs, 0);
    assert.equal(geminiHealth().recentFailures, 0, 'a recovered provider must not stay counted as failing');
  });
});
