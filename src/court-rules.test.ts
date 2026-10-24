import { describe, expect, it } from 'vitest';
import { defaultRule, eligible, finishGame, lineup, lockGroup, pausePlayer, replacePlayer, startGame, validCustomRule, validTeams, type Player, type Rule, type Session } from './domain';

const rule: Rule = { ...defaultRule, mode: 'custom', ranges: [{min: 2, max: 2.5}, {min: 3, max: 3.5}] };
function setup(): Session {
 const ratings = [2, 2.5, 3, 3.5, 2.75, null, 3.25, 2.25];
 return {id:'s',name:'Test',venue:'Club',live:true,clock:8,rule:defaultRule,
  players: ratings.map((rating,i): Player => ({id:`p${i+1}`,name:`P${i+1}`,rating,beginner:true,status:'waiting',joined:i+1,queued:i+1,games:0,protected:false,roster:null,pair:null,past:[],partners:[]})),
  courts:[{id:'c1',name:'Court 1',override:rule,rosterMode:'open',game:null}]};
}
describe('custom court criteria',()=>{
 it('accepts both inclusive ranges, rejects gaps and unrated players, and includes new players as an alternative',()=>{
  const s=setup(), c=s.courts[0];
  expect(s.players.map(p=>eligible(p,c,rule))).toEqual([true,true,true,true,false,false,true,true]);
  s.players[0].beginner=false;
  expect(eligible(s.players[0],c,{...rule,newOnly:true})).toBe(true);
  s.players[4].beginner=false; expect(eligible(s.players[4],c,{...rule,newOnly:true})).toBe(false);
  s.players[4].beginner=true; expect(eligible(s.players[4],c,{...rule,newOnly:true})).toBe(true);
  expect(eligible(s.players[5],c,{...rule,ranges:[],newOnly:true})).toBe(true);
  expect(eligible(s.players[0],c,{...rule,ranges:[],newOnly:true})).toBe(false);
 });
 it('rejects incomplete, reversed and out-of-bounds ranges',()=>{
  for(const range of [{min:null,max:3},{min:4,max:3},{min:0,max:3},{min:2,max:9}]) expect(validCustomRule({...rule,ranges:[range]})).toBe(false);
 });
 it('mixes the ranges on balanced teams while preserving pair locks',()=>{
  const s=setup(); const teams=lineup(s,s.courts[0])!;
  expect(teams.flat().sort()).toEqual(['p1','p2','p3','p4']);
  const totals=teams.map(team=>team.reduce((sum,id)=>sum+s.players.find(p=>p.id===id)!.rating!,0));
  expect(totals).toEqual([5.5,5.5]);
  s.players[0].pair='p2';s.players[1].pair='p1';
  expect(lineup(s,s.courts[0])!.some(team=>team.includes('p1')&&team.includes('p2'))).toBe(true);
 });
 it('honors rosters and locked groups alongside the new criteria',()=>{
  let s=setup();s.players[0].roster='other';expect(lineup(s,s.courts[0])!.flat()).not.toContain('p1');
  s=setup();s=lockGroup(s,['p1','p2','p3','p4']);s.players[0].rating=2.75;
  expect(lineup(s,s.courts[0])).toBeNull();
 });
 it('rejects an ineligible replacement and counts an eligible replacement when finishing',()=>{
  let s=startGame(setup(),'c1');s=pausePlayer(s,'p1');
  expect(replacePlayer(s,'c1','p1','p5')).toBe(s);
  s=replacePlayer(s,'c1','p1','p7');expect(s.courts[0].game!.teams.flat()).toContain('p7');
  s=finishGame(s,'c1');expect(s.players[0].games).toBe(0);expect(s.players[6].games).toBe(1);
 });
 it('keeps legacy rule modes and their team restrictions working',()=>{
  const s=setup();expect(validTeams(s.players.slice(0,4),{...defaultRule,mode:'same',min:2,max:3})).toEqual([]);
  expect(validTeams(s.players.slice(0,4),{...defaultRule,mode:'mixed',min:2,max:3.5,split:3})).toHaveLength(2);
  s.players[0].beginner=false;expect(validTeams(s.players.slice(0,4),{...defaultRule,mode:'new'})).toEqual([]);
 });
});

describe('custom next groups',()=>{
 function queueSession(n=16): Session { const s=setup(); while(s.players.length<n){const i=s.players.length+1;s.players.push({id:`p${i}`,name:`P${i}`,rating:3,beginner:false,status:'waiting',joined:i,queued:i,games:0,protected:false,roster:null,pair:null,past:[],partners:[]});s.clock=i;} s.courts[0].override=null;s.rule=defaultRule;return s; }
 it('protects the two visible previews from custom selection',async()=>{
  const {canQueueCustomGroup,upcomingGroups}=await import('./domain'); const s=queueSession(); const protectedIds=upcomingGroups(s,2).flatMap(g=>g.teams.flat());
  expect(canQueueCustomGroup(s,protectedIds)).toBe(false); expect(canQueueCustomGroup(s,['p9','p10','p11','p12'])).toBe(true);
 });
 it('holds a custom group after two normal previews, then starts it together',async()=>{
  const {queueCustomGroup,startGame}=await import('./domain'); let s=queueCustomGroup(queueSession(),['p9','p10','p11','p12']);
  expect(s.customGroups?.[0].previewsAhead).toBe(2); s=startGame(s,'c1'); expect(s.courts[0].game!.teams.flat()).not.toEqual(expect.arrayContaining(['p9'])); expect(s.customGroups?.[0].previewsAhead).toBe(1);
  s=finishGame(s,'c1');s=startGame(s,'c1');expect(s.customGroups?.[0].previewsAhead).toBe(0);
  s=finishGame(s,'c1');s=startGame(s,'c1');expect(s.courts[0].game!.teams.flat().sort()).toEqual(['p10','p11','p12','p9']);expect(s.customGroups).toEqual([]);
 });
 it('does not allow a locked pair to be split when selecting a custom group',async()=>{
  const {canQueueCustomGroup}=await import('./domain'); const s=queueSession();s.players[8].pair='p10';s.players[9].pair='p9';
  expect(canQueueCustomGroup(s,['p9','p11','p12','p13'])).toBe(false);expect(canQueueCustomGroup(s,['p9','p10','p11','p12'])).toBe(true);
 });
 it('cancels a queued custom group without changing player queue state',async()=>{
  const {cancelCustomGroup,queueCustomGroup}=await import('./domain'); const s=queueCustomGroup(queueSession(),['p9','p10','p11','p12']); const groupId=s.customGroups![0].id;
  const before=s.players.filter(p=>['p9','p10','p11','p12'].includes(p.id)).map(p=>({id:p.id,queued:p.queued,games:p.games,status:p.status}));
  const cancelled=cancelCustomGroup(s,groupId);
  expect(cancelled.customGroups).toEqual([]);
  expect(cancelled.players.filter(p=>['p9','p10','p11','p12'].includes(p.id)).map(p=>({id:p.id,queued:p.queued,games:p.games,status:p.status}))).toEqual(before);
  expect(cancelCustomGroup(cancelled,groupId)).toBe(cancelled);
 });
 it('waits for a compatible court instead of breaking roster restrictions',async()=>{
  const {queueCustomGroup,startGame}=await import('./domain');let s=queueCustomGroup(queueSession(),['p9','p10','p11','p12']);s.courts[0].rosterMode='only';s.players.filter(p=>['p1','p2','p3','p4'].includes(p.id)).forEach(p=>p.roster='c1');s.customGroups![0].previewsAhead=0;
  const started=startGame(s,'c1');expect(started.courts[0].game!.teams.flat()).not.toEqual(expect.arrayContaining(['p9']));expect(started.customGroups?.[0].players).toEqual(['p9','p10','p11','p12']);
 });
});
