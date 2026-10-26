import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, verifyPassword, issueToken, verifyToken, newId, tokenHash } from './services/auth.service.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vocabulary, curriculumLessons as lessons, quizzes, getTutorCurriculumContext } from './data/curriculum.js';
import { fallbackReply } from './services/fallback.service.js';
import { askGemini, geminiHealth } from './services/gemini.service.js';
import { detectMode } from './services/mode-detection.service.js';
import { isUnsafe, safetyReply } from './services/safety.service.js';
import { getLearnerContext, getProgress, masteryFor } from './services/learning-engine.service.js';
import { compressedAssets } from './services/static-assets.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const LEVELS=['L1','L2','L3'];
const lessonPayload = lesson => {
  if(!lesson?.challenge) return lesson;
  const { prompt, options } = lesson.challenge;
  // The correct flag has to stay on the server: a browser that can render a choice
  // can also read it, so lesson challenges are checked through the verify route.
  return { ...lesson, challenge:{ prompt, options: options.map(({label,emoji})=>({label,emoji})) } };
};
export function createApp(db) {
 const app=express(); app.disable('x-powered-by');
 // Hosting platforms terminate TLS and add one X-Forwarded-For hop. Without this,
 // every visitor is collapsed onto the proxy IP and shares one rate-limit bucket.
 app.set('trust proxy',1);
 app.use(helmet({permissionsPolicy:{directives:{camera:[],microphone:['self'],geolocation:[]}},contentSecurityPolicy:{directives:{defaultSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],objectSrc:["'none'"]}}}));
 app.use(express.json({limit:'12kb'}));
 const rateWindow=Number(process.env.RATE_LIMIT_WINDOW_MS||60000);
 const throttled=(limit,options={})=>rateLimit({windowMs:rateWindow,limit,standardHeaders:true,legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:'Please wait a moment before trying again.'}),...options});
 // Health is polled by the platform and word practice is clicked dozens of times per
 // minute, so neither may consume the interactive budget: a 429 on health reads as an
 // unhealthy instance and a 429 mid-lesson silently stalls the child.
 const limiterExempt=['/health','/progress/practice','/progress/listen'];
 app.use('/api',throttled(Number(process.env.RATE_LIMIT_MAX_REQUESTS||120),{skip:req=>limiterExempt.includes(req.path)}));
 app.use(['/api/progress/practice','/api/progress/listen'],throttled(Number(process.env.LEARNING_ACTIVITY_RATE_LIMIT_MAX_REQUESTS||240)));
 app.get('/api/health',throttled(Number(process.env.HEALTH_RATE_LIMIT_MAX_REQUESTS||120)),(req,res)=>res.json({status:'ok',aiConfigured:Boolean(process.env.GEMINI_API_KEY?.trim()),aiModel:process.env.GEMINI_MODEL?.trim()||undefined,aiCoolingDown:geminiHealth().cooldownRemainingMs>0,timestamp:new Date().toISOString()}));
 const authHeader = req => (req.get('authorization') || '').replace(/^Bearer\s+/i,'');
 // One transaction per write, on a single pooled connection: with the database across
 // the network, statements that must agree can no longer rely on being synchronous.
 const withTransaction = async work => {
  const conn=await db.getConnection();
  try{await conn.beginTransaction();const result=await work(conn);await conn.commit();return result;}
  catch(error){await conn.rollback();throw error;}
  finally{conn.release();}
 };
 const revoke = async token => { const claims=verifyToken(token); if(!claims) return; const now=Math.floor(Date.now()/1000); await db.query('DELETE FROM revoked_tokens WHERE expires_at<?',[now]); await db.query('INSERT IGNORE INTO revoked_tokens(token_hash,expires_at) VALUES(?,?)',[tokenHash(token),claims.exp]); };
 const requireAuth = async (req,res,next) => { const token=authHeader(req); const user=verifyToken(token); if(!user)return res.status(401).json({error:'Please sign in as a caregiver.'}); const [revoked]=await db.query('SELECT 1 FROM revoked_tokens WHERE token_hash=?',[tokenHash(token)]); if(revoked.length)return res.status(401).json({error:'Your sign-in was ended on this device. Please sign in again.'}); req.caregiverId=user.caregiverId; next(); };
 // Returns the learner row only when it belongs to the signed-in caregiver, so the
 // level check and the ownership check cannot drift apart.
 const ownedLearner = async (caregiverId, learnerId) => { const [rows]=await db.query('SELECT id,level FROM learners WHERE id=? AND caregiver_id=?',[learnerId,caregiverId]); return rows[0] || null; };
 const loginAttempts=new Map();
 const attemptLimit=Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS||8);
 app.post('/api/auth/register',async(req,res)=>{const schema=z.object({email:z.string().trim().email().max(254),password:z.string().min(10).max(128)});const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Enter a valid caregiver email and a password with at least 10 characters.'});const email=parsed.data.email.toLowerCase();const [existing]=await db.query('SELECT 1 FROM caregivers WHERE email=?',[email]);if(existing.length)return res.status(409).json({error:'An account with this email already exists. Please sign in.'});const caregiverId=newId(), learnerId=newId(), passwordHash=hashPassword(parsed.data.password);
  // The read above only produces a friendly message; the unique index is what settles
  // two caregivers submitting the same email at the same moment.
  try{await withTransaction(async conn=>{await conn.query('INSERT INTO caregivers(id,email,password_hash) VALUES(?,?,?)',[caregiverId,email,passwordHash]);await conn.query('INSERT INTO learners(id,caregiver_id) VALUES(?,?)',[learnerId,caregiverId]);});}
  catch(error){if(error?.code==='ER_DUP_ENTRY')return res.status(409).json({error:'An account with this email already exists. Please sign in.'});throw error;}
  res.status(201).json({token:issueToken(caregiverId),learnerId,email,expiresIn:604800});});
 app.post('/api/auth/login',async(req,res)=>{const schema=z.object({email:z.string().trim().email().max(254),password:z.string().min(1).max(128)});const parsed=schema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Enter your caregiver email and password.'});const email=parsed.data.email.toLowerCase();const key=`${email}|${req.ip}`;const record=loginAttempts.get(key);if(record&&record.lockedUntil>Date.now())return res.status(429).json({error:'Too many failed sign-in attempts. Please try again in a few minutes.'});const [accounts]=await db.query('SELECT id,email,password_hash FROM caregivers WHERE email=?',[email]);const account=accounts[0];if(!account||!verifyPassword(parsed.data.password,account.password_hash)){const now=Date.now();const next=record&&now-record.first<numberWindow(record) ? {...record,count:record.count+1} : {count:1,first:now};if(next.count>=attemptLimit)next.lockedUntil=now+15*60*1000;loginAttempts.set(key,next);if(loginAttempts.size>1000)loginAttempts.clear();return res.status(401).json({error:'Email or password is incorrect.'});}
  loginAttempts.delete(key);
  const [knownLearners]=await db.query('SELECT id FROM learners WHERE caregiver_id=? ORDER BY created_at LIMIT 1',[account.id]);let learner=knownLearners[0];if(!learner){const id=newId();await db.query('INSERT INTO learners(id,caregiver_id) VALUES(?,?)',[id,account.id]);learner={id};}res.json({token:issueToken(account.id),learnerId:learner.id,email:account.email,expiresIn:604800});});
 const numberWindow=()=>15*60*1000;
 app.get('/api/auth/me',requireAuth,async(req,res)=>{const [accounts]=await db.query('SELECT email FROM caregivers WHERE id=?',[req.caregiverId]);const account=accounts[0];if(!account)return res.status(401).json({error:'Please sign in again.'});const [learners]=await db.query('SELECT id,level,stars,lessons_completed AS lessonsCompleted FROM learners WHERE caregiver_id=? ORDER BY created_at',[req.caregiverId]);res.json({email:account.email,learners});});
 app.post('/api/auth/logout',async(req,res)=>{await revoke(authHeader(req));res.json({ok:true});});
 app.get('/api/lessons',(req,res)=>{const level=LEVELS.includes(req.query.level)?req.query.level:'L1';res.json(lessons.filter(l=>l.level===level).map(lessonPayload));});
 app.get('/api/lessons/:id',(req,res)=>{const lesson=lessons.find(l=>l.id===req.params.id); if(!lesson)return res.status(404).json({error:'Lesson not found'});res.json(lessonPayload(lesson));});
 app.post('/api/lessons/:id/challenge',requireAuth,(req,res)=>{const lesson=lessons.find(l=>l.id===req.params.id);if(!lesson?.challenge)return res.status(404).json({error:'Challenge not found.'});const parsed=z.object({selectedOptionIndex:z.number().int().min(0).max(lesson.challenge.options.length-1)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Choose one of the answers shown.'});const correctOptionIndex=lesson.challenge.options.findIndex(option=>option.correct);res.json({ok:true,correct:parsed.data.selectedOptionIndex===correctOptionIndex,correctOptionIndex});});
 app.get('/api/vocabulary',(req,res)=>{let data=vocabulary;if(req.query.category)data=data.filter(v=>v.category===String(req.query.category).slice(0,30));if(req.query.level&&LEVELS.includes(req.query.level))data=data.filter(v=>v.level===req.query.level);res.json(data);});
 app.get('/api/quizzes',(req,res)=>{let data=quizzes;if(req.query.level)data=data.filter(q=>q.level===req.query.level);if(req.query.category)data=data.filter(q=>q.category===req.query.category);
  // Descriptive option IDs such as "sentence-builder-right" name the answer, so the
  // browser only ever sees positions; the server resolves the choice by index.
  res.json(data.map(({answer,options,...q})=>({...q,options:options.map(({label,emoji})=>({label,emoji}))})));});
 const chatSchema=z.object({learnerId:z.string().regex(/^[a-f0-9-]{16,40}$/i),message:z.string().trim().min(1).max(500),context:z.object({level:z.enum(LEVELS).optional(),currentTopic:z.string().max(40).optional(),currentActivity:z.string().max(60).optional(),lessonId:z.string().max(60).optional(),itemId:z.string().max(60).optional(),history:z.array(z.object({role:z.enum(['child','buddy']),text:z.string().max(250)})).max(6).optional()}).optional()});
 app.post('/api/chat',requireAuth,async(req,res)=>{const started=Date.now();const parsed=chatSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Please send a short message and try again.'});const {learnerId,message,context={}}=parsed.data;
  const learnerRow=await ownedLearner(req.caregiverId,learnerId);
  if(!learnerRow)return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});
  const learnerContext=await getLearnerContext(db,learnerId);
  const detected=detectMode(message);
  const chatHistory=(context.history||[]).slice(-6);
  const curriculum=getTutorCurriculumContext({level:learnerContext.level||context.level||'L1',topic:context.currentTopic,lessonId:context.lessonId,itemId:context.itemId,message});
  const responseContext={...learnerContext,detectedMode:detected.mode,mood:detected.mood,currentTopic:curriculum.topic,currentActivity:context.currentActivity||null,curriculum,activeLesson:curriculum.activeLesson,activeWord:curriculum.activeWord,focusWords:curriculum.focusWords,recentTurns:chatHistory.slice(-4)};
  if(!curriculum.topic&&message.trim().split(/\s+/).length<=4){const previousTopic=chatHistory.slice(0,-1).reverse().find(turn=>turn.role==='child'&&/\b(tell me about|what about|more about|learn about|teach me about)\b/i.test(turn.text));if(previousTopic){const previousCurriculum=getTutorCurriculumContext({level:learnerContext.level||context.level||'L1',message:previousTopic.text});if(previousCurriculum.topic){responseContext.curriculum=previousCurriculum;responseContext.currentTopic=previousCurriculum.topic;responseContext.focusWords=previousCurriculum.focusWords;}}}
  let result,source='fallback',aiStatus='not_requested';if(detected.mode==='SAFETY_REDIRECT'||isUnsafe(message)){result={mode:'SAFETY_REDIRECT',message:safetyReply(),suggestedActivity:null,learningFeedback:null};}else{
   const mode=detected.mode;
   const quick=/^(hi|hello|hey|thanks|thank you)[!. ]*$/i.test(message);
   if(!quick){const aiResult=await askGemini(message,responseContext);result=aiResult.response;aiStatus=aiResult.status;if(result)source='gemini';}
   if(!result)result=fallbackReply(message,responseContext);
   // Either side can raise a safety redirect; the reply children see is always the
   // reviewed local wording, never model text.
   if(mode==='SAFETY_REDIRECT'||result.mode==='SAFETY_REDIRECT'){result={mode:'SAFETY_REDIRECT',message:safetyReply(),suggestedActivity:null,learningFeedback:null};}
  }
  res.json({...result,mode:result.mode,mood:detected.mood,source,aiStatus,durationMs:Date.now()-started});
 });
 const attemptSchema=z.object({learnerId:z.string().regex(/^[a-f0-9-]{16,40}$/i),quizId:z.string().min(1).max(50),selectedOptionIndex:z.number().int().min(0).max(20),sessionId:z.string().regex(/^[a-f0-9-]{16,40}$/i)});
 app.post('/api/progress/attempt',requireAuth,async(req,res)=>{const p=attemptSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid learning attempt.'});const a=p.data;const learnerRow=await ownedLearner(req.caregiverId,a.learnerId);if(!learnerRow)return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});const quiz=quizzes.find(q=>q.id===a.quizId);if(!quiz)return res.status(404).json({error:'Quiz not found.'});if(quiz.level!==learnerRow.level)return res.status(409).json({error:'That quiz is for another level. Finish your current level first.'});const correctOptionIndex=quiz.options.findIndex(option=>option.itemId===quiz.answer);const correct=a.selectedOptionIndex===correctOptionIndex;
  await withTransaction(async conn=>{await conn.query('INSERT INTO attempts(learner_id,item_id,skill,correct,session_id) VALUES(?,?,?,?,?)',[a.learnerId,quiz.id,quiz.category,correct?1:0,a.sessionId]);await conn.query('UPDATE learners SET stars=stars+?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[correct?1:0,a.learnerId]);});
  // Both reads describe the state the write just produced, and neither depends on the
  // other, so they run together instead of stacking another round trip on a tap.
  const [mastery,progress]=await Promise.all([masteryFor(db,a.learnerId,quiz.id),getProgress(db,a.learnerId)]);
  res.json({ok:true,correct,correctOptionIndex,mastery,progress});});
 const practiceSchema=z.object({learnerId:z.string().regex(/^[a-f0-9-]{16,40}$/i),itemId:z.string().min(1).max(50)});
 // Practising or listening is only credited inside the learner's own level: counting
 // an L3 card while the child sits in L1 inflates the dashboard and never moves them
 // toward the level they are actually working through.
 const levelCheckedItem=(learnerRow,itemId)=>{const item=vocabulary.find(word=>word.id===itemId);if(!item)return {error:{status:404,body:{error:'Word not found.'}}};if(item.level!==learnerRow.level)return {error:{status:409,body:{error:`That card belongs to Level ${item.level}. Your learner is in Level ${learnerRow.level}.`}}};return {item};};
 app.post('/api/progress/practice',requireAuth,async(req,res)=>{const p=practiceSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid word practice.'});const {learnerId,itemId}=p.data;const learnerRow=await ownedLearner(req.caregiverId,learnerId);if(!learnerRow)return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});const checked=levelCheckedItem(learnerRow,itemId);if(checked.error)return res.status(checked.error.status).json(checked.error.body);await db.query('INSERT IGNORE INTO word_practices(learner_id,item_id) VALUES(?,?)',[learnerId,itemId]);let progress=await getProgress(db,learnerId);let previousLevel=null;if(progress.progress===100&&progress.level!=='L3'){previousLevel=progress.level;const nextLevel=progress.level==='L1'?'L2':'L3';await db.query('UPDATE learners SET level=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[nextLevel,learnerId]);progress=await getProgress(db,learnerId);}res.json({ok:true,levelAdvanced:Boolean(previousLevel),previousLevel,progress});});
 app.post('/api/progress/listen',requireAuth,async(req,res)=>{const p=practiceSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid word listen.'});const {learnerId,itemId}=p.data;const learnerRow=await ownedLearner(req.caregiverId,learnerId);if(!learnerRow)return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});const checked=levelCheckedItem(learnerRow,itemId);if(checked.error)return res.status(checked.error.status).json(checked.error.body);await db.query('UPDATE learners SET lessons_completed=lessons_completed+1,updated_at=CURRENT_TIMESTAMP WHERE id=?',[learnerId]);res.json({ok:true,progress:await getProgress(db,learnerId)});});
 app.get('/api/progress/:learnerId',requireAuth,async(req,res)=>{if(!/^[a-f0-9-]{16,40}$/i.test(req.params.learnerId))return res.status(400).json({error:'Invalid learner ID'});if(!await ownedLearner(req.caregiverId,req.params.learnerId))return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});res.json(await getProgress(db,req.params.learnerId));});
 const levelSchema=z.object({learnerId:z.string().regex(/^[a-f0-9-]{16,40}$/i),level:z.enum(LEVELS)});
 app.post('/api/progress/level',requireAuth,async(req,res)=>{const p=levelSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Choose a valid learning level.'});const {learnerId,level}=p.data;if(!await ownedLearner(req.caregiverId,learnerId))return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});await db.query('UPDATE learners SET level=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[level,learnerId]);res.json(await getProgress(db,learnerId));});
 app.post('/api/progress/reset',requireAuth,async(req,res)=>{const id=req.get('x-learner-id');if(!id||!/^[a-f0-9-]{16,40}$/i.test(id))return res.status(400).json({error:'Learner ID required.'});if(!await ownedLearner(req.caregiverId,id))return res.status(403).json({error:'This learner profile is not linked to your caregiver account.'});
  // A reset that half-applies would leave the child with stars and no history, so the
  // three writes commit together or not at all.
  await withTransaction(async conn=>{await conn.query('DELETE FROM attempts WHERE learner_id=?',[id]);await conn.query('DELETE FROM word_practices WHERE learner_id=?',[id]);await conn.query("UPDATE learners SET level='L1',stars=0,lessons_completed=0,updated_at=CURRENT_TIMESTAMP WHERE id=?",[id]);});
  res.json(await getProgress(db,id));});
 // Anything under /api that no route claimed must answer as an API: falling through
 // to the single-page app would return a 200 HTML page for a mistyped endpoint.
 app.use('/api',(req,res)=>res.status(404).json({error:'That endpoint does not exist.'}));
 // Browsers still ask for /favicon.ico even when the page declares an SVG icon; without
 // this they received the SPA shell as text/html.
 app.get('/favicon.ico',(req,res)=>res.redirect(301,'/favicon.svg'));
 app.use(compressedAssets());
 app.use(express.static(path.join(here,'../public')));app.get('/{*path}',(req,res)=>res.sendFile(path.join(here,'../public/index.html')));
 app.use((err,req,res,next)=>{const status=Number.isInteger(err?.status)?err.status:Number.isInteger(err?.statusCode)?err.statusCode:500;
  // A malformed or oversized request is the caller's mistake; reporting it as a server
  // fault hides the real cause from caregivers and from load-balancer dashboards.
  if(status>=500)console.error('Request failed:',err?.message);
  if(res.headersSent)return next(err);
  const message=status===413||err?.type==='entity.too.large'?'That message was too long. Please write a shorter one.'
   :status<500?'That request did not look right. Please try again.'
   :'Something went wrong. Please try again.';
  res.status(status===400&&err?.type==='entity.parse.failed'?400:status).json({error:message});});
 return app;
}
