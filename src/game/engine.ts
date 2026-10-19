import {
  BUILDING_MAP, DIFFICULTY, DMG_TABLE, ENEMY_MAP, UNIT_MAP, buildWave, mulberry,
  type BuildingDef, type Difficulty, type MissionDef, type UnitDef,
} from './data';
import {
  GRID, TILE, TERRAINS, makeCreatureSheet, makeBuildingSheet, makeTerrainAtlas,
  type Sheet, type TerrainKind,
} from './sprites';
import { audio } from './audio';
import type { SaveData } from './save';

const PXS = 2;
const SPRITE = GRID * PXS;
const CHUNK = 8; // tiles per chunk

export type Phase = 'prep' | 'battle' | 'victory' | 'defeat';

export type Snapshot = {
  phase: Phase;
  wave: number;
  totalWaves: number;
  gold: number;
  killGold: number;
  baseHp: number;
  baseMax: number;
  speed: number;
  enemiesAlive: number;
  alliesAlive: number;
  reserves: Record<string, number>;
  objectives: { id: string; text: string; optional?: boolean; done: boolean; failed: boolean; progress: string }[];
  selected: { kind: 'building' | 'unit'; id: string; name: string; hp: number; max: number; level: number; info: string } | null;
  nextWave: { name: string; count: number }[];
  fps: number;
  unitCount: number;
  lairsLeft: number;
  capture: number;
  weather: string;
  message: string | null;
  lostUnits: number;
  killCount: number;
};

type Team = 0 | 1; // 0 player, 1 enemy

type Unit = {
  id: number; team: Team; defId: string;
  x: number; y: number; hp: number; max: number;
  dmg: number; rate: number; range: number; speed: number;
  armor: string; red: number; dtype: string; ranged: boolean; splash: number;
  bonusVs: string[]; tags: string[]; priority: string;
  cd: number; target: Unit | Building | null; frame: number; anim: number; face: 1 | -1;
  lane: number; wp: number; dead: boolean; deadT: number; sheet: Sheet; scale: number;
  stance: 'auto' | 'hold' | 'retreat'; hold: { x: number; y: number } | null;
  bounty: number; ability?: string; abilityCd: number; selected: boolean; targetsBuildings: boolean;
  hitFlash: number; xpUnit?: string;
};

type Building = {
  id: number; defId: string; team: Team; tx: number; ty: number; w: number; h: number;
  x: number; y: number; hp: number; max: number; level: number; cd: number;
  sheet: Sheet; isBase?: boolean; isLair?: boolean; spawnCd?: number; hitFlash: number; selected: boolean;
};

type Projectile = {
  x: number; y: number; tx: number; ty: number; vx: number; vy: number; life: number;
  dmg: number; dtype: string; splash: number; team: Team; kind: 'arrow' | 'bolt' | 'rock' | 'magic';
  target: Unit | Building | null; bonusVs: string[]; owner?: Unit;
};

type Effect = { x: number; y: number; t: number; life: number; kind: string; v: number; text?: string; color?: string };

function dist2(ax: number, ay: number, bx: number, by: number) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  mission: MissionDef;
  diff: Difficulty;
  save: SaveData;
  onState: (s: Snapshot) => void;

  // world
  cols = 110; rows = 76;
  terrain!: Uint8Array;
  buildable!: Uint8Array;
  occupied!: Uint8Array;
  chunks = new Map<string, HTMLCanvasElement>();
  atlas!: HTMLCanvasElement;
  lanes: { x: number; y: number }[][] = [];
  spawns: { x: number; y: number }[] = [];
  treasures: { x: number; y: number; taken: boolean; gold: number }[] = [];
  beacon: { x: number; y: number; progress: number } | null = null;

  // entities
  units: Unit[] = [];
  buildings: Building[] = [];
  projectiles: Projectile[] = [];
  effects: Effect[] = [];
  grid = new Map<number, Unit[]>();
  cell = 128;
  nextId = 1;

  // state
  phase: Phase = 'prep';
  wave = 0;
  gold = 0;
  killGold = 0;
  killCount = 0;
  lostUnits = 0;
  speed = 1;
  running = true;
  reserves: Record<string, number> = {};
  spawnQueue: { id: string; lane: number; t: number }[] = [];
  objectiveState: Record<string, { done: boolean; failed: boolean }> = {};
  message: string | null = null;
  msgT = 0;
  weather: 'none' | 'rain' | 'fog' | 'storm' | 'blizzard' = 'none';
  weatherParticles: { x: number; y: number; v: number }[] = [];
  base!: Building;
  selected: Unit | Building | null = null;
  placing: { defId: string } | null = null;
  placeValid = false;
  placeTile = { x: 0, y: 0 };
  commandMode: null | 'move' | 'hold' = null;

  // camera
  cam = { x: 0, y: 0, z: 1 };
  view = { w: 800, h: 450 };
  rnd: () => number;

  // perf
  fps = 60;
  private acc = 0; private frames = 0; private lastT = 0;
  private sheets = new Map<string, Sheet>();
  private raf = 0;
  private statTimer = 0;
  destroyed = false;
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(canvas: HTMLCanvasElement, mission: MissionDef, diff: Difficulty, save: SaveData, onState: (s: Snapshot) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.mission = mission;
    this.diff = diff;
    this.save = save;
    this.onState = onState;
    this.rnd = mulberry(mission.id.length * 9176 + mission.waves * 31);
    this.gold = mission.startGold;
    this.weather = (mission.hazard ?? 'none') as any;
    this.atlas = makeTerrainAtlas();
    this.generateWorld();
    mission.objectives.forEach((o) => (this.objectiveState[o.id] = { done: false, failed: false }));
    this.lastT = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    audio.setMood('prep');
  }

  destroy() { this.destroyed = true; cancelAnimationFrame(this.raf); }

  // ---------- assets ----------
  sheetFor(key: string, make: () => Sheet) {
    let s = this.sheets.get(key);
    if (!s) { s = make(); this.sheets.set(key, s); }
    return s;
  }

  // ---------- world ----------
  generateWorld() {
    const { cols, rows } = this;
    this.terrain = new Uint8Array(cols * rows);
    this.buildable = new Uint8Array(cols * rows);
    this.occupied = new Uint8Array(cols * rows);
    const r = mulberry(this.mission.id.charCodeAt(1) * 7331 + this.mission.waves);
    const biome = this.mission.biome;
    const baseTiles: Record<string, TerrainKind[]> = {
      green: ['grass', 'grass2'], swamp: ['swamp', 'grass2'], snow: ['snow', 'snow'], desert: ['sand', 'dirt'],
    };
    const accent: Record<string, TerrainKind> = { green: 'forest', swamp: 'water', snow: 'rock', desert: 'rock' };
    const idx = (t: TerrainKind) => TERRANIDX[t];
    const bt = baseTiles[biome];

    // base noise
    const noise = (x: number, y: number, s: number) => {
      const n = Math.sin(x * s + r() * 0) * 0 + (Math.sin(x * s) * Math.cos(y * s * 1.3) + Math.sin((x + y) * s * 0.6)) / 2;
      return n;
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const n = noise(x, y, 0.13);
        let t: TerrainKind = n > 0.35 ? bt[1] : bt[0];
        if (n > 0.72) t = accent[biome];
        if (n < -0.72) t = biome === 'desert' ? 'dirt' : biome === 'snow' ? 'rock' : 'water';
        this.terrain[y * cols + x] = idx(t);
        const passable = t !== 'water' && t !== 'rock' && t !== 'forest';
        this.buildable[y * cols + x] = passable ? 1 : 0;
      }
    }

    // lanes from right spawns to base on the left
    const baseTx = 10, baseTy = Math.floor(rows / 2) - 2;
    const n = this.mission.lanes;
    for (let i = 0; i < n; i++) {
      const sy = Math.floor(((i + 0.5) / n) * (rows - 8)) + 4;
      const pts: { x: number; y: number }[] = [];
      const sx = cols - 3;
      this.spawns.push({ x: sx * TILE, y: sy * TILE });
      let cy = sy;
      for (let x = sx; x > baseTx + 3; x -= 4) {
        cy += Math.round((Math.sin(x * 0.17 + i * 2.1) * 2));
        cy = Math.max(3, Math.min(rows - 4, cy));
        pts.push({ x: x * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
        // carve path
        for (let dx = -4; dx <= 0; dx++)
          for (let dy = -2; dy <= 2; dy++) {
            const tx = x + dx, ty = cy + dy;
            if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue;
            const k = ty * cols + tx;
            this.terrain[k] = idx(Math.abs(dy) < 2 ? 'path' : 'dirt');
            this.buildable[k] = 1;
          }
      }
      pts.push({ x: (baseTx + 3) * TILE, y: (baseTy + 2) * TILE });
      this.lanes.push(pts);
    }

    // base keep
    const keepDef: BuildingDef = {
      id: 'keep', name: 'Royal Keep', desc: 'Your kingdom. If it falls, you lose.', cost: 0,
      hp: 4000, category: 'defense', w: 5, h: 5, upgradeCost: 400,
      style: { kind: 'keep', stone: '#9a9aa4', roof: this.save.cosmetics.color, accent: this.save.cosmetics.color, w: 5, h: 5 },
    };
    (BUILDING_MAP as any).keep = keepDef;
    this.base = this.makeBuilding('keep', baseTx - 2, baseTy, 0)!;
    this.base.isBase = true;
    this.base.max = Math.round(keepDef.hp * (1 + (this.save.techs.includes('tech_masonry') ? 0.3 : 0)));
    this.base.hp = this.base.max;

    // lairs
    const lairDef: BuildingDef = {
      id: 'lair', name: 'Monster Lair', desc: 'Enemy structure that breeds reinforcements.', cost: 0,
      hp: 900, category: 'defense', w: 3, h: 3, upgradeCost: 0,
      style: { kind: 'lair', stone: '#4a3a33', roof: '#2e2420', accent: '#6b2222', w: 3, h: 3 },
    };
    (BUILDING_MAP as any).lair = lairDef;
    for (let i = 0; i < this.mission.lairs; i++) {
      const tx0 = cols - 22 + Math.floor(r() * 12);
      const ty0 = 6 + Math.floor(((i + 0.5) / Math.max(1, this.mission.lairs)) * (rows - 14));
      let b: Building | null = null;
      // search outward for a legal spot so every configured lair really exists
      for (let radius = 0; radius < 14 && !b; radius++)
        for (let dy = -radius; dy <= radius && !b; dy++)
          for (let dx = -radius; dx <= radius && !b; dx++) {
            const tx = Math.max(1, Math.min(cols - 5, tx0 + dx));
            const ty = Math.max(1, Math.min(rows - 5, ty0 + dy));
            if (this.canPlace(lairDef, tx, ty)) b = this.makeBuilding('lair', tx, ty, 1);
          }
      if (b) { b.isLair = true; b.spawnCd = 14; }
    }

    // treasures
    for (let i = 0; i < this.mission.treasures; i++) {
      const tx = 20 + Math.floor(r() * (cols - 40));
      const ty = 4 + Math.floor(r() * (rows - 8));
      this.treasures.push({ x: tx * TILE, y: ty * TILE, taken: false, gold: 60 + Math.floor(r() * 90) });
    }
    if (this.mission.objectives.some((o) => o.kind === 'capture')) {
      this.beacon = { x: (cols - 30) * TILE, y: (rows / 2) * TILE, progress: 0 };
    }

    // weather particles
    const count = this.weather === 'none' ? 0 : this.weather === 'fog' ? 0 : 220;
    for (let i = 0; i < count; i++) this.weatherParticles.push({ x: Math.random() * 1600, y: Math.random() * 900, v: 300 + Math.random() * 400 });

    this.cam.x = this.base.x - 200;
    this.cam.y = this.base.y;
    this.cam.z = 1;
  }

  chunkCanvas(cx: number, cy: number) {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = CHUNK * TILE; c.height = CHUNK * TILE;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < CHUNK; y++)
      for (let x = 0; x < CHUNK; x++) {
        const tx = cx * CHUNK + x, ty = cy * CHUNK + y;
        if (tx >= this.cols || ty >= this.rows) continue;
        const t = this.terrain[ty * this.cols + tx];
        g.drawImage(this.atlas, t * TILE, 0, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
      }
    this.chunks.set(key, c);
    return c;
  }

  // ---------- spawning ----------
  makeBuilding(defId: string, tx: number, ty: number, team: Team): Building | null {
    const def = (BUILDING_MAP as any)[defId] as BuildingDef;
    if (!def) return null;
    if (!this.canPlace(def, tx, ty)) return null;
    const hpMul = team === 0 && this.save.techs.includes('tech_masonry') ? 1.3 : 1;
    const b: Building = {
      id: this.nextId++, defId, team, tx, ty, w: def.w, h: def.h,
      x: (tx + def.w / 2) * TILE, y: (ty + def.h / 2) * TILE,
      hp: def.hp * hpMul, max: def.hp * hpMul, level: 1, cd: 0, hitFlash: 0, selected: false,
      sheet: this.sheetFor('b_' + defId, () => makeBuildingSheet(def.style)),
    };
    for (let y = ty; y < ty + def.h; y++)
      for (let x = tx; x < tx + def.w; x++) this.occupied[y * this.cols + x] = 1;
    this.buildings.push(b);
    return b;
  }

  canPlace(def: BuildingDef, tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx + def.w > this.cols || ty + def.h > this.rows) return false;
    for (let y = ty; y < ty + def.h; y++)
      for (let x = tx; x < tx + def.w; x++) {
        const k = y * this.cols + x;
        if (!this.buildable[k] || this.occupied[k]) return false;
      }
    return true;
  }

  spawnUnit(defId: string, team: Team, x: number, y: number, lane = 0): Unit {
    const def: any = team === 0 ? UNIT_MAP[defId] : ENEMY_MAP[defId];
    const d = DIFFICULTY[this.diff];
    const lvl = team === 0 ? (this.save.unitLevels[defId] || 1) : 1;
    const techHp = team === 0 && this.save.techs.includes('tech_armor') ? 1.12 : 1;
    const techDmg = team === 0 && this.save.techs.includes('tech_weapons') ? 1.15 : 1;
    const barracks = team === 0 && this.buildings.some((b) => b.team === 0 && BUILDING_MAP[b.defId]?.trainBonus && (def as UnitDef).tags?.includes(BUILDING_MAP[b.defId].trainBonus!));
    const lvlMul = 1 + (lvl - 1) * 0.12;
    const hp = (def.hp * (team === 1 ? d.hp : techHp * lvlMul * (barracks ? 1.1 : 1)));
    const dmg = def.dmg * (team === 1 ? d.dmg : techDmg * lvlMul);
    const u: Unit = {
      id: this.nextId++, team, defId, x, y, hp, max: hp, dmg,
      rate: def.attackSpeed, range: def.range * (team === 0 && def.ranged && this.buildings.some(b => b.defId === 'archery_range' && b.team === 0) ? 1.1 : 1),
      speed: def.speed * (team === 0 && def.tags?.includes('cavalry') && this.buildings.some(b => b.defId === 'stable') ? 1.1 : 1),
      armor: def.armor, red: def.reduction, dtype: def.damageType, ranged: !!def.ranged, splash: def.splash || 0,
      bonusVs: def.bonusVs || [], tags: def.tags || [], priority: def.priority || 'nearest',
      cd: Math.random(), target: null, frame: 0, anim: Math.random() * 2, face: team === 0 ? 1 : -1,
      lane, wp: 0, dead: false, deadT: 0, scale: def.style.scale || 1,
      sheet: this.sheetFor((team ? 'e_' : 'u_') + defId, () => makeCreatureSheet(def.style)),
      stance: 'auto', hold: null, bounty: def.bounty || 0, ability: def.ability, abilityCd: 6,
      selected: false, targetsBuildings: !!def.targetsBuildings, hitFlash: 0,
      xpUnit: team === 0 ? defId : undefined,
    };
    this.units.push(u);
    return u;
  }

  // ---------- player actions ----------
  recruit(defId: string, qty: number): string | null {
    const def = UNIT_MAP[defId];
    if (!def) return 'Unknown unit';
    if (def.unlockTech && !this.save.techs.includes(def.unlockTech)) return 'Requires research';
    const cost = this.unitCost(defId) * qty;
    if (cost > this.gold) return 'Not enough gold';
    this.gold -= cost;
    this.reserves[defId] = (this.reserves[defId] || 0) + qty;
    audio.play('coin');
    return null;
  }

  unitCost(defId: string) {
    const def = UNIT_MAP[defId];
    let c = def.cost;
    if (this.save.techs.includes('tech_logistics')) c *= 0.9;
    const bonusBld = this.buildings.find((b) => b.team === 0 && BUILDING_MAP[b.defId]?.trainBonus && def.tags.includes(BUILDING_MAP[b.defId].trainBonus!));
    if (bonusBld) c *= 0.85;
    return Math.round(c);
  }

  deploy(defId: string, wx: number, wy: number): string | null {
    if ((this.reserves[defId] || 0) <= 0) return 'No reserves of that unit';
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return 'Outside the battlefield';
    if (!this.buildable[ty * this.cols + tx]) return 'Impassable terrain';
    if (wx > this.cols * TILE * 0.62) return 'Too deep in enemy land';
    this.reserves[defId]!--;
    const lane = this.nearestLane(wx, wy);
    const u = this.spawnUnit(defId, 0, wx + (Math.random() - 0.5) * 24, wy + (Math.random() - 0.5) * 24, lane);
    u.wp = this.nearestWaypoint(lane, u.x, u.y);
    this.fx(wx, wy, 'spawn');
    audio.play('build');
    return null;
  }

  deployPreset(list: { id: string; n: number }[], wx: number, wy: number): string | null {
    // validate first: never silently create free units
    for (const e of list) {
      const have = this.reserves[e.id] || 0;
      const need = e.n - have;
      if (need > 0) {
        const cost = this.unitCost(e.id) * need;
        if (cost > this.gold) return `Need ${UNIT_MAP[e.id].name} x${need} (${cost}g)`;
      }
    }
    for (const e of list) {
      const need = e.n - (this.reserves[e.id] || 0);
      if (need > 0) this.recruit(e.id, need);
      for (let i = 0; i < e.n; i++) this.deploy(e.id, wx + (Math.random() - 0.5) * 80, wy + (Math.random() - 0.5) * 80);
    }
    return null;
  }

  nearestLane(x: number, y: number) {
    let best = 0, bd = Infinity;
    this.lanes.forEach((l, i) => {
      for (const p of l) { const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = i; } }
    });
    return best;
  }
  nearestWaypoint(lane: number, x: number, y: number) {
    const l = this.lanes[lane]; let best = 0, bd = Infinity;
    l.forEach((p, i) => { const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  tryPlaceBuilding(defId: string, tx: number, ty: number): string | null {
    const def = BUILDING_MAP[defId];
    if (!def) return 'Unknown building';
    if (def.unlockTech && !this.save.techs.includes(def.unlockTech)) return 'Requires research';
    if (this.gold < def.cost) return 'Not enough gold';
    if (!this.canPlace(def, tx, ty)) return 'Invalid placement';
    const b = this.makeBuilding(defId, tx, ty, 0);
    if (!b) return 'Invalid placement';
    this.gold -= def.cost;
    this.fx(b.x, b.y, 'build');
    audio.play('build');
    return null;
  }

  upgradeSelected(): string | null {
    const s = this.selected;
    if (!s || !('defId' in s) || !('tx' in s)) return 'Nothing selected';
    const b = s as Building;
    const def = BUILDING_MAP[b.defId];
    if (!def || b.isBase || b.team !== 0) return 'Cannot upgrade';
    const cost = Math.round(def.upgradeCost * Math.pow(1.6, b.level - 1));
    if (this.gold < cost) return 'Not enough gold';
    this.gold -= cost;
    b.level++;
    b.max = Math.round(b.max * 1.35); b.hp = b.max;
    audio.play('build');
    return null;
  }

  repairSelected(): string | null {
    const b = this.selected as Building;
    if (!b || !('tx' in b) || b.team !== 0) return 'Nothing selected';
    const missing = b.max - b.hp;
    if (missing <= 1) return 'Already at full health';
    const cost = Math.ceil(missing * 0.15);
    if (this.gold < cost) return `Repair costs ${cost}g`;
    this.gold -= cost; b.hp = b.max;
    audio.play('build');
    return null;
  }

  sellSelected(): string | null {
    const b = this.selected as Building;
    if (!b || !('tx' in b) || b.team !== 0 || b.isBase) return 'Cannot sell';
    const def = BUILDING_MAP[b.defId];
    this.gold += Math.round(def.cost * 0.5);
    this.removeBuilding(b);
    this.selected = null;
    audio.play('coin');
    return null;
  }

  removeBuilding(b: Building) {
    for (let y = b.ty; y < b.ty + b.h; y++)
      for (let x = b.tx; x < b.tx + b.w; x++) this.occupied[y * this.cols + x] = 0;
    this.buildings = this.buildings.filter((o) => o !== b);
  }

  command(kind: 'hold' | 'resume' | 'retreat', wx?: number, wy?: number) {
    const sel = this.units.filter((u) => u.selected && u.team === 0 && !u.dead);
    const list = sel.length ? sel : this.units.filter((u) => u.team === 0 && !u.dead);
    for (const u of list) {
      if (kind === 'hold') { u.stance = 'hold'; u.hold = { x: u.x, y: u.y }; }
      else if (kind === 'resume') { u.stance = 'auto'; u.hold = null; }
      else { u.stance = 'retreat'; u.hold = { x: this.base.x + 60, y: this.base.y + (Math.random() - 0.5) * 120 }; }
    }
    if (wx !== undefined && wy !== undefined) for (const u of list) { u.stance = 'hold'; u.hold = { x: wx + (Math.random() - 0.5) * 60, y: wy + (Math.random() - 0.5) * 60 }; }
  }

  startWave() {
    if (this.phase !== 'prep') return;
    this.wave++;
    const groups = buildWave(this.mission, this.wave, this.diff);
    this.spawnQueue = [];
    for (const g of groups)
      for (let i = 0; i < g.count; i++)
        this.spawnQueue.push({ id: g.id, lane: g.lane % this.lanes.length, t: g.delay + i * 0.45 });
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.phase = 'battle';
    this.speed = Math.max(1, this.speed);
    this.setMessage(`Wave ${this.wave} incoming!`);
    audio.play('wave');
    audio.setMood('battle');
  }

  previewWave() {
    const groups = buildWave(this.mission, this.wave + 1, this.diff);
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.id, (m.get(g.id) || 0) + g.count);
    return [...m.entries()].map(([id, count]) => ({ name: ENEMY_MAP[id].name, count }));
  }

  setMessage(m: string) { this.message = m; this.msgT = 3; }
  fx(x: number, y: number, kind: string, v = 1, text?: string, color?: string) {
    if (this.effects.length > 260) return;
    this.effects.push({ x, y, t: 0, life: kind === 'float' ? 1.1 : 0.4, kind, v, text, color });
  }

  // ---------- simulation ----------
  loop(t: number) {
    if (this.destroyed) return;
    const dtRaw = Math.min(0.05, (t - this.lastT) / 1000);
    this.lastT = t;
    this.frames++; this.acc += dtRaw;
    if (this.acc >= 0.5) { this.fps = Math.round(this.frames / this.acc); this.frames = 0; this.acc = 0; }

    const steps = this.phase === 'battle' && this.running ? Math.min(3, Math.round(this.speed)) : 0;
    for (let i = 0; i < steps; i++) this.update(dtRaw);
    if (steps === 0) this.updateIdle(dtRaw);

    this.render();
    this.statTimer += dtRaw;
    if (this.statTimer > 0.15) { this.statTimer = 0; this.onState(this.snapshot()); }
    this.raf = requestAnimationFrame(this.loop);
  }

  updateIdle(dt: number) {
    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    this.msgT -= dt; if (this.msgT <= 0) this.message = null;
    for (const u of this.units) u.anim += dt * 0.6;
  }

  buildGrid() {
    this.grid.clear();
    for (const u of this.units) {
      if (u.dead) continue;
      const k = (Math.floor(u.x / this.cell) << 12) ^ Math.floor(u.y / this.cell);
      let arr = this.grid.get(k); if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(u);
    }
  }
  queryNear(x: number, y: number, r: number, team: Team, out: Unit[]) {
    out.length = 0;
    const c0x = Math.floor((x - r) / this.cell), c1x = Math.floor((x + r) / this.cell);
    const c0y = Math.floor((y - r) / this.cell), c1y = Math.floor((y + r) / this.cell);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cy = c0y; cy <= c1y; cy++) {
        const arr = this.grid.get((cx << 12) ^ cy);
        if (!arr) continue;
        for (const u of arr) if (u.team === team && !u.dead && dist2(u.x, u.y, x, y) <= r * r) out.push(u);
      }
    return out;
  }

  private tmp: Unit[] = [];

  update(dt: number) {
    this.msgT -= dt; if (this.msgT <= 0) this.message = null;
    this.buildGrid();

    // spawn queue
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      this.spawnQueue[i].t -= dt;
      if (this.spawnQueue[i].t <= 0) {
        const s = this.spawnQueue.splice(i, 1)[0];
        const sp = this.spawns[s.lane] || this.spawns[0];
        const u = this.spawnUnit(s.id, 1, sp.x + (Math.random() - 0.5) * 60, sp.y + (Math.random() - 0.5) * 100, s.lane);
        u.wp = 0;
      }
    }

    // lairs breed reinforcements
    for (const b of this.buildings) {
      if (b.isLair && b.hp > 0) {
        b.spawnCd! -= dt;
        if (b.spawnCd! <= 0) {
          b.spawnCd = 16;
          const pool = this.mission.enemyPool.filter((p) => !ENEMY_MAP[p].elite);
          const id = pool[Math.floor(Math.random() * pool.length)];
          const u = this.spawnUnit(id, 1, b.x, b.y + 30, this.nearestLane(b.x, b.y));
          u.wp = this.nearestWaypoint(u.lane, u.x, u.y);
        }
      }
    }

    this.updateUnits(dt);
    this.updateBuildings(dt);
    this.updateProjectiles(dt);
    this.updateWorldObjectives(dt);

    for (const e of this.effects) e.t += dt;
    this.effects = this.effects.filter((e) => e.t < e.life);
    this.units = this.units.filter((u) => !(u.dead && u.deadT > 2.5));

    // wave completion
    const enemiesAlive = this.units.some((u) => u.team === 1 && !u.dead);
    if (this.phase === 'battle' && !enemiesAlive && this.spawnQueue.length === 0) this.completeWave();

    if (this.base.hp <= 0 && this.phase === 'battle') this.lose();
  }

  updateUnits(dt: number) {
    const near: Unit[] = this.tmp;
    for (const u of this.units) {
      if (u.dead) { u.deadT += dt; continue; }
      u.anim += dt; u.cd -= dt; u.hitFlash = Math.max(0, u.hitFlash - dt * 4);
      if (u.ability === 'regen') u.hp = Math.min(u.max, u.hp + 8 * dt);

      // target validation / acquisition (throttled by cooldown-free cheap check)
      let tgt = u.target as any;
      if (tgt && (tgt.dead || tgt.hp <= 0)) tgt = null;
      if (!tgt || (u.anim | 0) % 2 === 0) {
        const detect = Math.max(u.range + 70, 160);
        this.queryNear(u.x, u.y, detect, (1 - u.team) as Team, near);
        let best: any = null, bestScore = -Infinity;
        for (const e of near) {
          const d = Math.sqrt(dist2(u.x, u.y, e.x, e.y));
          let score = -d;
          if (u.priority === 'strongest') score = e.max - d * 0.5;
          if (u.priority === 'weakest') score = -e.hp - d * 0.5;
          if (u.bonusVs.some((t) => e.tags.includes(t))) score += 300;
          if (score > bestScore) { bestScore = score; best = e; }
        }
        // structures
        const wantBuilding = !best || u.targetsBuildings;
        if (wantBuilding) {
          for (const b of this.buildings) {
            if (b.team === u.team || b.hp <= 0) continue;
            const d = Math.sqrt(dist2(u.x, u.y, b.x, b.y));
            const radius = Math.max(b.w, b.h) * TILE * 0.5;
            if (d - radius < (u.targetsBuildings ? 240 : 90)) {
              const score = (u.targetsBuildings ? 200 : 0) - d;
              if (score > bestScore) { bestScore = score; best = b; }
            }
          }
        }
        if (best) tgt = best;
        else if (u.team === 1) {
          // march on the keep
          tgt = null;
        }
        u.target = tgt;
      }

      // support behaviour: clerics heal
      if (u.tags.includes('support')) {
        u.abilityCd -= dt;
        if (u.abilityCd <= 0) {
          u.abilityCd = 2.2;
          this.queryNear(u.x, u.y, 140, u.team, near);
          const hurt = near.filter((a) => a !== u && a.hp < a.max).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
          if (hurt) { hurt.hp = Math.min(hurt.max, hurt.hp + 40); this.fx(hurt.x, hurt.y - 20, 'heal'); }
        }
      }
      if (u.ability === 'summon') {
        u.abilityCd -= dt;
        if (u.abilityCd <= 0) { u.abilityCd = 9; for (let i = 0; i < 3; i++) { const s = this.spawnUnit('skeleton', 1, u.x + (Math.random() - 0.5) * 60, u.y + (Math.random() - 0.5) * 60, u.lane); s.wp = this.nearestWaypoint(s.lane, s.x, s.y); } this.fx(u.x, u.y, 'magic'); }
      }
      if (u.ability === 'frenzy' && u.hp < u.max * 0.5) u.rate = Math.min(2, u.rate + dt * 0.05);

      // movement
      let mx = 0, my = 0;
      const t: any = u.target;
      const inRangeOf = (o: any) => {
        const radius = o.w ? Math.max(o.w, o.h) * TILE * 0.45 : 10;
        return dist2(u.x, u.y, o.x, o.y) <= (u.range + radius) * (u.range + radius);
      };
      if (u.stance === 'hold' && u.hold && dist2(u.x, u.y, u.hold.x, u.hold.y) > 36 * 36) {
        mx = u.hold.x - u.x; my = u.hold.y - u.y;
      } else if (u.stance === 'retreat' && u.hold) {
        mx = u.hold.x - u.x; my = u.hold.y - u.y;
      } else if (t && !inRangeOf(t)) {
        mx = t.x - u.x; my = t.y - u.y;
        if (u.tags.includes('siege')) {
          const d = Math.sqrt(dist2(u.x, u.y, t.x, t.y));
          if (d < u.range * 0.45) { mx = -mx; my = -my; } // kite: siege can't hit adjacent
        }
      } else if (!t) {
        // follow the lane
        const lane = this.lanes[u.lane] || this.lanes[0];
        const dir = u.team === 1 ? 1 : -1;
        const wp = lane[Math.max(0, Math.min(lane.length - 1, u.wp))];
        if (wp) {
          mx = wp.x - u.x; my = wp.y - u.y;
          if (dist2(u.x, u.y, wp.x, wp.y) < 40 * 40) u.wp = Math.max(0, Math.min(lane.length - 1, u.wp + dir));
        }
        if (u.team === 1 && u.wp >= lane.length - 1) { mx = this.base.x - u.x; my = this.base.y - u.y; }
      }

      if (mx || my) {
        const len = Math.hypot(mx, my) || 1;
        let nx = u.x + (mx / len) * u.speed * dt;
        let ny = u.y + (my / len) * u.speed * dt;
        // terrain + wall collision (cheap tile test)
        const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
        const k = ty * this.cols + tx;
        const flying = u.tags.includes('flying');
        const blockedTerrain = tx < 1 || ty < 1 || tx >= this.cols - 1 || ty >= this.rows - 1 || (!flying && !this.buildable[k]);
        const blockedBld = !flying && this.occupied[k] === 1 && !(t && 'tx' in t && tx >= t.tx && tx < t.tx + t.w && ty >= t.ty && ty < t.ty + t.h);
        if (blockedTerrain || blockedBld) {
          // slide along axis, else attack the obstacle
          const altX = Math.floor((u.x + (mx / len) * u.speed * dt) / TILE), altY = Math.floor(u.y / TILE);
          if (this.buildable[altY * this.cols + altX] && !this.occupied[altY * this.cols + altX]) { nx = u.x + (mx / len) * u.speed * dt; ny = u.y; }
          else {
            const a2x = Math.floor(u.x / TILE), a2y = Math.floor((u.y + (my / len) * u.speed * dt) / TILE);
            if (this.buildable[a2y * this.cols + a2x] && !this.occupied[a2y * this.cols + a2x]) { nx = u.x; ny = u.y + (my / len) * u.speed * dt; }
            else {
              nx = u.x; ny = u.y;
              if (u.team === 1 && blockedBld) {
                const wall = this.buildings.find((b) => b.team === 0 && tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h);
                if (wall) u.target = wall;
              }
              // anti-stall jitter
              ny += (Math.random() - 0.5) * 8;
            }
          }
        }
        u.x = nx; u.y = ny;
        u.face = (mx >= 0 ? 1 : -1) as 1 | -1;
        u.frame = 1 + (Math.floor(u.anim * 6) % 2);
      } else u.frame = 0;

      // attack
      if (t && inRangeOf(t) && u.cd <= 0 && u.stance !== 'retreat') {
        u.cd = 1 / u.rate;
        u.frame = 3;
        this.attack(u, t);
      }
    }
  }

  attack(u: Unit, t: any) {
    const sound = u.ranged ? (u.tags.includes('siege') ? 'siege' : u.dtype === 'magic' ? 'magic' : 'bow') : u.dtype === 'magic' ? 'magic' : 'sword';
    if (this.inView(u.x, u.y)) audio.play(sound);
    let dmg = u.dmg;
    // aura buffs
    if (u.team === 0) {
      for (const b of this.buildings) {
        const def = BUILDING_MAP[b.defId];
        if (b.team === 0 && def?.aura?.type === 'damage' && dist2(u.x, u.y, b.x, b.y) < def.aura.radius ** 2) dmg *= 1 + def.aura.value * b.level;
      }
    }
    if (u.ranged) {
      const kind = u.tags.includes('siege') ? 'rock' : u.dtype === 'magic' ? 'magic' : 'arrow';
      this.projectiles.push({
        x: u.x, y: u.y - 14, tx: t.x, ty: t.y, vx: 0, vy: 0, life: 2.5, dmg, dtype: u.dtype,
        splash: u.splash, team: u.team, kind: kind as any, target: t, bonusVs: u.bonusVs, owner: u,
      });
    } else {
      this.damage(t, dmg, u.dtype, u.bonusVs, u);
      this.fx(t.x, t.y - 10, 'hit');
    }
  }

  damage(t: any, dmg: number, dtype: string, bonusVs: string[], src?: Unit) {
    if (!t || t.hp <= 0 || t.dead) return;
    let d = dmg;
    if (t.armor) d *= DMG_TABLE[dtype as keyof typeof DMG_TABLE][t.armor as 'light'] ?? 1;
    if (t.red) d *= 1 - t.red;
    if (bonusVs && t.tags && bonusVs.some((x: string) => t.tags.includes(x))) d *= 1.6;
    if (t.isBase && this.save.techs.includes('tech_wards')) d *= 0.8;
    // weather modifiers
    if (this.weather === 'rain' && dtype === 'pierce') d *= 0.9;
    if (this.weather === 'storm' && dtype === 'magic') d *= 1.15;
    t.hp -= d;
    t.hitFlash = 1;
    if (t.hp <= 0) this.kill(t, src);
  }

  kill(t: any, src?: Unit) {
    if ('tx' in t) {
      const b = t as Building;
      if (b.isBase) { b.hp = 0; return; }
      this.fx(b.x, b.y, 'explode', Math.max(b.w, b.h));
      audio.play('destroy');
      if (b.isLair) this.setMessage('Enemy lair destroyed!');
      this.removeBuilding(b);
      if (this.selected === b) this.selected = null;
      return;
    }
    const u = t as Unit;
    if (u.dead) return;
    u.dead = true; u.deadT = 0; u.frame = 4; u.target = null;
    audio.play('die');
    this.fx(u.x, u.y, 'blood');
    if (u.team === 1) {
      const d = DIFFICULTY[this.diff];
      const bonus = this.save.techs.includes('tech_taxation') ? 1.2 : 1;
      const g = Math.round(u.bounty * d.bounty * bonus);
      this.gold += g; this.killGold += g; this.killCount++;
      this.fx(u.x, u.y - 24, 'float', 1, `+${g}`, '#ffd76a');
      if (src && src.team === 0 && src.xpUnit) {
        this.save.unitXp[src.xpUnit] = (this.save.unitXp[src.xpUnit] || 0) + 1;
        const xp = this.save.unitXp[src.xpUnit];
        const lvl = this.save.unitLevels[src.xpUnit] || 1;
        if (xp >= lvl * 25 && lvl < 10) {
          this.save.unitLevels[src.xpUnit] = lvl + 1;
          this.setMessage(`${UNIT_MAP[src.xpUnit].name} promoted to level ${lvl + 1}!`);
        }
      }
    } else this.lostUnits++;
  }

  updateBuildings(dt: number) {
    const near: Unit[] = [];
    for (const b of this.buildings) {
      b.hitFlash = Math.max(0, b.hitFlash - dt * 4);
      const def = BUILDING_MAP[b.defId];
      if (!def) continue;
      if (def.aura?.type === 'heal') {
        b.cd -= dt;
        if (b.cd <= 0) {
          b.cd = 1;
          this.queryNear(b.x, b.y, def.aura.radius, 0, near);
          for (const u of near) if (u.hp < u.max) { u.hp = Math.min(u.max, u.hp + def.aura.value * b.level); }
        }
        continue;
      }
      if (!def.dmg || !def.range) continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const rangeMul = this.save.techs.includes('tech_engineering') ? 1.1 : 1;
      const r = def.range * rangeMul;
      this.queryNear(b.x, b.y, r, (1 - b.team) as Team, near);
      if (!near.length) continue;
      const t = near[0];
      b.cd = 1 / def.attackSpeed!;
      const dmg = def.dmg * (1 + (b.level - 1) * 0.4);
      if (def.id === 'spike_trap') { this.damage(t, dmg, def.damageType!, [], undefined); this.fx(t.x, t.y, 'hit'); continue; }
      this.projectiles.push({
        x: b.x, y: b.y - 10, tx: t.x, ty: t.y, vx: 0, vy: 0, life: 2.5, dmg,
        dtype: def.damageType || 'pierce', splash: def.splash || 0, team: b.team,
        kind: def.damageType === 'magic' ? 'magic' : def.id === 'ballista_tower' ? 'bolt' : 'arrow',
        target: t, bonusVs: [],
      });
      if (this.inView(b.x, b.y)) audio.play(def.damageType === 'magic' ? 'magic' : 'bow');
    }
  }

  updateProjectiles(dt: number) {
    const speed = { arrow: 520, bolt: 700, rock: 320, magic: 460 } as any;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const t: any = p.target;
      if (t && !t.dead && t.hp > 0) { p.tx = t.x; p.ty = t.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = speed[p.kind] * dt;
      if (d <= s || p.life <= 0) {
        if (p.splash > 0) {
          const near: Unit[] = [];
          this.queryNear(p.tx, p.ty, p.splash, (1 - p.team) as Team, near);
          for (const u of near) this.damage(u, p.dmg, p.dtype, p.bonusVs, p.owner);
          for (const b of this.buildings) if (b.team !== p.team && dist2(b.x, b.y, p.tx, p.ty) < p.splash ** 2) this.damage(b, p.dmg, p.dtype, p.bonusVs, p.owner);
          this.fx(p.tx, p.ty, 'boom', p.splash);
        } else if (t && !t.dead && t.hp > 0) {
          this.damage(t, p.dmg, p.dtype, p.bonusVs, p.owner);
          this.fx(p.tx, p.ty, p.kind === 'magic' ? 'magic' : 'hit');
        }
        this.projectiles.splice(i, 1);
        continue;
      }
      p.x += (dx / d) * s; p.y += (dy / d) * s;
      p.vx = dx / d; p.vy = dy / d;
    }
  }

  updateWorldObjectives(dt: number) {
    // treasures collected by nearby friendly units
    for (const t of this.treasures) {
      if (t.taken) continue;
      const near: Unit[] = [];
      this.queryNear(t.x, t.y, 50, 0, near);
      if (near.length) {
        t.taken = true; this.gold += t.gold; this.killGold += t.gold;
        this.fx(t.x, t.y - 20, 'float', 1, `Treasure +${t.gold}`, '#ffd76a');
        audio.play('coin');
        this.setMessage(`Treasure recovered: +${t.gold} gold`);
      }
    }
    if (this.beacon) {
      const near: Unit[] = [];
      this.queryNear(this.beacon.x, this.beacon.y, 110, 0, near);
      const enemies: Unit[] = [];
      this.queryNear(this.beacon.x, this.beacon.y, 110, 1, enemies);
      if (near.length && !enemies.length) this.beacon.progress = Math.min(1, this.beacon.progress + dt / 12);
    }
    this.refreshObjectives();
  }

  refreshObjectives() {
    for (const o of this.mission.objectives) {
      const st = this.objectiveState[o.id];
      switch (o.kind) {
        case 'survive': st.done = this.wave >= this.mission.waves && this.phase !== 'battle'; break;
        case 'lairs': st.done = !this.buildings.some((b) => b.isLair); break;
        case 'treasure': st.done = this.treasures.every((t) => t.taken); st.failed = false; break;
        case 'capture': st.done = !!this.beacon && this.beacon.progress >= 1; break;
        case 'nolosses': st.done = this.base.hp > this.base.max * 0.8; st.failed = this.base.hp <= this.base.max * 0.8; break;
      }
    }
  }

  completeWave() {
    // income from farms + territories
    let income = 0;
    for (const b of this.buildings) {
      const def = BUILDING_MAP[b.defId];
      if (b.team === 0 && def?.income) income += Math.round(def.income * b.level * (this.save.techs.includes('tech_granary') ? 1.5 : 1));
    }
    if (income) { this.gold += income; this.setMessage(`Wave cleared. Farms produced ${income} gold.`); }
    this.phase = 'prep';
    this.units = this.units.filter((u) => u.team === 0 || !u.dead);
    this.projectiles.length = 0;
    this.refreshObjectives();
    audio.setMood('prep');

    const mandatory = this.mission.objectives.filter((o) => !o.optional);
    const survived = this.wave >= this.mission.waves;
    const allDone = mandatory.every((o) => this.objectiveState[o.id].done || o.kind === 'survive');
    if (survived && allDone && this.mission.id !== 'endless') this.win();
    else if (survived && !allDone) this.setMessage('All waves cleared — finish the remaining objectives!');
  }

  win() { this.phase = 'victory'; audio.play('victory'); audio.setMood('victory'); }
  lose() { this.phase = 'defeat'; audio.play('defeat'); audio.setMood('defeat'); }

  snapshot(): Snapshot {
    const sel = this.selected as any;
    let selInfo: Snapshot['selected'] = null;
    if (sel) {
      if ('tx' in sel) {
        const def = BUILDING_MAP[sel.defId];
        selInfo = {
          kind: 'building', id: sel.defId, name: def?.name || sel.defId, hp: Math.max(0, Math.round(sel.hp)),
          max: Math.round(sel.max), level: sel.level,
          info: def ? `${def.desc}${def.dmg ? ` · DMG ${Math.round(def.dmg * (1 + (sel.level - 1) * 0.4))} · RNG ${def.range}` : ''}${def.income ? ` · +${def.income * sel.level}g/wave` : ''}` : '',
        };
      } else {
        const def = UNIT_MAP[sel.defId] || ENEMY_MAP[sel.defId];
        selInfo = {
          kind: 'unit', id: sel.defId, name: def?.name || sel.defId, hp: Math.max(0, Math.round(sel.hp)),
          max: Math.round(sel.max), level: this.save.unitLevels[sel.defId] || 1,
          info: `DMG ${Math.round(sel.dmg)} · RNG ${Math.round(sel.range)} · ${sel.stance.toUpperCase()}`,
        };
      }
    }
    return {
      phase: this.phase, wave: this.wave, totalWaves: this.mission.waves, gold: Math.floor(this.gold),
      killGold: Math.floor(this.killGold), baseHp: Math.max(0, Math.round(this.base.hp)), baseMax: Math.round(this.base.max),
      speed: this.running ? this.speed : 0,
      enemiesAlive: this.units.filter((u) => u.team === 1 && !u.dead).length + this.spawnQueue.length,
      alliesAlive: this.units.filter((u) => u.team === 0 && !u.dead).length,
      reserves: { ...this.reserves },
      objectives: this.mission.objectives.map((o) => ({
        id: o.id, text: o.text, optional: o.optional, done: this.objectiveState[o.id].done,
        failed: this.objectiveState[o.id].failed,
        progress: o.kind === 'survive' ? `${Math.min(this.wave, this.mission.waves)}/${this.mission.waves === 9999 ? '∞' : this.mission.waves}`
          : o.kind === 'lairs' ? `${this.mission.lairs - this.buildings.filter((b) => b.isLair).length}/${this.mission.lairs}`
            : o.kind === 'treasure' ? `${this.treasures.filter((t) => t.taken).length}/${this.treasures.length}`
              : o.kind === 'capture' ? `${Math.round((this.beacon?.progress || 0) * 100)}%` : '',
      })),
      selected: selInfo,
      nextWave: this.previewWave(),
      fps: this.fps, unitCount: this.units.length, lairsLeft: this.buildings.filter((b) => b.isLair).length,
      capture: this.beacon?.progress ?? -1, weather: this.weather, message: this.message,
      lostUnits: this.lostUnits, killCount: this.killCount,
    };
  }

  // ---------- camera / input helpers ----------
  screenToWorld(sx: number, sy: number) {
    const z = this.cam.z;
    return { x: this.cam.x + (sx - this.view.w / 2) / z, y: this.cam.y + (sy - this.view.h / 2) / z };
  }
  worldToScreen(wx: number, wy: number) {
    const z = this.cam.z;
    return { x: (wx - this.cam.x) * z + this.view.w / 2, y: (wy - this.cam.y) * z + this.view.h / 2 };
  }
  clampCam() {
    const W = this.cols * TILE, H = this.rows * TILE;
    const hw = this.view.w / (2 * this.cam.z), hh = this.view.h / (2 * this.cam.z);
    this.cam.x = Math.max(Math.min(hw, W / 2), Math.min(W - hw, this.cam.x));
    this.cam.y = Math.max(Math.min(hh, H / 2), Math.min(H - hh, this.cam.y));
  }
  panBy(dx: number, dy: number) { this.cam.x -= dx / this.cam.z; this.cam.y -= dy / this.cam.z; this.clampCam(); }
  zoomBy(f: number, sx?: number, sy?: number) {
    const before = sx !== undefined ? this.screenToWorld(sx, sy!) : null;
    this.cam.z = Math.max(0.35, Math.min(2.4, this.cam.z * f));
    if (before) {
      const after = this.screenToWorld(sx!, sy!);
      this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
    }
    this.clampCam();
  }
  focus(x: number, y: number) { this.cam.x = x; this.cam.y = y; this.clampCam(); }
  focusBase() { this.focus(this.base.x, this.base.y); }
  focusThreat() {
    const e = this.units.find((u) => u.team === 1 && !u.dead);
    if (e) this.focus(e.x, e.y); else this.setMessage('No enemies on the field');
  }
  focusArmy() {
    const a = this.units.filter((u) => u.team === 0 && !u.dead);
    if (!a.length) return this.setMessage('No troops deployed');
    this.focus(a.reduce((s, u) => s + u.x, 0) / a.length, a.reduce((s, u) => s + u.y, 0) / a.length);
  }
  inView(x: number, y: number) {
    const s = this.worldToScreen(x, y);
    return s.x > -50 && s.y > -50 && s.x < this.view.w + 50 && s.y < this.view.h + 50;
  }

  selectAt(wx: number, wy: number) {
    for (const u of this.units) u.selected = false;
    let found: Unit | Building | null = null;
    let bd = 40 * 40;
    for (const u of this.units) {
      if (u.dead) continue;
      const d = dist2(u.x, u.y - 14, wx, wy);
      if (d < bd) { bd = d; found = u; }
    }
    if (!found) {
      for (const b of this.buildings) {
        if (wx > b.tx * TILE && wx < (b.tx + b.w) * TILE && wy > b.ty * TILE && wy < (b.ty + b.h) * TILE) { found = b; break; }
      }
    }
    if (found && 'team' in found && !('tx' in found)) (found as Unit).selected = true;
    this.selected = found;
    return found;
  }
  boxSelect(x0: number, y0: number, x1: number, y1: number) {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    let n = 0;
    for (const u of this.units) {
      u.selected = u.team === 0 && !u.dead && u.x >= ax && u.x <= bx && u.y >= ay && u.y <= by;
      if (u.selected) n++;
    }
    this.selected = n ? this.units.find((u) => u.selected)! : null;
    return n;
  }

  // ---------- rendering ----------
  resize(w: number, h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.view = { w, h };
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.clampCam();
  }

  render() {
    const ctx = this.ctx;
    const { w, h } = this.view;
    ctx.save();
    ctx.fillStyle = '#10140f';
    ctx.fillRect(0, 0, w, h);
    const z = this.cam.z;
    ctx.translate(w / 2, h / 2); ctx.scale(z, z); ctx.translate(-this.cam.x, -this.cam.y);

    // terrain chunks
    const x0 = Math.floor((this.cam.x - w / (2 * z)) / (CHUNK * TILE));
    const x1 = Math.floor((this.cam.x + w / (2 * z)) / (CHUNK * TILE));
    const y0 = Math.floor((this.cam.y - h / (2 * z)) / (CHUNK * TILE));
    const y1 = Math.floor((this.cam.y + h / (2 * z)) / (CHUNK * TILE));
    for (let cy = Math.max(0, y0); cy <= Math.min(Math.ceil(this.rows / CHUNK), y1); cy++)
      for (let cx = Math.max(0, x0); cx <= Math.min(Math.ceil(this.cols / CHUNK), x1); cx++)
        ctx.drawImage(this.chunkCanvas(cx, cy), cx * CHUNK * TILE, cy * CHUNK * TILE);

    // lane markers
    ctx.strokeStyle = 'rgba(255,230,160,0.18)'; ctx.lineWidth = 6; ctx.setLineDash([14, 14]);
    for (const l of this.lanes) {
      ctx.beginPath(); l.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([]);

    // beacon / treasures
    if (this.beacon) {
      const b = this.beacon;
      ctx.fillStyle = b.progress >= 1 ? 'rgba(90,200,120,0.3)' : 'rgba(220,180,60,0.22)';
      ctx.beginPath(); ctx.arc(b.x, b.y, 110, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c558'; ctx.fillRect(b.x - 6, b.y - 40, 12, 50);
      ctx.fillStyle = b.progress >= 1 ? '#5ac878' : '#b02a2a'; ctx.fillRect(b.x + 6, b.y - 40, 26, 18);
    }
    for (const t of this.treasures) {
      if (t.taken) continue;
      const bob = Math.sin(performance.now() / 300 + t.x) * 3;
      ctx.fillStyle = '#6b4a24'; ctx.fillRect(t.x - 12, t.y - 10 + bob, 24, 16);
      ctx.fillStyle = '#e8c558'; ctx.fillRect(t.x - 12, t.y - 14 + bob, 24, 5);
      ctx.fillStyle = '#fff3c0'; ctx.fillRect(t.x - 3, t.y - 4 + bob, 6, 4);
    }

    // buildings
    for (const b of this.buildings) {
      const dmgStage = b.hp / b.max > 0.66 ? 0 : b.hp / b.max > 0.33 ? 1 : 2;
      const sw = b.w * 16 * PXS, sh = b.h * 16 * PXS;
      ctx.drawImage(b.sheet.canvas, dmgStage * sw, 0, sw, sh, b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE);
      if (b.hitFlash > 0) {
        ctx.globalAlpha = b.hitFlash * 0.5; ctx.fillStyle = '#fff';
        ctx.fillRect(b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE); ctx.globalAlpha = 1;
      }
      if (b.hp < b.max) this.healthBar(ctx, b.x, b.ty * TILE - 8, b.w * TILE * 0.8, b.hp / b.max, b.team === 0);
      if (this.selected === b) {
        ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2;
        ctx.strokeRect(b.tx * TILE, b.ty * TILE, b.w * TILE, b.h * TILE);
      }
      if (b.level > 1) {
        ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 12px monospace';
        ctx.fillText('★'.repeat(Math.min(3, b.level - 1)), b.tx * TILE + 2, b.ty * TILE - 10);
      }
    }

    // sort units by y for depth
    const vis = this.units.filter((u) => this.inView(u.x, u.y));
    vis.sort((a, b) => a.y - b.y);
    for (const u of vis) {
      const s = u.sheet;
      const f = u.dead ? 4 : u.frame;
      const row = u.face === 1 ? 0 : 1;
      const sz = SPRITE * u.scale * 1.15;
      ctx.drawImage(s.canvas, f * s.size, row * s.size, s.size, s.size, u.x - sz / 2, u.y - sz + 6, sz, sz);
      if (u.hitFlash > 0 && !u.dead) {
        ctx.globalAlpha = u.hitFlash * 0.6;
        ctx.drawImage(s.canvas, f * s.size, row * s.size, s.size, s.size, u.x - sz / 2, u.y - sz + 6, sz, sz);
        ctx.globalAlpha = 1;
      }
      if (!u.dead && u.hp < u.max) this.healthBar(ctx, u.x, u.y - sz + 2, 26 * u.scale, u.hp / u.max, u.team === 0);
      if (u.selected) {
        ctx.strokeStyle = '#8ef0a0'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(u.x, u.y + 2, 14 * u.scale, 6 * u.scale, 0, 0, 7); ctx.stroke();
      }
    }

    // projectiles
    for (const p of this.projectiles) {
      if (p.kind === 'magic') {
        ctx.fillStyle = '#b08cff'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#e4d6ff'; ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      } else if (p.kind === 'rock') {
        ctx.fillStyle = '#6b6b72'; ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
        ctx.fillStyle = '#9a9aa2'; ctx.fillRect(p.x - 3, p.y - 4, 4, 3);
      } else {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = '#5a4428'; ctx.fillRect(-8, -1, 14, 2);
        ctx.fillStyle = '#d9e2ea'; ctx.fillRect(6, -1, 4, 2);
        ctx.restore();
      }
    }

    // effects
    for (const e of this.effects) {
      const k = e.t / e.life;
      ctx.globalAlpha = 1 - k;
      if (e.kind === 'hit') { ctx.fillStyle = '#fff2b0'; ctx.fillRect(e.x - 6 + k * 4, e.y - 6, 12 - k * 8, 3); }
      else if (e.kind === 'blood') { ctx.fillStyle = '#9b2222'; for (let i = 0; i < 5; i++) ctx.fillRect(e.x + Math.cos(i) * 14 * k, e.y + Math.sin(i * 2) * 10 * k, 3, 3); }
      else if (e.kind === 'boom') { ctx.fillStyle = '#ffb04a'; ctx.beginPath(); ctx.arc(e.x, e.y, e.v * k, 0, 7); ctx.fill(); }
      else if (e.kind === 'explode') { ctx.fillStyle = '#5a4a3a'; for (let i = 0; i < 10; i++) ctx.fillRect(e.x + Math.cos(i) * 40 * k * e.v, e.y + Math.sin(i * 1.7) * 30 * k * e.v, 6, 6); }
      else if (e.kind === 'magic') { ctx.strokeStyle = '#c0a0ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + k * 22, 0, 7); ctx.stroke(); }
      else if (e.kind === 'heal') { ctx.fillStyle = '#7ef0a0'; ctx.fillRect(e.x - 2, e.y - k * 20, 4, 10); ctx.fillRect(e.x - 5, e.y - k * 20 + 3, 10, 4); }
      else if (e.kind === 'spawn') { ctx.strokeStyle = '#8ef0a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + k * 28, 0, 7); ctx.stroke(); }
      else if (e.kind === 'build') { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 3; ctx.strokeRect(e.x - 30 * (1 - k), e.y - 30 * (1 - k), 60 * (1 - k), 60 * (1 - k)); }
      else if (e.kind === 'float') {
        ctx.fillStyle = e.color || '#fff'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillText(e.text || '', e.x, e.y - k * 26); ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
    }

    // placement preview
    if (this.placing) {
      const def = BUILDING_MAP[this.placing.defId];
      if (def) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = this.placeValid ? 'rgba(110,230,130,0.45)' : 'rgba(230,80,80,0.45)';
        ctx.fillRect(this.placeTile.x * TILE, this.placeTile.y * TILE, def.w * TILE, def.h * TILE);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.placeValid ? '#8ef0a0' : '#f08080'; ctx.lineWidth = 2;
        ctx.strokeRect(this.placeTile.x * TILE, this.placeTile.y * TILE, def.w * TILE, def.h * TILE);
        if (def.range) {
          ctx.strokeStyle = 'rgba(255,230,160,0.35)';
          ctx.beginPath(); ctx.arc((this.placeTile.x + def.w / 2) * TILE, (this.placeTile.y + def.h / 2) * TILE, def.range, 0, 7); ctx.stroke();
        }
      }
    }
    ctx.restore();

    this.renderWeather(ctx);
  }

  healthBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, p: number, friendly: boolean) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = friendly ? '#6ad06a' : '#d05050';
    ctx.fillRect(x - w / 2 + 1, y + 1, (w - 2) * Math.max(0, p), 2);
  }

  renderWeather(ctx: CanvasRenderingContext2D) {
    const { w, h } = this.view;
    if (this.weather === 'fog') { ctx.fillStyle = 'rgba(180,190,200,0.22)'; ctx.fillRect(0, 0, w, h); return; }
    if (this.weather === 'none') return;
    const dt = 1 / 60;
    ctx.strokeStyle = this.weather === 'blizzard' ? 'rgba(255,255,255,0.75)' : 'rgba(150,180,220,0.5)';
    ctx.lineWidth = this.weather === 'blizzard' ? 2 : 1;
    ctx.beginPath();
    for (const p of this.weatherParticles) {
      p.y += p.v * dt; p.x += (this.weather === 'storm' ? -240 : -60) * dt;
      if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      if (p.x < 0) p.x = w;
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 2, p.y + (this.weather === 'blizzard' ? 2 : 10));
    }
    ctx.stroke();
    if (this.weather === 'storm' && Math.random() < 0.004) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(0, 0, w, h); }
  }

  /** Draw the minimap into a separate canvas element. */
  renderMinimap(mc: HTMLCanvasElement) {
    const g = mc.getContext('2d')!;
    const W = this.cols * TILE, H = this.rows * TILE;
    const sx = mc.width / W, sy = mc.height / H;
    g.fillStyle = '#2b3a22'; g.fillRect(0, 0, mc.width, mc.height);
    // coarse terrain
    for (let y = 0; y < this.rows; y += 2)
      for (let x = 0; x < this.cols; x += 2) {
        const t = this.terrain[y * this.cols + x];
        g.fillStyle = MINI_COLORS[t] || '#3c5c2c';
        g.fillRect(x * TILE * sx, y * TILE * sy, TILE * sx * 2, TILE * sy * 2);
      }
    for (const b of this.buildings) {
      g.fillStyle = b.isBase ? '#ffe08a' : b.isLair ? '#7a2222' : b.team === 0 ? '#9ad0ff' : '#d05050';
      g.fillRect(b.tx * TILE * sx, b.ty * TILE * sy, Math.max(3, b.w * TILE * sx), Math.max(3, b.h * TILE * sy));
    }
    for (const u of this.units) {
      if (u.dead) continue;
      g.fillStyle = u.team === 0 ? '#5ef07a' : '#ff5a4a';
      g.fillRect(u.x * sx - 1, u.y * sy - 1, 2.5, 2.5);
    }
    if (this.beacon) { g.fillStyle = this.beacon.progress >= 1 ? '#6ef0a0' : '#e8c558'; g.fillRect(this.beacon.x * sx - 3, this.beacon.y * sy - 3, 6, 6); }
    for (const t of this.treasures) if (!t.taken) { g.fillStyle = '#ffd76a'; g.fillRect(t.x * sx - 2, t.y * sy - 2, 4, 4); }
    // viewport
    g.strokeStyle = '#fff'; g.lineWidth = 1;
    const vw = (this.view.w / this.cam.z) * sx, vh = (this.view.h / this.cam.z) * sy;
    g.strokeRect(this.cam.x * sx - vw / 2, this.cam.y * sy - vh / 2, vw, vh);
  }
}

const TERRANIDX: Record<string, number> = Object.fromEntries(TERRAINS.map((t, i) => [t, i]));
const MINI_COLORS: Record<number, string> = {
  0: '#4b7a32', 1: '#42702e', 2: '#6e5433', 3: '#8a7044', 4: '#2c4d20', 5: '#6a6a70',
  6: '#2a5a86', 7: '#3f4a2c', 8: '#d9e3ec', 9: '#c2a768',
};
