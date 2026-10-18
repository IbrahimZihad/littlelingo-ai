const moodPattern = /\b(?:i am|i'm|i feel|feeling|feel)\s+(?:so |very |a little )?(happy|sad|scared|afraid|worried|anxious|angry|mad|frustrated|lonely|embarrassed|tired|calm|excited|proud|confused|bored)\b/i;
const supportPattern = /\b(?:i (?:can't|cannot|don't understand|give up|feel stuck)|this is (?:hard|too hard)|i failed|nobody likes me|i feel (?:sad|scared|afraid|worried|anxious|angry|mad|frustrated|lonely|embarrassed|tired|confused))\b/i;
const supportMoods = new Set(['sad','scared','afraid','worried','anxious','angry','mad','frustrated','lonely','embarrassed','tired','confused']);
const safetyPattern = /\b(?:kill myself|hurt myself|hurt someone|weapon|poison|secret from my parents|being hurt|someone (?:is )?hurting me|someone hurt me)\b/i;
const celebrationPattern = /\b(?:i did it|i got it|i learned|i finished|i can do it|i'm proud|i am proud|yay|hooray|i got it right)\b/i;
const engagementPattern = /\b(?:game|play|bored|fun|guess|riddle|let's play|lets play|tell me a story)\b/i;
const learningPattern = /\b(?:teach me|learn(?: about)?|practice|what is|what does .+ mean|how do you say|help me spell|quiz me|show me how)\b/i;

export function detectMode(message) {
 const text=String(message||'').trim();
 const moodMatch=text.match(moodPattern);
 const mood=moodMatch?.[1]?.toLowerCase()||null;
 if(safetyPattern.test(text)) return {mode:'SAFETY_REDIRECT',mood,confidence:0.98,reason:'matched a safety cue'};
 if(supportPattern.test(text)||supportMoods.has(mood)) return {mode:'EMOTIONAL_SUPPORT',mood:mood||'frustrated',confidence:0.85,reason:'the child expressed distress or difficulty'};
 if(celebrationPattern.test(text)) return {mode:'CELEBRATION',mood:mood||'proud',confidence:0.84,reason:'the child shared a success'};
 if(engagementPattern.test(text)) return {mode:'ENGAGEMENT',mood:mood==='bored'?'bored':mood,confidence:0.8,reason:'the child asked for play or engagement'};
 if(learningPattern.test(text)) return {mode:'LEARNING',mood,confidence:0.82,reason:'the child asked for learning help'};
 return {mode:'CONVERSATION',mood,confidence:0.6,reason:mood?'the child shared a feeling':'safe conversational default'};
}
