export type RatingRange = { min: number | null; max: number | null };
export type Rule = { mode: 'any' | 'same' | 'mixed' | 'new' | 'custom'; min: number; max: number; split: number; ranges?: RatingRange[]; newOnly?: boolean };
export type Player = { id: string; name: string; rating: number | null; beginner: boolean; status: 'waiting' | 'playing' | 'paused' | 'left'; joined: number; queued: number; games: number; protected: boolean; roster: string | null; pair: string | null; past: string[]; partners: string[] };
export type Game = { teams: [[string,string],[string,string]]; started: number };
export type Court = { id: string; name: string; override: Rule | null; rosterMode: 'open' | 'only' | 'plus'; game: Game | null };
export type Session = { id: string; name: string; venue: string; live: boolean; clock: number; rule: Rule; players: Player[]; courts: Court[]; lockedGroups?: string[][] };
export const defaultRule: Rule = {mode:'any', min:2, max:5, split:3};
export const newId = () => crypto.randomUUID();
export function validCustomRule(rule: Rule) {
  return rule.mode !== 'custom' || (rule.ranges ?? []).every(r => typeof r.min === 'number' && Number.isFinite(r.min) && typeof r.max === 'number' && Number.isFinite(r.max) && r.min >= 1 && r.max <= 8 && r.min <= r.max);
}
function matchesRule(p: Player, rule: Rule) {
  if (rule.mode === 'new') return p.beginner;
  if (rule.mode === 'same' || rule.mode === 'mixed') return p.rating !== null && p.rating >= rule.min && p.rating <= rule.max;
  if (rule.mode === 'custom') {
    const ranges = rule.ranges ?? [];
    return validCustomRule(rule) && ((!ranges.length && !rule.newOnly) || (!!rule.newOnly && p.beginner) || (p.rating !== null && ranges.some(r => p.rating! >= r.min! && p.rating! <= r.max!)));
  }
  return true;
}
export function eligible(p: Player, c: Court, rule: Rule) {
  if (p.status !== 'waiting' || (p.roster && p.roster !== c.id)) return false;
  if (c.rosterMode === 'only' && p.roster !== c.id) return false;
  return matchesRule(p, rule);
}
function pairs<T>(a:T[]): T[][][] { return [[[a[0],a[1]],[a[2],a[3]]],[[a[0],a[2]],[a[1],a[3]]],[[a[0],a[3]],[a[1],a[2]]]]; }
export function validTeams(group: Player[], rule: Rule): Player[][][] {
  if (group.length !== 4 || new Set(group.map(p=>p.id)).size !== 4) return [];
  if (group.some(p=>!matchesRule(p,rule))) return [];
  return pairs(group).filter(ts => ts.every(team => team.every(p => !p.pair || team.some(q => q.id === p.pair))) && (rule.mode !== 'mixed' || ts.every(team=>team.filter(p=>p.rating! < rule.split).length===1)));
}
function combinations<T>(a:T[], n:number): T[][] { if(n===0)return [[]]; return a.flatMap((x,i)=>combinations(a.slice(i+1),n-1).map(rest=>[x,...rest])); }
function compare(a:number[],b:number[]) { for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]-b[i]; return 0; }
export function lineup(s:Session,c:Court,excluded: ReadonlySet<string> = new Set()): [[string,string],[string,string]] | null {
 const rule=c.override ?? s.rule;
 const pool=s.players.filter(p=>!excluded.has(p.id)&&eligible(p,c,rule)).sort((a,b)=>a.queued-b.queued).slice(0,8);
 const options = combinations(pool,4).filter(group=>{const ids=new Set(group.map(p=>p.id));return (s.lockedGroups??[]).every(locked=>!locked.some(id=>ids.has(id))||locked.every(id=>ids.has(id)))}).flatMap(group=>validTeams(group,rule).map(teams=>({group,teams})));
 if(!options.length)return null;
 const score=({group,teams}:{group:Player[],teams:Player[][]})=>{
  const chosen=new Set(group.map(p=>p.id));
  // A later arrival cannot pass an earlier eligible player with no more games, if a valid alternative exists.
  const guard=group.reduce((sum,p)=>sum+pool.filter(q=>!chosen.has(q.id)&&q.joined<p.joined&&q.games<=p.games).length,0);
  const protectedMiss=pool.filter(p=>p.protected&&!chosen.has(p.id)).length;
  const firstMiss=chosen.has(pool[0].id)?0:1;
  const repeats=group.reduce((sum,p)=>sum+group.filter(q=>q.id!==p.id&&p.past.includes(q.id)).length,0);
  const partners=teams.reduce((sum,t)=>sum+(t[0].partners.includes(t[1].id)?1:0),0);
  const balance=Math.abs(teams[0].reduce((a,p)=>a+(p.rating??0),0)-teams[1].reduce((a,p)=>a+(p.rating??0),0));
  return [guard,protectedMiss,firstMiss,repeats,partners,group.reduce((sum,p)=>sum+pool.indexOf(p),0),balance];
 };
 options.sort((a,b)=>compare(score(a),score(b)));
 return options[0].teams.map(t=>t.map(p=>p.id)) as [[string,string],[string,string]];
}
export function courtPreviews(s:Session): Record<string, Game['teams'] | null> {
 const reserved = new Set<string>();
 const previews: Record<string, Game['teams'] | null> = {};
 for (const c of s.courts) {
  if (c.game) continue;
  const teams = lineup(s,c,reserved);
  previews[c.id] = teams;
  teams?.flat().forEach(id=>reserved.add(id));
 }
 return previews;
}
export function startGame(s:Session,courtId:string,expected?:Game['teams']):Session {
 const next=structuredClone(s), c=next.courts.find(x=>x.id===courtId); if(!c||c.game||!next.live)return s;
 const previews=courtPreviews(next), teams=previews[courtId]; if(!teams || (expected && JSON.stringify(teams)!==JSON.stringify(expected)))return s;
 const reservedEarlier=new Set<string>();
 for (const court of next.courts) { if(court.id===courtId)break; previews[court.id]?.flat().forEach(id=>reservedEarlier.add(id)); }
 const ids=teams.flat(); const pool=next.players.filter(p=>!reservedEarlier.has(p.id)&&eligible(p,c,c.override??next.rule)).sort((a,b)=>a.queued-b.queued).slice(0,8);
 const last=Math.max(...ids.map(id=>pool.findIndex(p=>p.id===id)));
 pool.forEach((p,i)=>{if(ids.includes(p.id)){p.status='playing';p.protected=false;}else if(i<last)p.protected=true;});
 c.game={teams,started:Date.now()};return next;
}
export function startAvailableGames(s:Session):Session {
 if(!s.live)return s;
 let next=s;
 for(const court of s.courts) next=startGame(next,court.id);
 return next;
}
export function canLockGroup(s:Session, ids:string[]):boolean {
 if(ids.length!==4||new Set(ids).size!==4)return false;
 const players=ids.map(id=>s.players.find(p=>p.id===id));
 return players.every(p=>p && p.status!=='left' && (!(s.lockedGroups??[]).some(group=>group.includes(p.id))) && (!p.pair||ids.includes(p.pair)));
}
export function lockGroup(s:Session,ids:string[]):Session {
 if(!canLockGroup(s,ids))return s;
 return {...s,lockedGroups:[...(s.lockedGroups??[]),[...ids]]};
}
export function unlockGroup(s:Session,ids:string[]):Session {
 const groups=s.lockedGroups??[];
 const remaining=groups.filter(group=>!(group.length===ids.length&&group.every(id=>ids.includes(id))));
 return remaining.length===groups.length?s:{...s,lockedGroups:remaining};
}
export type UpcomingGroup = {courtId:string;teams:Game['teams']};
export function upcomingGroups(s:Session, limit=2):UpcomingGroup[] {
 if(!s.live || limit<=0)return [];
 let simulation=s;
 const results:UpcomingGroup[]=[];
 while(results.length<limit){
  let found=false;
  for(const court of s.courts){
   if(results.length>=limit)break;
   // Only the target court is considered free; current players do not re-enter this projection.
   const projected={...simulation,courts:[{...court,game:null}]};
   const started=startGame(projected,court.id);
   const game=started.courts[0].game;
   if(!game)continue;
   results.push({courtId:court.id,teams:game.teams});
   simulation={...simulation,players:started.players};
   found=true;
  }
  if(!found)break;
 }
 return results;
}
export function nameTaken(players:Player[], name:string):boolean {
 const normalize=(value:string)=>value.trim().replace(/\s+/g,' ').toLowerCase();
 const normalized=normalize(name);
 return normalized.length>0 && players.some(p=>p.status!=='left'&&normalize(p.name)===normalized);
}
export function finishGame(s:Session,courtId:string):Session {
 const next=structuredClone(s), c=next.courts.find(x=>x.id===courtId); if(!c?.game)return s;
 const teams=c.game.teams, ids=teams.flat();
 for(const id of ids){const p=next.players.find(x=>x.id===id);if(!p)continue; p.games++;p.past=ids.filter(x=>x!==id);p.partners=[teams.find(t=>t.includes(id))!.find(x=>x!==id)!];p.status='waiting';p.queued=++next.clock;}
 c.game=null;return next;
}
export function pausePlayer(s:Session,id:string):Session {
 const next=structuredClone(s), p=next.players.find(x=>x.id===id); if(!p||p.status==='left')return s;
 p.status='paused';p.protected=false;
 // An interrupted game keeps the vacancy until a host selects a valid replacement.
 return next;
}
export function replacePlayer(s:Session,courtId:string,oldId:string,newPlayerId:string):Session {
 const next=structuredClone(s),c=next.courts.find(x=>x.id===courtId),old=next.players.find(p=>p.id===oldId), replacement=next.players.find(p=>p.id===newPlayerId);
 if(!c?.game||!old||!replacement||old.status==='playing'||oldId===newPlayerId||!eligible(replacement,c,c.override??next.rule))return s;
 const ids=c.game.teams.flat().map(id=>id===oldId?newPlayerId:id); const group=ids.map(id=>next.players.find(p=>p.id===id)!);
 const valid=validTeams(group,c.override??next.rule).some(ts=>ts.every((t,i)=>t.every(p=>c.game!.teams[i].map(id=>id===oldId?newPlayerId:id).includes(p.id))));
 if(!valid)return s;
 c.game.teams=c.game.teams.map(t=>t.map(id=>id===oldId?newPlayerId:id)) as Game['teams'];replacement.status='playing';replacement.protected=false;return next;
}
