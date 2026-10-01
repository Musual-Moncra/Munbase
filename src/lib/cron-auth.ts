import {timingSafeEqual} from 'node:crypto';

export function verifyCronAuthorization(authorization:string|null,secret:string|undefined){
  if(!secret||!authorization?.startsWith('Bearer '))return false;
  const token=authorization.slice(7);
  if(!token)return false;
  const expected=Buffer.from(secret,'utf8');
  const actual=Buffer.from(token,'utf8');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
