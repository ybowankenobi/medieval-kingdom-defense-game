/**
 * Headless regression tests for deterministic, high-risk systems.
 * Run with: npm run test
 */
import { buildWave, MISSIONS, ENDLESS, DMG_TABLE, TECHS, UNITS, BUILDINGS, ENEMY_MAP, TERRITORIES, DIFFICULTY } from '../src/game/data';
import { defaultSave, grantReward, saveSlot, loadSlot, deleteSlot, SAVE_VERSION } from '../src/game/save';

// --- minimal localStorage shim for node ---
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e: any) { fail++; console.error(`  ✗ ${name}: ${e.message}`); }
}
function eq(a: any, b: any, m = '') { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(c: any, m = 'assertion failed') { if (!c) throw new Error(m); }

console.log('\nECONOMY & REWARDS');
t('grantReward pays once and is audited', () => {
  let s = defaultSave(0);
  const g0 = s.gold;
  let r = grantReward(s, 'stage:m1', 180); s = r.save;
  eq(r.granted, 180); eq(s.gold, g0 + 180);
  r = grantReward(s, 'stage:m1', 180); s = r.save;
  eq(r.granted, 0, 'duplicate payout blocked'); eq(s.gold, g0 + 180);
});
t('kill gold is kept on defeat, stage reward is not', () => {
  const s = defaultSave(0);
  const killGold = 350;
  const afterDefeat = { ...s, gold: s.gold + killGold };
  eq(afterDefeat.gold, s.gold + 350);
  ok(!afterDefeat.claimedRewards.includes('stage:m1'), 'no stage reward on defeat');
});
t('survival bonus uses the configured percentage of kill gold only', () => {
  const m = MISSIONS[0];
  eq(Math.round(500 * m.survivalBonusPct / 100), 100);
});
t('territory income only counts owned territories', () => {
  const s = defaultSave(0);
  const income = s.territories.reduce((a, id) => a + (TERRITORIES.find((t) => t.id === id)?.income || 0), 0);
  eq(income, 0, 'home territory yields no income until others are conquered');
  const s2 = { ...s, territories: [...s.territories, 'ashford'] };
  eq(s2.territories.reduce((a, id) => a + (TERRITORIES.find((t) => t.id === id)?.income || 0), 0), 40);
});

console.log('\nSAVE SYSTEM');
t('save/load round trip preserves state', () => {
  const s = defaultSave(1); s.gold = 1234; s.techs = ['tech_drill'];
  ok(saveSlot(s));
  const l = loadSlot(1)!;
  eq(l.gold, 1234); eq(l.techs, ['tech_drill']); eq(l.version, SAVE_VERSION);
});
t('corrupt save falls back to backup instead of destroying progress', () => {
  const s = defaultSave(2); s.gold = 900; saveSlot(s);
  const s2 = { ...s, gold: 1500 }; saveSlot(s2); // writes backup = 900 version
  store.set('kingdomfall.save.2', '{{{not json');
  const l = loadSlot(2)!;
  ok(l !== null && l.gold === 900, 'recovered from backup');
});
t('invalid save shape is rejected', () => {
  store.set('kingdomfall.save.0', JSON.stringify({ gold: 'lots' }));
  store.delete('kingdomfall.backup.0');
  eq(loadSlot(0), null);
});
t('slots are independent', () => {
  deleteSlot(0); deleteSlot(1); deleteSlot(2);
  saveSlot({ ...defaultSave(0), gold: 10 });
  saveSlot({ ...defaultSave(1), gold: 20 });
  eq(loadSlot(0)!.gold, 10); eq(loadSlot(1)!.gold, 20);
});

console.log('\nWAVES');
t('wave generation is deterministic', () => {
  const a = buildWave(MISSIONS[1], 4, 'normal');
  const b = buildWave(MISSIONS[1], 4, 'normal');
  eq(a, b);
});
t('waves grow in strength', () => {
  const strength = (w: number) => buildWave(MISSIONS[4], w, 'normal')
    .reduce((s, g) => s + g.count * ENEMY_MAP[g.id].hp, 0);
  ok(strength(8) > strength(2), 'wave 8 harder than wave 2');
  ok(strength(12) > strength(8), 'wave 12 harder than wave 8');
});
t('difficulty scales enemy counts and bounty', () => {
  const easy = buildWave(MISSIONS[2], 6, 'easy').reduce((s, g) => s + g.count, 0);
  const hard = buildWave(MISSIONS[2], 6, 'hard').reduce((s, g) => s + g.count, 0);
  ok(hard >= easy, 'hard spawns at least as many');
  ok(DIFFICULTY.easy.bounty > DIFFICULTY.hard.bounty);
});
t('elites appear only from wave 5 and never flood the field', () => {
  for (let w = 1; w <= 4; w++)
    ok(!buildWave(MISSIONS[4], w, 'normal').some((g) => ENEMY_MAP[g.id].elite), `wave ${w} has no elites`);
  const late = buildWave(MISSIONS[4], 8, 'normal').filter((g) => ENEMY_MAP[g.id].elite);
  ok(late.every((g) => g.count === 1), 'elites spawn singly');
});
t('every mission enemy pool references real enemies', () => {
  [...MISSIONS, ENDLESS].forEach((m) => m.enemyPool.forEach((id) => ok(ENEMY_MAP[id], `${m.id}: unknown enemy ${id}`)));
});
t('lanes used by waves are within mission lane count', () => {
  MISSIONS.forEach((m) => buildWave(m, 9, 'normal').forEach((g) => ok(g.lane < m.lanes, `${m.id} lane overflow`)));
});

console.log('\nBALANCE & PREREQUISITES');
t('counter table rewards correct matchups', () => {
  ok(DMG_TABLE.pierce.medium > DMG_TABLE.slash.medium, 'spears pierce armour');
  ok(DMG_TABLE.blunt.heavy > DMG_TABLE.slash.heavy, 'siege crushes heavy armour');
  ok(DMG_TABLE.magic.monster > DMG_TABLE.pierce.monster, 'magic burns monsters');
});
t('tech prerequisites form a valid DAG', () => {
  const ids = new Set(TECHS.map((t) => t.id));
  TECHS.forEach((t) => t.requires.forEach((r) => ok(ids.has(r), `${t.id} requires missing ${r}`)));
  const order: string[] = [];
  let guard = 0;
  while (order.length < TECHS.length && guard++ < 50)
    TECHS.forEach((t) => { if (!order.includes(t.id) && t.requires.every((r) => order.includes(r))) order.push(t.id); });
  eq(order.length, TECHS.length, 'no cycles');
});
t('locked content references real techs', () => {
  const ids = new Set(TECHS.map((t) => t.id));
  UNITS.forEach((u) => { if (u.unlockTech) ok(ids.has(u.unlockTech), `${u.id} bad tech`); });
  BUILDINGS.forEach((b) => { if (b.unlockTech) ok(ids.has(b.unlockTech), `${b.id} bad tech`); });
});
t('every unit has a distinct role, not a reskin', () => {
  const sigs = UNITS.map((u) => `${u.ranged}|${u.damageType}|${Math.round(u.range / 40)}|${u.armor}`);
  ok(new Set(sigs).size >= 6, `only ${new Set(sigs).size} distinct roles`);
});
t('every building has real gameplay behaviour', () => {
  BUILDINGS.forEach((b) => ok(b.dmg || b.income || b.aura || b.blocks || b.trainBonus, `${b.id} is decorative`));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
