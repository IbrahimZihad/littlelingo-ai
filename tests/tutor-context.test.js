import test from 'node:test';
import assert from 'node:assert/strict';
import { getTutorCurriculumContext } from '../src/data/curriculum.js';
import { fallbackReply } from '../src/services/fallback.service.js';

test('Buddy curriculum context derives valid lessons and words from curriculum IDs', () => {
  const context = getTutorCurriculumContext({
    level: 'L1',
    lessonId: 'animal-names',
    itemId: 'cat',
    topic: 'animals',
    message: 'Help me learn about a cat.'
  });

  assert.equal(context.activeLesson.title, 'Animal Friends');
  assert.equal(context.activeWord.word, 'Cat');
  assert.ok(context.focusWords.some(item => item.word === 'Cat'));
  assert.ok(context.lessons.every(lesson => !('challenge' in lesson)));
});

test('Buddy ignores lesson and item IDs that do not belong to the learner level', () => {
  const context = getTutorCurriculumContext({
    level: 'L1',
    lessonId: 'fox-and-pond',
    itemId: 'story-fox',
    topic: 'reading',
    message: 'Tell me about the fox.'
  });

  assert.equal(context.activeLesson, null);
  assert.equal(context.activeWord, null);
  assert.equal(context.level, 'L1');
  assert.ok(context.focusWords.every(item => item.category !== 'reading'));
});

test('local fallback uses the selected learning material instead of a generic reply', () => {
  const response = fallbackReply('Help me practice this.', {
    level: 'L1',
    activeWord: { word: 'Cat', example: 'The cat is cute.' }
  });

  assert.match(response.message, /Cat/);
  assert.match(response.message, /cat/i);
});

test('local fallback responds with a relevant curriculum example in conversation mode', () => {
  const response = fallbackReply('Tell me about a cat.', { level: 'L1' });

  assert.match(response.message, /Cat/);
  assert.match(response.message, /This is a cat/);
});

test('local fallback answers broad conversation prompts with a concrete child-friendly fact', () => {
  const response = fallbackReply('Tell me about anything.');

  assert.match(response.message, /seed/i);
  assert.doesNotMatch(response.message, /That sounds interesting/);
});

test('local fallback answers a requested curriculum topic instead of switching subjects', () => {
  const response = fallbackReply('Tell me about numbers.', {
    level: 'L1',
    curriculum: getTutorCurriculumContext({
      level: 'L1',
      topic: 'all',
      message: 'Tell me about numbers.'
    })
  });

  assert.match(response.message, /numbers help us count/i);
  assert.match(response.message, /one to ten/i);
  assert.doesNotMatch(response.message, /seed/i);
});

test('local fallback connects a short topic follow-up to the previous child request', () => {
  const response = fallbackReply('numbers', {
    level: 'L2',
    recentTurns: [
      { role: 'child', text: 'Tell me about numbers.' },
      { role: 'buddy', text: 'Did you know a seed can grow?' },
      { role: 'child', text: 'numbers' }
    ]
  });

  assert.match(response.message, /numbers help us count/i);
  assert.match(response.message, /one to one hundred/i);
  assert.doesNotMatch(response.message, /That sounds interesting/);
});
