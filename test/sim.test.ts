/**
 * Headless battle-simulation tests. Stubs canvas/DOM so the real engine runs in node.
 * Verifies combat, waves, deployment, construction, economy and failure states.
 */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const ctxStub = new Proxy({} as any, {
  get: (_t, p) => {
    if (p === 'canvas') return { width: 0, height: 0 };
    if (p === 'imageSmoothingEnabled' || p === 'globalAlpha' || p === 'lineWidth') return 1;
    return () => undefined;
  },
  set: () => true,
});
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctxStub }),
};
(globalThis as any).window = { devicePixelRatio: 1, AudioContext: undefined, setInterval: () => 0 };
(globalThis as any).requestAnimationFrame = () => 0;
(globalThis as any).cancelAnimationFrame = () => undefined;
(globalThis as any).performance = globalThis.performance || { now: () => Date.now() };

import { Game } from '../src/game/engine';
import { MISSIONS, ENDLESS, BUILDING_MAP } from '../src/game/data';
import { defaultSave } from '../src/game/save';
import { TILE } from '../src/game/sprites';

let pass = 0, fail = 0;
const t = (n: string, f: () => void) => { try { f(); pass++; console.log(`  ✓ ${n}`); } catch (e: any) { fail++; console.error(`  ✗ ${n}: ${e.message}`); } };
const ok = (c: any, m = 'failed') => { if (!c) throw new Error(m); };

function newGame(mi = MISSIONS[1], techs: string[] = []) {
  const canvas: any = { width: 800, height: 450, style: {}, getContext: () => ctxStub };
  const save = { ...defaultSave(0), techs };
  return new Game(canvas, mi, 'normal', save, () => { });
}
function step(g: Game, seconds: number, dt = 1 / 30) {
  for (let i = 0; i < seconds / dt; i++) g.update(dt);
}

console.log('\nWORLD');
t('world generates terrain, lanes, spawns, base, lairs and treasures', () => {
  const g = newGame();
  ok(g.terrain.length === g.cols * g.rows, 'terrain grid');
  ok(g.lanes.length === MISSIONS[1].lanes, 'lane count');
  ok(g.spawns.length === MISSIONS[1].lanes, 'spawn count');
  ok(g.base && g.base.hp > 0, 'base exists');
  ok(g.buildings.filter((b) => b.isLair).length === MISSIONS[1].lairs, 'lairs');
  ok(g.treasures.length === MISSIONS[1].treasures, 'treasures');
});
t('camera clamps to world bounds and zoom limits', () => {
  const g = newGame();
  g.resize(800, 450);
  g.focus(-99999, -99999);
  ok(g.cam.x >= 0 && g.cam.y >= 0, 'clamped min');
  g.focus(1e9, 1e9);
  ok(g.cam.x <= g.cols * TILE && g.cam.y <= g.rows * TILE, 'clamped max');
  for (let i = 0; i < 40; i++) g.zoomBy(0.5);
  ok(g.cam.z >= 0.35, 'zoom floor');
  for (let i = 0; i < 40; i++) g.zoomBy(2);
  ok(g.cam.z <= 2.4, 'zoom ceiling');
});

console.log('\nRECRUITMENT & DEPLOYMENT');
t('recruiting with enough gold succeeds and deducts cost', () => {
  const g = newGame();
  const gold = g.gold, cost = g.unitCost('swordsman');
  ok(g.recruit('swordsman', 2) === null);
  ok(g.gold === gold - cost * 2, 'gold deducted');
  ok(g.reserves.swordsman === 2, 'reserve filled');
});
t('recruiting without gold is rejected', () => {
  const g = newGame(); g.gold = 5;
  ok(g.recruit('swordsman', 1) === 'Not enough gold');
  ok(!g.reserves.swordsman);
});
t('locked units cannot be recruited', () => {
  const g = newGame();
  ok(g.recruit('knight', 1) === 'Requires research');
});
t('deployment consumes reserve and spawns a real unit', () => {
  const g = newGame(); g.recruit('swordsman', 1);
  const err = g.deploy('swordsman', g.base.x + 100, g.base.y);
  ok(err === null, String(err));
  ok(g.reserves.swordsman === 0, 'reserve consumed');
  ok(g.units.filter((u) => u.team === 0).length === 1, 'unit on field');
});
t('deployment without reserves or in enemy land is rejected', () => {
  const g = newGame();
  ok(g.deploy('archer', g.base.x, g.base.y) === 'No reserves of that unit');
  g.recruit('archer', 1);
  ok(g.deploy('archer', g.cols * TILE * 0.9, g.base.y) === 'Too deep in enemy land');
  ok(g.reserves.archer === 1, 'reserve not consumed on failure');
});
t('presets buy missing troops and never create free units', () => {
  const g = newGame(); g.gold = 10000;
  const before = g.gold;
  ok(g.deployPreset([{ id: 'swordsman', n: 3 }], g.base.x + 80, g.base.y) === null);
  ok(g.gold < before, 'gold was spent');
  ok(g.units.filter((u) => u.team === 0).length === 3, '3 deployed');
  const g2 = newGame(); g2.gold = 0;
  ok(g2.deployPreset([{ id: 'swordsman', n: 3 }], g2.base.x, g2.base.y) !== null, 'rejected when broke');
  ok(g2.units.filter((u) => u.team === 0).length === 0, 'no free units');
});

console.log('\nCONSTRUCTION');
t('valid placement costs gold and creates a working building', () => {
  const g = newGame();
  const gold = g.gold;
  const tx = g.base.tx + 8, ty = g.base.ty;
  const err = g.tryPlaceBuilding('arrow_tower', tx, ty);
  ok(err === null, String(err));
  ok(g.gold === gold - BUILDING_MAP.arrow_tower.cost, 'cost deducted');
  ok(g.buildings.some((b) => b.defId === 'arrow_tower'), 'exists');
});
t('overlapping and out-of-bounds placement is rejected without charging', () => {
  const g = newGame();
  g.tryPlaceBuilding('arrow_tower', g.base.tx + 8, g.base.ty);
  const gold = g.gold;
  ok(g.tryPlaceBuilding('arrow_tower', g.base.tx + 8, g.base.ty) === 'Invalid placement');
  ok(g.tryPlaceBuilding('arrow_tower', -5, -5) === 'Invalid placement');
  ok(g.gold === gold, 'no charge on failure');
});
t('placement without gold or research is rejected', () => {
  const g = newGame(); g.gold = 1;
  ok(g.tryPlaceBuilding('arrow_tower', g.base.tx + 8, g.base.ty) === 'Not enough gold');
  g.gold = 99999;
  ok(g.tryPlaceBuilding('arcane_tower', g.base.tx + 8, g.base.ty) === 'Requires research');
});
t('upgrade, repair and sell work with correct accounting', () => {
  const g = newGame(); g.gold = 5000;
  g.tryPlaceBuilding('arrow_tower', g.base.tx + 8, g.base.ty);
  g.selected = g.buildings.find((b) => b.defId === 'arrow_tower')!;
  const hp0 = (g.selected as any).max;
  ok(g.upgradeSelected() === null);
  ok((g.selected as any).level === 2 && (g.selected as any).max > hp0, 'upgraded');
  (g.selected as any).hp = 10;
  ok(g.repairSelected() === null);
  ok((g.selected as any).hp === (g.selected as any).max, 'repaired');
  const gold = g.gold;
  ok(g.sellSelected() === null);
  ok(g.gold > gold && !g.buildings.some((b) => b.defId === 'arrow_tower'), 'sold & removed');
});
t('the keep cannot be sold', () => {
  const g = newGame(); g.selected = g.base;
  ok(g.sellSelected() === 'Cannot sell');
});

console.log('\nCOMBAT & WAVES');
t('starting a wave queues enemies that actually spawn', () => {
  const g = newGame();
  g.startWave();
  ok(g.phase === 'battle' && g.spawnQueue.length > 0, 'queued');
  step(g, 6);
  ok(g.units.some((u) => u.team === 1), 'enemies on the field');
});
t('melee and ranged units kill enemies and earn kill gold', () => {
  const g = newGame(); g.gold = 100000;
  g.recruit('swordsman', 6); g.recruit('archer', 6);
  g.startWave();
  for (let i = 0; i < 6; i++) ok(g.deploy('swordsman', g.base.x + 200, g.base.y - 60 + i * 20) === null, 'melee deployed');
  for (let i = 0; i < 6; i++) ok(g.deploy('archer', g.base.x + 140, g.base.y - 60 + i * 20) === null, 'archers deployed');
  const gold = g.gold;
  step(g, 180);
  ok(g.killCount > 0, 'enemies were killed');
  ok(g.gold > gold, 'kill gold awarded');
});
t('defence towers shoot and damage enemies', () => {
  const g = newGame(); g.gold = 100000;
  const sp = g.spawns[0];
  const tx = Math.floor(sp.x / TILE) - 6, ty = Math.floor(sp.y / TILE);
  let placed = false;
  for (let o = 0; o < 10 && !placed; o++) placed = g.tryPlaceBuilding('arrow_tower', tx - o, ty) === null;
  ok(placed, 'tower placed near the spawn');
  g.startWave();
  step(g, 25);
  ok(g.killCount > 0 || g.projectiles.length > 0, 'tower engaged enemies');
});
t('a wave completes and returns to preparation', () => {
  const g = newGame(MISSIONS[0]); g.gold = 100000;
  g.startWave();
  // overwhelming defence so the wave resolves
  g.recruit('swordsman', 40);
  for (let i = 0; i < 40; i++) g.deploy('swordsman', g.base.x + 150, g.base.y - 200 + i * 10);
  let guard = 0;
  while (g.phase === 'battle' && guard++ < 20000) g.update(1 / 30);
  ok(g.phase === 'prep', `wave resolved (phase=${g.phase})`);
  ok(g.wave === 1 && g.spawnQueue.length === 0, 'clean completion');
});
t('enemies reach and damage the keep when undefended', () => {
  const g = newGame(MISSIONS[0]);
  g.startWave();
  const hp0 = g.base.hp;
  let guard = 0;
  while (g.base.hp === hp0 && guard++ < 9000) g.update(1 / 30);
  ok(g.base.hp < hp0, 'keep took damage');
});
t('base destruction triggers defeat', () => {
  const g = newGame(MISSIONS[0]);
  g.startWave();
  step(g, 2);
  g.base.hp = 1;
  let guard = 0;
  while (g.phase === 'battle' && guard++ < 9000) g.update(1 / 30);
  ok(g.phase === 'defeat', `phase=${g.phase}`);
});
t('no permanent stall: simulation stays bounded with no enemies', () => {
  const g = newGame();
  g.startWave();
  g.spawnQueue.length = 0;
  g.units.forEach((u) => (u.hp = 0));
  step(g, 2);
  ok(g.phase === 'prep', 'empty wave completes instead of freezing');
});
t('destroying every lair satisfies the lair objective', () => {
  const g = newGame(MISSIONS[1]);
  g.buildings.filter((b) => b.isLair).forEach((b) => g.kill(b));
  g.refreshObjectives();
  const lairObj = MISSIONS[1].objectives.find((o) => o.kind === 'lairs')!;
  ok(g.objectiveState[lairObj.id].done, 'objective complete');
});
t('treasure is collected by nearby troops and pays once', () => {
  const g = newGame(); g.gold = 100000;
  const tr = g.treasures[0];
  tr.x = g.base.x + 120; tr.y = g.base.y;
  g.recruit('swordsman', 1);
  g.deploy('swordsman', tr.x + 10, tr.y);
  const gold = g.gold;
  step(g, 1);
  ok(tr.taken && g.gold === gold + tr.gold, 'paid once');
  const gold2 = g.gold;
  step(g, 1);
  ok(g.gold === gold2, 'no duplicate payout');
});
t('farm income is paid at wave completion only', () => {
  const g = newGame(MISSIONS[0]); g.gold = 100000;
  ok(g.tryPlaceBuilding('farm', g.base.tx + 8, g.base.ty + 6) === null);
  const gold = g.gold;
  step(g, 3);
  ok(g.gold === gold, 'no income mid-preparation');
  g.startWave(); g.spawnQueue.length = 0; g.units.forEach((u) => (u.hp = 0));
  step(g, 1);
  ok(g.gold > gold, 'income paid after the wave');
});
t('tactical commands change unit behaviour', () => {
  const g = newGame(); g.recruit('swordsman', 2);
  g.deploy('swordsman', g.base.x + 100, g.base.y);
  g.deploy('swordsman', g.base.x + 120, g.base.y);
  g.command('hold');
  ok(g.units.every((u) => u.team !== 0 || u.stance === 'hold'));
  g.command('retreat');
  ok(g.units.every((u) => u.team !== 0 || u.stance === 'retreat'));
  g.command('resume');
  ok(g.units.every((u) => u.team !== 0 || u.stance === 'auto'));
});
t('selection and box selection work in world space', () => {
  const g = newGame(); g.recruit('archer', 3);
  for (let i = 0; i < 3; i++) g.deploy('archer', g.base.x + 100, g.base.y + i * 20);
  const u = g.units[0];
  ok(g.selectAt(u.x, u.y - 14) === u, 'tap selection');
  ok(g.boxSelect(g.base.x, g.base.y - 100, g.base.x + 300, g.base.y + 300) === 3, 'box selection');
});
t('endless mode never ends in victory and keeps scaling', () => {
  const g = newGame(ENDLESS);
  g.wave = 20;
  g.startWave();
  ok(g.spawnQueue.length > 10, 'late endless waves are large');
  g.spawnQueue.length = 0; g.units.forEach((u) => (u.hp = 0));
  step(g, 1);
  ok(g.phase === 'prep', 'returns to prep, never victory');
});

console.log('\nPERFORMANCE');
t('large battle (300+ entities) simulates faster than realtime', () => {
  const g = newGame(MISSIONS[4]); g.gold = 1e6;
  g.wave = 10; g.startWave();
  g.recruit('swordsman', 60); g.recruit('archer', 60);
  for (let i = 0; i < 60; i++) g.deploy('swordsman', g.base.x + 200, g.base.y - 300 + i * 10);
  for (let i = 0; i < 60; i++) g.deploy('archer', g.base.x + 160, g.base.y - 300 + i * 10);
  step(g, 10);
  const n = g.units.length;
  const t0 = Date.now();
  step(g, 5);
  const ms = Date.now() - t0;
  console.log(`      ${n} units · 5s of simulation in ${ms}ms (${(5000 / ms).toFixed(1)}× realtime)`);
  ok(ms < 5000, 'faster than realtime');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
