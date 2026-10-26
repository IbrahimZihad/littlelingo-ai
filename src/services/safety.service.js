export const MODES = ['LEARNING', 'CONVERSATION', 'ENGAGEMENT', 'EMOTIONAL_SUPPORT', 'CELEBRATION', 'SAFETY_REDIRECT'];

// Patterns are phrase-shaped on purpose: single words such as "fire" or "kill"
// appear in ordinary child conversation, and a false lockout teaches a child that
// Buddy refuses to help.
const unsafePatterns = [
  /(how to|tell me how to|show me how to|ways to|teach me to).{0,40}\b(hurt|harm|kill|die|weapon|poison|bomb|lock.?up|burn|fire|choke|suffocat)/i,
  /\b(sex|sexual|sexually|porn|pornographic|nude|naked|naked pictures|topless|explicit|private parts|genitals?|strip(?:ping)? game)\b/i,
  /\b(kill myself|end my life|want to die|don'?t want to live|hurt myself|self.?harm|cut myself|overdose)\b/i,
  /\b(hurt|hit|kick|poison|kill)\s+(?:someone|somebody|him|her|them|(?:my|the|his|her)\s+(?:friend|brother|sister|baby|child|kid|boy|girl|mom|mum|dad|teacher|cat|dog|pet))\b/i,
  /\b(pills?|medicine)\s+to\s+(?:make|give|hide|take)\b/i,
  /\b(hide this from|secret from|don'?t tell (?:your|the) (?:parents?|mum|mom|dad|grown-?ups?)|keep (?:it|this) (?:a )?secret|our little secret)\b/i,
  /\b(meet me|come (?:over|to my (?:house|home))|where i live|my address is|pick me up|alone with|my (?:school|classroom) is at)\b/i,
  /\b(cigarette|vaping|vape|alcohol|beer|wine|liquor|weed|marijuana|pills to take)\b/i
];

// A model reply can be well-formed JSON and still be unsafe for a child. These run
// on Buddy's output, where a PII request is a policy violation rather than a
// false-positive risk.
const replyGuards = [
  /\b(what(?:'s| is|’s)?|tell me|can you (?:say|share|give me|type)|send me|i need)\s+(?:your|ur)\s+(?:full |first |last )?(name|address|school|class|phone|password|pin|birthday|photo|picture|location|house|street)\b/i,
  /\b(your (?:full )?name\?|where (?:do|you) (?:live|stay)|which school (?:do )?you)\b/i,
  /\b(do not tell|don'?t tell|keep (?:this|it) secret|it'?s our secret|delete (?:the|this) (?:chat|message))\b/i,
  /\b(i am an adult|you are now|ignore (?:your|previous) (?:rules|instructions)|pretend to be)\b/i
];

export function isUnsafe(text) { return unsafePatterns.some((p) => p.test(String(text || ''))); }
export function isUnsafeReply(text) { return isUnsafe(text) || replyGuards.some((p) => p.test(String(text || ''))); }
export function safeText(text, max=350) { return String(text ?? '').replace(/[<>]/g, '').slice(0,max).trim(); }
export function safetyReply() { return "I can't help with that. If something feels unsafe, please talk to a trusted grown-up who can help you."; }

function boundedFeedback(value) {
  if (typeof value !== 'string') return null;
  const text = safeText(value, 140);
  return text && !isUnsafeReply(text) ? text : null;
}

export function validateTutorResponse(data) {
  if (!data || typeof data !== 'object' || !MODES.includes(data.mode) || typeof data.message !== 'string') return null;
  const message = safeText(data.message, 280);
  if (!message || isUnsafeReply(message)) return null;
  return {
    mode: data.mode,
    message,
    suggestedActivity: typeof data.suggestedActivity === 'string' && !isUnsafeReply(data.suggestedActivity)
      ? safeText(data.suggestedActivity, 100)
      : null,
    learningFeedback: boundedFeedback(data.learningFeedback)
  };
}
