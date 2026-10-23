import {createHash,timingSafeEqual} from 'node:crypto';

// Only these routes bypass the website cookie gate. They check their own key.
export const isManualPlannerRoute = path => path === '/api/planner/runs'
  || /^\/api\/planner\/runs\/[^/]+$/.test(path);

export function createManualPlannerAuth({env=process.env}={}) {
  const key=env.PLANNER_API_KEY;
  const configured=typeof key==='string'&&key.length>=32&&key.length<=512
    &&! /[^A-Za-z0-9_-]/.test(key);
  const hash=value=>createHash('sha256').update(value).digest();
  const expected=configured?hash(`Bearer ${key}`):null;
  return Object.freeze({configured,
    authorizeRequest(request) {
      const header=request?.headers?.get('authorization');
      return Boolean(configured&&typeof header==='string'&&header.length<=519
        &&timingSafeEqual(hash(header),expected));
    },
  });
}
