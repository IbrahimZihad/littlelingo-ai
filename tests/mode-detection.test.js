import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMode } from '../src/services/mode-detection.service.js';
import { fallbackReply } from '../src/services/fallback.service.js';

test('ordinary chat remains conversation even while a learning activity is open', () => {
  assert.equal(detectMode('I saw a butterfly', { currentActivity: 'words' }).mode, 'CONVERSATION');
});

test('explicit requests switch between learning and engagement', () => {
  assert.equal(detectMode('Can you teach me a new word?').mode, 'LEARNING');
  assert.equal(detectMode('I am bored, can we play?').mode, 'ENGAGEMENT');
});

test('detects mood and offers age-appropriate emotional support', () => {
  const detected = detectMode("I'm feeling worried.");
  assert.equal(detected.mode, 'EMOTIONAL_SUPPORT');
  assert.equal(detected.mood, 'worried');
  assert.match(fallbackReply("I'm feeling worried.").message, /trusted grown-up/i);
});

test('celebrates effort and acknowledges positive feelings', () => {
  assert.equal(detectMode('I did it!').mode, 'CELEBRATION');
  assert.match(fallbackReply('I did it!').message, /effort/i);
  assert.match(fallbackReply('I feel happy!').message, /feel happy/i);
});

test('a game request gets a playful response rather than an unsolicited lesson', () => {
  const response = fallbackReply('I am bored. Can we play a game?');
  assert.equal(response.mode, 'ENGAGEMENT');
  assert.match(response.message, /guessing game/i);
  assert.doesNotMatch(response.message, /Let's learn a word/i);
});
