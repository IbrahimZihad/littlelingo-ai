import vocabulary from '../data/vocabulary.json' with { type: 'json' };
import { detectMode } from './mode-detection.service.js';
import { safetyReply } from './safety.service.js';
export function fallbackReply(message, context={}) {
 const detected=detectMode(message,context);const mode=detected.mode;const m=String(message||'').toLowerCase();
 let reply;
 if(mode==='SAFETY_REDIRECT') reply=safetyReply();
 else if(mode==='EMOTIONAL_SUPPORT') {
  const support={
   sad:"Thanks for telling me. It is okay to feel sad. Would you like to talk, take a slow breath, or find a trusted grown-up?",
   scared:"That sounds scary. You are not alone. Please tell a trusted grown-up. Would you like to stay with me while you find them?",
   afraid:"That sounds scary. You are not alone. Please tell a trusted grown-up. Would you like to stay with me while you find them?",
   worried:"It is okay to feel worried. A trusted grown-up can listen and help. Would you like to tell them together?",
   anxious:"It is okay to feel worried. A trusted grown-up can listen and help. Would you like to tell them together?",
   angry:"It is okay to feel angry. Let’s pause and take one slow breath. What might help you feel calm?",
   mad:"It is okay to feel angry. Let’s pause and take one slow breath. What might help you feel calm?",
   frustrated:"Some things feel tricky at first. Your effort matters. Would you like a tiny hint or a short break?",
   lonely:"Thank you for telling me. You deserve kindness. Could you talk with a trusted grown-up or friend?",
   embarrassed:"It is okay to make mistakes. Everyone is learning. Would you like to try again together?",
   tired:"It is okay to feel tired. A quiet rest can help. Would you like to pause for a little while?",
   confused:"It is okay to feel confused. We can go one small step at a time. What part should we look at together?"
  };
  reply=support[detected.mood]||"Thank you for telling me. It is okay to have big feelings. Would you like to talk or take a slow breath together?";
 }
 else if(mode==='CELEBRATION') reply="You kept trying, and you did it! 🌟 You can feel proud of your effort. What was your favorite part?";
 else if(mode==='ENGAGEMENT') reply=/\b(bored|fun|game|play|guess|riddle)\b/.test(m)?"Let's play a guessing game! 🐻 I am thinking of a fruit that can be red or green. What is it?":"Once upon a time, a tiny bird found a shiny blue button. Where do you think it went?";
 else if(mode==='CONVERSATION'&&['happy','excited','proud','calm'].includes(detected.mood)) reply=`You said you feel ${detected.mood}! That is lovely. What would you like to tell me about it?`;
 else if(mode==='LEARNING'&&/\b(color|colour)\b/.test(m)) reply="Let's explore colors! ❤️ Red, 💙 blue, 💛 yellow, and 💚 green. Which color do you like?";
 else if(mode==='LEARNING'&&/\b(practice|say it|use it in a simple sentence)\b/.test(m)) {
  const match=String(message||'').match(/(?:practice (?:the )?word|practice)\s+([a-z]+)\b/i);
  const word=match ? match[1] : null;
  if(word) {
   const examples={cat:'The cat is cute.',dog:'The dog can run.',bird:'The bird can fly.',fish:'The fish can swim.',apple:'I eat an apple.',ball:'I play with a ball.'};
   const sentence=examples[word.toLowerCase()] || `I see a ${word.toLowerCase()}.`;
   reply=`Great job! 🌟 The word is “${word}.” Say it with me: ${word}. Now try this sentence: “${sentence}” Can you say it?`;
  } else reply='Let’s practice together! Say the word slowly, then use it in a short sentence. What word shall we try?';
 }
 else if(mode==='LEARNING') { const level=context.level||'L1';const levelWords=vocabulary.filter(item=>level==='L3'||item.level===level);const practiced=new Set(context.learningHistory?.recentWords||[]);const freshWords=levelWords.filter(item=>!practiced.has(item.word));const choices=freshWords.length?freshWords:levelWords;const item=choices[Math.floor(Math.random()*choices.length)]||vocabulary[0];reply=`Let's learn a word! ${item.emoji} ${item.word}. ${item.sentence} Can you say ${item.word}?`; }
 else if(/\b(hello|hi|hey)\b/.test(m)) reply="Hello! 😊 What would you like to talk about today?";
 else if(/\b(thank you|thanks)\b/.test(m)) reply="You're welcome! 🌟 I enjoyed chatting with you.";
 else if(/\b(my name|your name)\b/.test(m)) reply="You can call me Buddy! What would you like to talk about?";
 else if(/\b(cat|dog|bird|fish|animal)\b/.test(m)) reply="You noticed an animal! What do you like about it?";
 else reply="That sounds interesting! 😊 What would you like to tell me about it?";
 return {mode,message:reply,suggestedActivity:mode==='ENGAGEMENT'?'Play a guessing game':null,learningFeedback:null};
}
