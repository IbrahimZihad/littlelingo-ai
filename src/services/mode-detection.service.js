const rules = [
 ['SAFETY_REDIRECT', /\b(kill|hurt myself|hurt someone|weapon|poison|secret from my parents|being hurt)\b/i],
 ['EMOTIONAL_SUPPORT', /\b(sad|scared|afraid|worried|angry|mad|frustrated|lonely|embarrassed|tired)\b/i],
 ['CELEBRATION', /\b(i did it|i got it|i learned|finished|i can do it|yay|hooray)\b/i],
 ['ENGAGEMENT', /\b(game|play|bored|fun|guess|quiz)\b/i],
 ['LEARNING', /\b(learn|teach|practice|what is|how do you say|word|lesson)\b/i]
];
export function detectMode(message, context={}) {
 const text=String(message||'');
 for(const [mode,re] of rules) if(re.test(text)) return {mode,confidence:0.82,reason:'matched a simple intent cue'};
 if(context.currentActivity) return {mode:'LEARNING',confidence:0.65,reason:'an activity is in progress'};
 return {mode:'CONVERSATION',confidence:0.55,reason:'safe conversational default'};
}
