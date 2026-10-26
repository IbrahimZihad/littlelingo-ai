import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac, createHash } from 'node:crypto';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const secret = () => process.env.AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-this-secret');
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, stored) {
  try { const [kind, salt, expected] = stored.split('$'); if (kind !== 'scrypt') return false; const actual=scryptSync(password,salt,64); const target=Buffer.from(expected,'hex'); return actual.length===target.length && timingSafeEqual(actual,target); } catch { return false; }
}
export function issueToken(caregiverId) {
  const key=secret(); if(!key) throw new Error('AUTH_SECRET must be set in production');
  const payload=Buffer.from(JSON.stringify({sub:caregiverId,exp:Math.floor(Date.now()/1000)+TOKEN_TTL_SECONDS})).toString('base64url');
  const sig=createHmac('sha256',key).update(payload).digest('base64url'); return `${payload}.${sig}`;
}
export function verifyToken(token) {
  try { const key=secret(); if(!key || typeof token!=='string') return null; const [payload,sig]=token.split('.'); if(!payload||!sig)return null; const expected=createHmac('sha256',key).update(payload).digest();const actual=Buffer.from(sig,'base64url');if(expected.length!==actual.length||!timingSafeEqual(expected,actual))return null;const data=JSON.parse(Buffer.from(payload,'base64url').toString());if(!data.sub||!Number.isInteger(data.exp)||data.exp<Math.floor(Date.now()/1000))return null;return {caregiverId:data.sub,exp:data.exp}; } catch { return null; }
}
export const tokenHash = token => createHash('sha256').update(String(token || '')).digest('hex');
export const newId = () => randomUUID();
