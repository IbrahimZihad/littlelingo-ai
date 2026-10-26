import { vocabulary, quizzes } from '../data/curriculum.js';

export async function masteryFor(db, learnerId, itemId) {
 const [rows]=await db.query('SELECT correct, session_id FROM attempts WHERE learner_id=? AND item_id=? ORDER BY id DESC LIMIT 20',[learnerId,itemId]);
 const sessions=new Set(rows.filter(r=>r.correct).map(r=>r.session_id));
 const correct=rows.filter(r=>r.correct).length;
 return {mastered:correct>=3 && sessions.size>=2, correct, sessions:sessions.size};
}
export async function getProgress(db, learnerId) {
 const [learnerRows]=await db.query('SELECT * FROM learners WHERE id=?',[learnerId]);
 const learner=learnerRows[0];
 if(!learner) return null;
 const [attemptCounts]=await db.query('SELECT COUNT(*) n, COALESCE(SUM(correct),0) correct FROM attempts WHERE learner_id=?',[learnerId]);
 const total=Number(attemptCounts[0].n);
 const correct=Number(attemptCounts[0].correct);
 const [skills]=await db.query('SELECT item_id, SUM(correct) correct_count, COUNT(DISTINCT CASE WHEN correct=1 THEN session_id END) sessions FROM attempts WHERE learner_id=? GROUP BY item_id',[learnerId]);
 const mastered=skills.filter(s=>Number(s.correct_count)>=3 && Number(s.sessions)>=2).length;
 const accuracy=total?Math.round(correct/total*100):0;
 const level=learner.level;
 const levelWords=vocabulary.filter(word=>word.level===level);
 const [practiceRows]=await db.query('SELECT item_id FROM word_practices WHERE learner_id=?',[learnerId]);
 const practicedIds=new Set(practiceRows.map(row=>row.item_id));
 const practicedWords=levelWords.filter(word=>practicedIds.has(word.id)).length;
 const totalWordsPracticed=vocabulary.filter(word=>practicedIds.has(word.id)).length;
 const progress=levelWords.length?Math.round(practicedWords/levelWords.length*100):0;
 return {learnerId,level,stars:learner.stars,lessonsCompleted:learner.lessons_completed,attempts:total,accuracy,masteredWords:mastered,practicedWords,totalWords:levelWords.length,totalWordsPracticed,progress};
}

export async function getLearnerContext(db, learnerId) {
 const progress=await getProgress(db,learnerId);
 if(!progress) return null;
 const [recentPractices]=await db.query('SELECT item_id FROM word_practices WHERE learner_id=? ORDER BY id DESC LIMIT 6',[learnerId]);
 const [recentAttempts]=await db.query('SELECT item_id, skill, correct FROM attempts WHERE learner_id=? ORDER BY id DESC LIMIT 4',[learnerId]);
 return {
  level:progress.level,
  learningHistory:{
   masteredWords:progress.masteredWords,
   wordsPracticed:progress.totalWordsPracticed,
   lessonsCompleted:progress.lessonsCompleted,
   quizAccuracy:progress.accuracy,
   recentWords:recentPractices.map(({item_id})=>vocabulary.find(word=>word.id===item_id)?.word).filter(Boolean),
   recentQuizResults:recentAttempts.map(({item_id,skill,correct})=>({
    question:quizzes.find(question=>question.id===item_id)?.question||null,
    skill,
    result:correct?'correct':'needs-practice'
   }))
  }
 };
}
