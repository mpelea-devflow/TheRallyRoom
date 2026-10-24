import { describe, expect, it } from 'vitest';
import { defaultRule, finishGame, lockGroup, lineup, queueCustomGroup, startAvailableGames, type Player, type Session } from './domain';

function session(): Session {
  return { id: 'test', name: 'Simulation', venue: 'Test', live: true, clock: 33, rule: {...defaultRule},
    players: Array.from({length: 33}, (_, i): Player => ({id:`p${i+1}`, name:`Player ${i+1}`, rating:i < 8 ? 4 : 2.5, beginner:false, status:'waiting', joined:i+1, queued:i+1, games:0, protected:false, roster:null, pair:null, past:[], partners:[]})),
    courts: Array.from({length:3}, (_, i) => ({id:`c${i+1}`, name:`Court ${i+1}`, override:null, rosterMode:'open', game:null})) };
}
function playing(s: Session) {return s.courts.flatMap(c => c.game?.teams.flat() ?? []);}

describe('33-player three-court scenarios', () => {
  it('fills three open courts and rotates all 33 players through repeated games without duplicate assignments', () => {
    let s = startAvailableGames(session());
    for (let round = 0; round < 33; round++) {
      expect(playing(s)).toHaveLength(12);
      expect(new Set(playing(s)).size).toBe(12);
      for (const court of s.courts) s = startAvailableGames(finishGame(s, court.id));
    }
    expect(s.players.every(p => p.games > 0)).toBe(true);
    const counts = s.players.map(p => p.games);
    console.info('Completed-game distribution:', Object.fromEntries([...new Set(counts)].sort((a,b)=>a-b).map(count => [count, counts.filter(value => value===count).length])));
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
  });
  it('honors one court rating override while other courts use the session rule', () => {
    const s = session();
    s.courts[0].override = {mode:'same', min:3.5, max:4.5, split:4};
    const result = startAvailableGames(s);
    expect(result.courts.every(c => c.game)).toBe(true);
    expect(result.courts[0].game!.teams.flat().every(id => result.players.find(p => p.id === id)!.rating === 4)).toBe(true);
    expect(new Set(playing(result)).size).toBe(12);
    expect(result.courts[1].override).toBeNull();
  });
  it('keeps a four-player group together and respects its locked pair when teams shuffle', () => {
    let s = session(); s.players[0].pair='p2'; s.players[1].pair='p1';
    s = lockGroup(s, ['p1','p2','p3','p4']); s = startAvailableGames(s);
    const court = s.courts.find(c => c.game?.teams.flat().includes('p1'))!;
    expect(court.game!.teams.flat().sort()).toEqual(['p1','p2','p3','p4']);
    expect(court.game!.teams.some(team => team.includes('p1') && team.includes('p2'))).toBe(true);
    s = finishGame(s, court.id);
    const repeat = lineup(s, court);
    if (repeat?.flat().includes('p1')) expect(repeat.some(team => team.includes('p1') && team.includes('p2'))).toBe(true);
  });
  it('keeps a standalone locked pair together through automatic court assignment', () => {
    const s = session(); s.players[0].pair='p2'; s.players[1].pair='p1';
    const result = startAvailableGames(s);
    const game = result.courts.find(c => c.game?.teams.flat().includes('p1'))!.game!;
    expect(game.teams.some(team => team.includes('p1') && team.includes('p2'))).toBe(true);
  });
  it('applies mixed session rules and a court-only roster without affecting other courts', () => {
    const s = session(); s.rule={mode:'mixed',min:2,max:5,split:3};
    s.players.forEach((p,i) => { p.rating = i % 2 ? 4 : 2.5; });
    s.courts[0].rosterMode='only'; s.players.slice(0,4).forEach(p => { p.roster='c1'; });
    const result=startAvailableGames(s);
    expect(result.courts[0].game!.teams.flat().sort()).toEqual(['p1','p2','p3','p4']);
    expect(result.courts.every(c => c.game)).toBe(true);
    for (const court of result.courts) for (const team of court.game!.teams) {
      expect(team.map(id => result.players.find(p => p.id===id)!.rating! < 3).sort()).toEqual([false,true]);
    }
  });
  it('documents that earlier open courts can use players needed by a later restricted court', () => {
    const s = session();
    s.players.forEach((p,i) => p.rating = i < 8 ? 4 : 2.5);
    s.courts[2].override = {mode:'same', min:3.5, max:4.5, split:4};
    const result = startAvailableGames(s);
    expect(result.courts[0].game).not.toBeNull();
    expect(result.courts[1].game).not.toBeNull();
    expect(result.courts[2].game).toBeNull();
  });
  it('reserves a custom group after the two published previews without distorting three-court matching', () => {
    let s=queueCustomGroup(session(), ['p13','p14','p15','p16']);
    s=startAvailableGames(s);
    expect(s.courts[0].game!.teams.flat().sort()).toEqual(['p1','p2','p3','p4']);
    expect(s.courts[1].game!.teams.flat().sort()).toEqual(['p5','p6','p7','p8']);
    expect(s.courts[2].game!.teams.flat().sort()).toEqual(['p13','p14','p15','p16']);
    expect(new Set(playing(s)).size).toBe(12);
    expect(s.players.filter(p=>['p13','p14','p15','p16'].includes(p.id)).every(p=>p.status==='playing'&&!p.protected)).toBe(true);
    s=startAvailableGames(finishGame(s,'c1'));
    expect(s.courts[0].game!.teams.flat().sort()).toEqual(['p10','p11','p12','p9']);
  });
});
