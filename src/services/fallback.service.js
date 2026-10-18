import vocabulary from '../data/vocabulary.json' with { type: 'json' };
import { detectMode } from './mode-detection.service.js';
import { safetyReply } from './safety.service.js';
export function fallbackReply(message, context={}) {
 const mode=detectMode(message,context).mode; const m=String(message||'').toLowerCase();
 let reply;
 if(mode==='SAFETY_REDIRECT') reply=safetyReply();
 else if(mode==='EMOTIONAL_SUPPORT') reply="Thank you for telling me. It is okay to have big feelings. Would you like to take a slow breath together?";
 else if(/\b(hello|hi|hey)\b/.test(m)) reply="Hello, little learner! 😊 What would you like to explore today?";
 else if(/\b(thank you|thanks)\b/.test(m)) reply="You're welcome! 🌟 I love learning with you.";
 else if(/\b(my name|your name)\b/.test(m)) reply="You can call me Buddy! What shall we learn or talk about?";
 else if(/\b(color|colour)\b/.test(m)) reply="Let's explore colors! ❤️ Red, 💙 blue, 💛 yellow, and 💚 green. Which color do you like?";
 else if(/\b(practice|say it|use it in a simple sentence)\b/.test(m)) {
  const match=String(message||'').match(/(?:practice (?:the )?word|practice)\s+([a-z]+)\b/i);
  const word=match ? match[1] : null;
  if(word) {
   const examples={cat:'The cat is cute.',dog:'The dog can run.',bird:'The bird can fly.',fish:'The fish can swim.',apple:'I eat an apple.',ball:'I play with a ball.'};
   const sentence=examples[word.toLowerCase()] || `I see a ${word.toLowerCase()}.`;
   reply=`Great job! 🌟 The word is “${word}.” Say it with me: ${word}. Now try this sentence: “${sentence}” Can you say it?`;
  } else reply='Let’s practice together! Say the word slowly, then use it in a short sentence. What word shall we try?';
 }
 else if(/\b(animal|cat|dog|bird|fish)\b/.test(m)) reply="Animals are fun to learn about! 🐱 A cat says meow. Which animal do you like?";
 else if(mode==='ENGAGEMENT') reply="Let's play a guessing game! 🐻 I am thinking of a fruit that can be red or green. What is it?";
 else if(mode==='CELEBRATION') reply="Hooray! 🌟 You worked hard and tried your best. Would you like another little challenge?";
 else if(/\b(learn|teach|practice)\b/.test(m)) { const level=context.level||'L1';const levelWords=vocabulary.filter(item=>level==='L3'||item.level===level);const practiced=new Set(context.learningHistory?.recentWords||[]);const freshWords=levelWords.filter(item=>!practiced.has(item.word));const choices=freshWords.length?freshWords:levelWords;const item=choices[Math.floor(Math.random()*choices.length)]||vocabulary[0];reply=`Let's learn a word! ${item.emoji} ${item.word}. ${item.sentence} Can you say ${item.word}?`; }
 else reply="That sounds interesting! 😊 Let's explore together. What would you like to tell me?";
 return {mode,message:reply,suggestedActivity:mode==='ENGAGEMENT'?'Play a guessing game':null,learningFeedback:null};
}
