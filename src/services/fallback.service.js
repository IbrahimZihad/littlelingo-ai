import { curriculumTopic, vocabulary } from '../data/curriculum.js';
import { detectMode } from './mode-detection.service.js';
import { safetyReply } from './safety.service.js';

function findMentionedWord(message, level) {
  const text = String(message || '').toLowerCase();
  // Children say "cats" and "apples"; the curriculum stores the singular card, so an
  // optional trailing s is matched but "catch" still cannot match "cat".
  return vocabulary.find(item => item.level === level && item.word.length > 1
    && new RegExp(`(^|[^a-z0-9])${item.word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?([^a-z0-9]|$)`).test(text));
}

function requestedTopic(message, context) {
  const currentTopic = curriculumTopic(message);
  if (currentTopic) return currentTopic;

  const shortFollowUp = String(message || '').trim().split(/\s+/).length <= 4;
  if (!shortFollowUp) return null;

  for (const turn of [...(context.recentTurns || [])].reverse()) {
    if (turn.role !== 'child') continue;
    const previousTopic = curriculumTopic(turn.text);
    if (previousTopic && /\b(tell me about|what about|more about|learn about|teach me about)\b/i.test(turn.text)) {
      return previousTopic;
    }
  }
  return null;
}

function topicReply(topic, context) {
  const level = context.level || 'L1';
  if (topic === 'numbers') {
    const range = level === 'L1' ? 'one to ten' : level === 'L2' ? 'one to one hundred' : 'numbers in stories';
    return `Numbers help us count! 🌟 In your level, we explore ${range}. Let's count together: one, two, three!`;
  }
  if (topic === 'alphabet') {
    const letters = (context.curriculum?.focusWords || [])
      .filter(item => item.category === 'alphabet')
      .slice(0, 3)
      .map(item => item.word.split(' ')[0])
      .join(', ');
    return `Letters help us read and spell words! ${letters ? `Let's try ${letters}.` : 'Which letter would you like to explore?'}`;
  }

  const words = (context.curriculum?.focusWords || [])
    .filter(item => item.category === topic)
    .slice(0, 3);
  const lesson = (context.curriculum?.lessons || []).find(item => item.category === topic);
  if (words.length) {
    return `Let's explore ${lesson?.title || topic.replace('-', ' ')}! ${words.map(item => `${item.word}: ${item.example}`).join(' ')} Which one do you like?`;
  }
  if (lesson) return `${lesson.title} is about ${lesson.description.toLowerCase()} What would you like to try?`;
  return null;
}

function learningReply(message, context, text) {
  if (/\b(practice|say it|use it in a simple sentence)\b/.test(text)) {
    // The capture is a guess over free text. "practice the word 42 (forty-two)"
    // yields "the", which must fall through to the item already resolved
    // server-side from the submitted itemId rather than be taught as a word.
    const captured = String(message || '').match(/(?:practice (?:the )?word|practice)\s+([a-z]+)\b/i)?.[1];
    const notAVocabularyWord = new Set(['this', 'that', 'it', 'word', 'words', 'the', 'a', 'an', 'number', 'numbers', 'letter', 'letters', 'name', 'sentence', 'new', 'again', 'sound', 'sounds', 'with', 'and', 'to', 'of', 'my']);
    const word = captured && !notAVocabularyWord.has(captured.toLowerCase()) ? captured : null;
    if (word) {
      const examples = { cat: 'The cat is cute.', dog: 'The dog can run.', bird: 'The bird can fly.', fish: 'The fish can swim.', apple: 'I eat an apple.', ball: 'I play with a ball.' };
      const sentence = examples[word.toLowerCase()] || `I see a ${word.toLowerCase()}.`;
      return `Great job! 🌟 The word is “${word}”! Say it with me: ${word}. Now try this sentence: “${sentence}” Can you say it?`;
    }
  }

  const activeWord = context.activeWord;
  const mentionedWord = findMentionedWord(message, context.level || 'L1');
  const item = activeWord
    ? vocabulary.find(word => word.word === activeWord.word && word.level === (context.level || 'L1'))
    : mentionedWord;

  if (item) {
    return `Let's explore ${item.word}! ${item.sentence} Can you say ${item.word}?`;
  }
  // A child who asks for a topic should be taught that topic rather than a word drawn
  // at random from their level.
  const topic = curriculumTopic(message) || curriculumTopic(context.currentTopic);
  if (topic) {
    const taught = topicReply(topic, context);
    if (taught) return taught;
  }
  if (/\b(color|colour)\b/.test(text)) {
    return "Let's explore colors! Red, blue, yellow, and green are bright colors. Which color do you like?";
  }
  if (context.activeLesson) {
    const words = (context.focusWords || []).slice(0, 4);
    const examples = words.map(word => `${word.word}: ${word.example}`).join(' ');
    return examples
      ? `Let's explore ${context.activeLesson.title}! ${examples} Which one shall we try?`
      : `Let's explore ${context.activeLesson.title}! ${context.activeLesson.description} What would you like to try?`;
  }
  const level = context.level || 'L1';
  const levelWords = vocabulary.filter(item => item.level === level);
  const practiced = new Set(context.learningHistory?.recentWords || []);
  const freshWords = levelWords.filter(item => !practiced.has(item.word));
  const choices = freshWords.length ? freshWords : levelWords;
  const itemToTeach = choices[Math.floor(Math.random() * choices.length)] || vocabulary[0];
  return `Let's learn a word! ${itemToTeach.emoji} ${itemToTeach.word}. ${itemToTeach.sentence} Can you say ${itemToTeach.word}?`;
}

export function fallbackReply(message, context = {}) {
  const detected = detectMode(message, context);
  const mode = detected.mode;
  const text = String(message || '').toLowerCase();
  let reply;

  if (mode === 'SAFETY_REDIRECT') reply = safetyReply();
  else if (mode === 'EMOTIONAL_SUPPORT') {
    const support = {
      sad: "Thanks for telling me. It is okay to feel sad. Would you like to talk, take a slow breath, or find a trusted grown-up?",
      scared: "That sounds scary. You are not alone. Please tell a trusted grown-up. Would you like to stay with me while you find them?",
      afraid: "That sounds scary. You are not alone. Please tell a trusted grown-up. Would you like to stay with me while you find them?",
      worried: "It is okay to feel worried. A trusted grown-up can listen and help. Would you like to tell them together?",
      anxious: "It is okay to feel worried. A trusted grown-up can listen and help. Would you like to tell them together?",
      angry: "It is okay to feel angry. Let’s pause and take one slow breath. What might help you feel calm?",
      mad: "It is okay to feel angry. Let’s pause and take one slow breath. What might help you feel calm?",
      frustrated: "Some things feel tricky at first. Your effort matters. Would you like a tiny hint or a short break?",
      lonely: "Thank you for telling me. You deserve kindness. Could you talk with a trusted grown-up or friend?",
      embarrassed: "It is okay to make mistakes. Everyone is learning. Would you like to try again together?",
      tired: "It is okay to feel tired. A quiet rest can help. Would you like to pause for a little while?",
      confused: "It is okay to feel confused. We can go one small step at a time. What part should we look at together?"
    };
    reply = support[detected.mood] || "Thank you for telling me. It is okay to have big feelings. Would you like to talk or take a slow breath together?";
  } else if (mode === 'CELEBRATION') {
    reply = "You kept trying, and you did it! 🌟 You can feel proud of your effort. What was your favorite part?";
  } else if (mode === 'ENGAGEMENT') {
    reply = /\b(bored|fun|game|play|guess|riddle)\b/.test(text)
      ? "Let's play a guessing game! 🐻 I am thinking of a fruit that can be red or green. What is it?"
      : "Once upon a time, a tiny bird found a shiny blue button. Where do you think it went?";
  } else if (mode === 'CONVERSATION' && ['happy', 'excited', 'proud', 'calm'].includes(detected.mood)) {
    reply = `You said you feel ${detected.mood}! That is lovely. What would you like to tell me about it?`;
  } else if (mode === 'LEARNING') {
    reply = learningReply(message, context, text);
  } else if (/\b(hello|hi|hey)\b/.test(text)) {
    reply = "Hello! 😊 What would you like to talk about today?";
  } else if (/\b(thank you|thanks)\b/.test(text)) {
    reply = "You're welcome! 🌟 I enjoyed chatting with you.";
  } else if (/\b(my name|your name)\b/.test(text)) {
    reply = "You can call me Buddy! What would you like to talk about?";
  } else if (context.activeWord) {
    reply = `You are looking at ${context.activeWord.word}. ${context.activeWord.example} What do you notice about it?`;
  } else {
    const topic = requestedTopic(message, context);
    reply = topic ? topicReply(topic, context) : null;
  }
  // A child who names something they are learning about should hear about that thing,
  // whatever mode the message was classified as and whatever the app was about to say.
  if (!reply) {
    const mentionedWord = findMentionedWord(message, context.level || 'L1');
    if (mentionedWord) reply = `${mentionedWord.word}: ${mentionedWord.sentence} What do you think about it?`;
  }
  if (!reply && /\b(anything|something|fun fact|tell me about)\b/.test(text)) {
    reply = "Did you know a tiny seed can grow into a plant with water and sunshine? 🌱 What would you like to discover next?";
  } else if (!reply) {
    reply = "That sounds interesting! 😊 What would you like to tell me about it?";
  }

  return { mode, message: reply, suggestedActivity: mode === 'ENGAGEMENT' ? 'Play a guessing game' : null, learningFeedback: null };
}
