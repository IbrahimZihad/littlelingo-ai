const unsafePatterns = [/(how to|tell me how to).{0,35}(hurt|harm|kill|weapon|poison)/i, /\b(sex|porn|nude|naked pictures)\b/i];
export function isUnsafe(text) { return unsafePatterns.some((p) => p.test(String(text || ''))); }
export function safeText(text, max=350) { return String(text ?? '').replace(/[<>]/g, '').slice(0,max).trim(); }
export function safetyReply() { return "I can't help with that. If something feels unsafe, please talk to a trusted grown-up who can help you."; }
export function validateTutorResponse(data) {
  const modes=['LEARNING','CONVERSATION','ENGAGEMENT','EMOTIONAL_SUPPORT','CELEBRATION','SAFETY_REDIRECT'];
  if (!data || typeof data !== 'object' || !modes.includes(data.mode) || typeof data.message !== 'string') return null;
  const message=safeText(data.message, 280);
  if (!message || isUnsafe(message)) return null;
  return {mode:data.mode,message,suggestedActivity: typeof data.suggestedActivity==='string' ? safeText(data.suggestedActivity,100) : null,learningFeedback:null};
}
