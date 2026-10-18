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
 const all=db.prepare('SELECT COUNT(DISTINCT item_id) n FROM attempts WHERE learner_id=?').get(learnerId).n;
 const level=learner.level;
 const lessons=learner.lessons_completed;
 let next=level;
 if(level==='L1' && mastered>=4 && accuracy>=80 && lessons>=2) next='L2';
 if(level==='L2' && mastered>=8 && accuracy>=80 && lessons>=4) next='L3';
 if(next!==level) db.prepare('UPDATE learners SET level=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(next,learnerId);
 const fresh=db.prepare('SELECT * FROM learners WHERE id=?').get(learnerId);
 return {learnerId,level:fresh.level,stars:fresh.stars,lessonsCompleted:fresh.lessons_completed,attempts:total,accuracy,masteredWords:mastered,wordsPracticed:all,progress:Math.min(100,Math.round(mastered/(fresh.level==='L1'?4:fresh.level==='L2'?8:12)*100))};
}
