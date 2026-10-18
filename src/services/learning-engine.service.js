import vocabulary from '../data/vocabulary.json' with {type:'json'};

export function masteryFor(db, learnerId, itemId) {
 const rows=db.prepare('SELECT correct, session_id FROM attempts WHERE learner_id=? AND item_id=? ORDER BY id DESC LIMIT 20').all(learnerId,itemId);
 const sessions=new Set(rows.filter(r=>r.correct).map(r=>r.session_id));
 const correct=rows.filter(r=>r.correct).length;
 return {mastered:correct>=3 && sessions.size>=2, correct, sessions:sessions.size};
}
export function getProgress(db, learnerId) {
 const learner=db.prepare('SELECT * FROM learners WHERE id=?').get(learnerId);
 if(!learner) return null;
 const total=db.prepare('SELECT COUNT(*) n FROM attempts WHERE learner_id=?').get(learnerId).n;
 const correct=db.prepare('SELECT COUNT(*) n FROM attempts WHERE learner_id=? AND correct=1').get(learnerId).n;
 const skills=db.prepare('SELECT item_id, SUM(correct) correct_count, COUNT(DISTINCT CASE WHEN correct=1 THEN session_id END) sessions FROM attempts WHERE learner_id=? GROUP BY item_id').all(learnerId);
 const mastered=skills.filter(s=>s.correct_count>=3 && s.sessions>=2).length;
 const accuracy=total?Math.round(correct/total*100):0;
 const level=learner.level;
 const levelWords=vocabulary.filter(word=>level==='L3'||word.level===level);
 const practicedIds=new Set(db.prepare('SELECT item_id FROM word_practices WHERE learner_id=?').all(learnerId).map(row=>row.item_id));
 const practicedWords=levelWords.filter(word=>practicedIds.has(word.id)).length;
 const totalWordsPracticed=vocabulary.filter(word=>practicedIds.has(word.id)).length;
 const progress=levelWords.length?Math.round(practicedWords/levelWords.length*100):0;
 return {learnerId,level,stars:learner.stars,lessonsCompleted:learner.lessons_completed,attempts:total,accuracy,masteredWords:mastered,practicedWords,totalWords:levelWords.length,totalWordsPracticed,progress};
}
