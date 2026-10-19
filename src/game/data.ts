import type { CreatureStyle, BuildingStyle } from './sprites';

export type DamageType = 'slash' | 'pierce' | 'blunt' | 'magic';
export type ArmorType = 'light' | 'medium' | 'heavy' | 'monster';

/** Damage multiplier table — the core of unit countering. */
export const DMG_TABLE: Record<DamageType, Record<ArmorType, number>> = {
  slash: { light: 1.3, medium: 1.0, heavy: 0.7, monster: 1.0 },
  pierce: { light: 1.0, medium: 1.35, heavy: 0.9, monster: 1.1 },
  blunt: { light: 0.8, medium: 1.1, heavy: 1.6, monster: 1.0 },
  magic: { light: 1.1, medium: 1.1, heavy: 1.2, monster: 1.45 },
};

export type UnitDef = {
  id: string;
  name: string;
  desc: string;
  cost: number;
  hp: number;
  dmg: number;
  dps?: number;
  attackSpeed: number; // attacks per second
  speed: number; // px/s
  range: number;
  armor: ArmorType;
  reduction: number; // flat % reduction
  damageType: DamageType;
  ranged?: boolean;
  splash?: number;
  bonusVs?: string[]; // tags
  tags: string[];
  priority: 'nearest' | 'strongest' | 'buildings' | 'weakest';
  unlockTech?: string;
  style: CreatureStyle;
  xpPerLevel?: number;
};

export const UNITS: UnitDef[] = [
  {
    id: 'swordsman', name: 'Swordsman', desc: 'Reliable frontline infantry. Cheap, holds lanes.',
    cost: 40, hp: 130, dmg: 14, attackSpeed: 1.1, speed: 42, range: 26, armor: 'medium', reduction: 0.1,
    damageType: 'slash', tags: ['infantry'], priority: 'nearest',
    style: { skin: '#d8a877', armor: '#8e99a8', accent: '#9b2a2a', cloth: '#5a4a3a', weapon: 'sword', shield: true, helmet: true },
  },
  {
    id: 'spearman', name: 'Spearman', desc: 'Long reach, pierces armor. Devastating against cavalry and beasts.',
    cost: 55, hp: 110, dmg: 17, attackSpeed: 0.9, speed: 40, range: 44, armor: 'medium', reduction: 0.08,
    damageType: 'pierce', bonusVs: ['cavalry', 'beast'], tags: ['infantry'], priority: 'strongest',
    style: { skin: '#c99a68', armor: '#7b8796', accent: '#2f5f9b', cloth: '#4a4030', weapon: 'spear', helmet: true },
  },
  {
    id: 'archer', name: 'Archer', desc: 'Ranged damage from safety. Fragile in melee.',
    cost: 60, hp: 70, dmg: 13, attackSpeed: 1.0, speed: 44, range: 150, armor: 'light', reduction: 0,
    damageType: 'pierce', ranged: true, tags: ['ranged'], priority: 'nearest',
    style: { skin: '#e0b183', armor: '#3f6b3a', accent: '#8b5a2b', cloth: '#3a4a2a', weapon: 'bow' },
  },
  {
    id: 'manatarms', name: 'Man-at-Arms', desc: 'Heavily armoured veteran. Absorbs enormous punishment.',
    cost: 110, hp: 300, dmg: 20, attackSpeed: 0.85, speed: 34, range: 28, armor: 'heavy', reduction: 0.3,
    damageType: 'slash', tags: ['infantry'], priority: 'strongest', unlockTech: 'tech_drill',
    style: { skin: '#caa070', armor: '#cfd6de', accent: '#6a2f8b', cloth: '#3b3b44', weapon: 'axe', shield: true, helmet: true },
  },
  {
    id: 'knight', name: 'Knight', desc: 'Fast mounted shock troops. Charges deep into enemy lines.',
    cost: 160, hp: 260, dmg: 30, attackSpeed: 1.0, speed: 78, range: 30, armor: 'heavy', reduction: 0.25,
    damageType: 'slash', bonusVs: ['ranged', 'swarm'], tags: ['cavalry'], priority: 'weakest', unlockTech: 'tech_stables',
    style: { skin: '#d8a877', armor: '#dfe6ee', accent: '#b8962f', cloth: '#5b3a2a', weapon: 'sword', helmet: true, mount: '#6b4a2e' },
  },
  {
    id: 'catapult', name: 'Catapult', desc: 'Siege engine. Slow, enormous splash damage, cannot hit adjacent foes.',
    cost: 220, hp: 180, dmg: 70, attackSpeed: 0.3, speed: 20, range: 220, armor: 'medium', reduction: 0.1,
    damageType: 'blunt', ranged: true, splash: 60, tags: ['siege'], priority: 'strongest', unlockTech: 'tech_siege',
    style: { skin: '#caa070', armor: '#7a5a32', accent: '#5d4426', cloth: '#4a3620', weapon: 'siege' },
  },
  {
    id: 'cleric', name: 'War Cleric', desc: 'Support caster: heals nearby allies and smites monsters with holy magic.',
    cost: 180, hp: 110, dmg: 16, attackSpeed: 0.8, speed: 40, range: 120, armor: 'light', reduction: 0.05,
    damageType: 'magic', ranged: true, bonusVs: ['undead', 'demon'], tags: ['support', 'caster'], priority: 'nearest',
    unlockTech: 'tech_faith',
    style: { skin: '#eac79a', armor: '#f0eadb', accent: '#e8c558', cloth: '#d8d0bc', weapon: 'staff' },
  },
  {
    id: 'battlemage', name: 'Battlemage', desc: 'Arcane artillery: splash magic damage that melts monster hordes.',
    cost: 240, hp: 95, dmg: 34, attackSpeed: 0.55, speed: 38, range: 165, armor: 'light', reduction: 0,
    damageType: 'magic', ranged: true, splash: 42, tags: ['caster'], priority: 'strongest', unlockTech: 'tech_arcana',
    style: { skin: '#dfb189', armor: '#3b2f6b', accent: '#8f6ef0', cloth: '#2a2250', weapon: 'staff' },
  },
];

export type EnemyDef = {
  id: string;
  name: string;
  hp: number;
  dmg: number;
  attackSpeed: number;
  speed: number;
  range: number;
  armor: ArmorType;
  reduction: number;
  damageType: DamageType;
  ranged?: boolean;
  bounty: number;
  tags: string[];
  elite?: boolean;
  targetsBuildings?: boolean;
  style: CreatureStyle;
  ability?: 'regen' | 'frenzy' | 'summon' | 'firebreath';
};

export const ENEMIES: EnemyDef[] = [
  {
    id: 'goblin', name: 'Goblin', hp: 55, dmg: 7, attackSpeed: 1.4, speed: 62, range: 24, armor: 'light',
    reduction: 0, damageType: 'slash', bounty: 8, tags: ['swarm', 'beast'],
    style: { skin: '#7fae4d', armor: '#6b5a3a', accent: '#8a3b2a', cloth: '#4a3a24', weapon: 'claw' },
  },
  {
    id: 'orc', name: 'Orc Marauder', hp: 160, dmg: 18, attackSpeed: 0.9, speed: 42, range: 26, armor: 'medium',
    reduction: 0.12, damageType: 'slash', bounty: 16, tags: ['infantry'],
    style: { skin: '#5f8f49', armor: '#6a5230', accent: '#3d2a18', cloth: '#45321c', weapon: 'axe', horns: false },
  },
  {
    id: 'wolf', name: 'Dire Wolf', hp: 80, dmg: 13, attackSpeed: 1.6, speed: 95, range: 22, armor: 'light',
    reduction: 0, damageType: 'slash', bounty: 12, tags: ['beast', 'swarm'],
    style: { skin: '#6c6a66', armor: '#58565a', accent: '#8a8a88', cloth: '#4a4846', weapon: 'claw', mount: '#5d5b58' },
  },
  {
    id: 'archergob', name: 'Goblin Slinger', hp: 50, dmg: 11, attackSpeed: 0.9, speed: 50, range: 140, armor: 'light',
    reduction: 0, damageType: 'pierce', ranged: true, bounty: 14, tags: ['ranged'],
    style: { skin: '#8cb956', armor: '#5a4a2a', accent: '#6b3a2a', cloth: '#3c2f1c', weapon: 'bow' },
  },
  {
    id: 'ogre', name: 'Ogre', hp: 520, dmg: 48, attackSpeed: 0.55, speed: 30, range: 34, armor: 'heavy',
    reduction: 0.25, damageType: 'blunt', bounty: 45, tags: ['brute'], targetsBuildings: true,
    style: { skin: '#9b8a5f', armor: '#7a6a44', accent: '#5a3a28', cloth: '#5a4a30', weapon: 'hammer', scale: 1.4 },
  },
  {
    id: 'troll', name: 'Cave Troll', hp: 700, dmg: 40, attackSpeed: 0.6, speed: 28, range: 32, armor: 'monster',
    reduction: 0.18, damageType: 'blunt', bounty: 60, tags: ['brute', 'beast'], ability: 'regen',
    targetsBuildings: true,
    style: { skin: '#6f8a62', armor: '#54684a', accent: '#3a4a34', cloth: '#45543c', weapon: 'claw', horns: true, scale: 1.5 },
  },
  {
    id: 'shaman', name: 'Orc Shaman', hp: 140, dmg: 22, attackSpeed: 0.7, speed: 40, range: 150, armor: 'light',
    reduction: 0.05, damageType: 'magic', ranged: true, bounty: 38, tags: ['caster'],
    style: { skin: '#6e9a4e', armor: '#4a3a6a', accent: '#b45ad6', cloth: '#3a2c50', weapon: 'staff', horns: true },
  },
  {
    id: 'skeleton', name: 'Skeleton Warrior', hp: 95, dmg: 14, attackSpeed: 1.1, speed: 48, range: 26, armor: 'medium',
    reduction: 0.08, damageType: 'pierce', bounty: 13, tags: ['undead'],
    style: { skin: '#e4e0d2', armor: '#8c8578', accent: '#4a4a52', cloth: '#5a564c', weapon: 'spear', helmet: true },
  },
  {
    id: 'harpy', name: 'Harpy', hp: 90, dmg: 15, attackSpeed: 1.3, speed: 105, range: 22, armor: 'light',
    reduction: 0, damageType: 'slash', bounty: 20, tags: ['beast', 'flying'],
    style: { skin: '#c88a9c', armor: '#8a4a62', accent: '#d2a0b4', cloth: '#6a3a4a', weapon: 'claw', wings: true },
  },
  {
    id: 'warlord', name: 'Orc Warlord', hp: 2400, dmg: 80, attackSpeed: 0.8, speed: 36, range: 36, armor: 'heavy',
    reduction: 0.35, damageType: 'slash', bounty: 260, tags: ['brute', 'elite'], elite: true,
    targetsBuildings: true, ability: 'frenzy',
    style: { skin: '#4f7a3a', armor: '#3c3c48', accent: '#c02a2a', cloth: '#2a2a32', weapon: 'axe', helmet: true, horns: true, scale: 1.7 },
  },
  {
    id: 'necromancer', name: 'Necromancer', hp: 1500, dmg: 46, attackSpeed: 0.6, speed: 34, range: 170, armor: 'monster',
    reduction: 0.2, damageType: 'magic', ranged: true, bounty: 240, tags: ['undead', 'elite', 'caster'],
    elite: true, ability: 'summon',
    style: { skin: '#cfd6c8', armor: '#2a2436', accent: '#6ef0a8', cloth: '#1e1a2a', weapon: 'staff', scale: 1.4 },
  },
  {
    id: 'demon', name: 'Infernal Demon', hp: 3200, dmg: 95, attackSpeed: 0.7, speed: 44, range: 38, armor: 'monster',
    reduction: 0.28, damageType: 'magic', bounty: 400, tags: ['demon', 'elite'], elite: true,
    targetsBuildings: true, ability: 'firebreath',
    style: { skin: '#b8402e', armor: '#6a1f1a', accent: '#ff9b3d', cloth: '#4a1410', weapon: 'claw', horns: true, wings: true, scale: 1.8 },
  },
];

export type BuildingDef = {
  id: string;
  name: string;
  desc: string;
  cost: number;
  hp: number;
  category: 'military' | 'defense' | 'economy' | 'magic';
  w: number; h: number; // tiles
  dmg?: number;
  range?: number;
  attackSpeed?: number;
  damageType?: DamageType;
  splash?: number;
  income?: number; // currency per wave
  blocks?: boolean;
  aura?: { type: 'damage' | 'armor' | 'heal'; value: number; radius: number };
  trainBonus?: string; // unit tag it discounts
  unlockTech?: string;
  style: BuildingStyle;
  upgradeCost: number;
};

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'arrow_tower', name: 'Arrow Tower', desc: 'Automatic ranged defense. Good all-round damage.',
    cost: 90, hp: 400, category: 'defense', w: 2, h: 2, dmg: 16, range: 190, attackSpeed: 1.2,
    damageType: 'pierce', upgradeCost: 70,
    style: { kind: 'tower', stone: '#8d8d96', roof: '#8b2b2b', accent: '#e0c04a', w: 2, h: 2 },
  },
  {
    id: 'ballista_tower', name: 'Ballista Tower', desc: 'Heavy bolt thrower: long range, big single-target damage.',
    cost: 190, hp: 520, category: 'defense', w: 2, h: 2, dmg: 60, range: 260, attackSpeed: 0.45,
    damageType: 'pierce', upgradeCost: 140, unlockTech: 'tech_engineering',
    style: { kind: 'tower', stone: '#7e8490', roof: '#3f5f8b', accent: '#cfd6de', w: 2, h: 2 },
  },
  {
    id: 'wall', name: 'Stone Wall', desc: 'Blocks enemy movement and soaks damage. Cheap, essential.',
    cost: 25, hp: 600, category: 'defense', w: 2, h: 1, blocks: true, upgradeCost: 25,
    style: { kind: 'wall', stone: '#9a9aa2', roof: '#6a6a72', accent: '#777', w: 2, h: 1 },
  },
  {
    id: 'spike_trap', name: 'Spike Trap', desc: 'Damages anything that walks over it. Invisible to enemy pathing.',
    cost: 50, hp: 160, category: 'defense', w: 2, h: 2, dmg: 26, range: 44, attackSpeed: 1.6,
    damageType: 'pierce', upgradeCost: 40,
    style: { kind: 'trap', stone: '#4a3a2a', roof: '#333', accent: '#aaa', w: 2, h: 2 },
  },
  {
    id: 'barracks', name: 'Barracks', desc: 'Infantry recruited while this stands cost 15% less and spawn with +10% HP.',
    cost: 150, hp: 650, category: 'military', w: 3, h: 3, trainBonus: 'infantry', upgradeCost: 110,
    style: { kind: 'barracks', stone: '#8d8d96', roof: '#7a4a2a', accent: '#9b2a2a', w: 3, h: 3 },
  },
  {
    id: 'archery_range', name: 'Archery Range', desc: 'Ranged units cost 15% less and gain +10% range.',
    cost: 170, hp: 560, category: 'military', w: 3, h: 3, trainBonus: 'ranged', upgradeCost: 120,
    style: { kind: 'range', stone: '#8d8d96', roof: '#3f6b3a', accent: '#8b5a2b', w: 3, h: 3 },
  },
  {
    id: 'stable', name: 'Stables', desc: 'Cavalry cost 15% less and move 10% faster.',
    cost: 220, hp: 600, category: 'military', w: 3, h: 3, trainBonus: 'cavalry', upgradeCost: 150,
    unlockTech: 'tech_stables',
    style: { kind: 'stable', stone: '#8d8d96', roof: '#6a4a24', accent: '#b8962f', w: 3, h: 3 },
  },
  {
    id: 'workshop', name: 'Siege Workshop', desc: 'Siege engines cost 15% less and deal +15% damage.',
    cost: 260, hp: 620, category: 'military', w: 3, h: 3, trainBonus: 'siege', upgradeCost: 170,
    unlockTech: 'tech_siege',
    style: { kind: 'workshop', stone: '#8d8d96', roof: '#58504a', accent: '#c08a3a', w: 3, h: 3 },
  },
  {
    id: 'farm', name: 'Farmstead', desc: 'Generates gold at the end of every wave.',
    cost: 120, hp: 300, category: 'economy', w: 3, h: 2, income: 28, upgradeCost: 90,
    style: { kind: 'farm', stone: '#9c7a3c', roof: '#7a4a2a', accent: '#c9a84f', w: 3, h: 2 },
  },
  {
    id: 'shrine', name: 'Holy Shrine', desc: 'Aura: heals friendly units within range during battle.',
    cost: 200, hp: 340, category: 'magic', w: 2, h: 2, aura: { type: 'heal', value: 6, radius: 170 },
    upgradeCost: 150, unlockTech: 'tech_faith',
    style: { kind: 'shrine', stone: '#cfcbe0', roof: '#e6e1f5', accent: '#e8c558', w: 2, h: 2 },
  },
  {
    id: 'arcane_tower', name: 'Arcane Tower', desc: 'Casts splash magic bolts — superb against monster hordes.',
    cost: 280, hp: 420, category: 'magic', w: 2, h: 2, dmg: 34, range: 200, attackSpeed: 0.8,
    damageType: 'magic', splash: 50, upgradeCost: 190, unlockTech: 'tech_arcana',
    style: { kind: 'tower', stone: '#5a4f80', roof: '#8f6ef0', accent: '#d8c8ff', w: 2, h: 2 },
  },
  {
    id: 'war_banner', name: 'War Banner', desc: 'Aura: nearby friendly units deal +20% damage.',
    cost: 240, hp: 280, category: 'military', w: 2, h: 2, aura: { type: 'damage', value: 0.2, radius: 190 },
    upgradeCost: 160, unlockTech: 'tech_drill',
    style: { kind: 'shrine', stone: '#9a8a6a', roof: '#b02a2a', accent: '#b02a2a', w: 2, h: 2 },
  },
];

export type TechDef = {
  id: string; name: string; desc: string; cost: number; branch: 'military' | 'defense' | 'economy' | 'magic';
  requires: string[];
  effect: { type: 'unlock' | 'stat'; key?: string; value?: number };
};

export const TECHS: TechDef[] = [
  { id: 'tech_drill', name: 'Drill Sergeants', desc: 'Unlocks Man-at-Arms and the War Banner.', cost: 220, branch: 'military', requires: [], effect: { type: 'unlock' } },
  { id: 'tech_stables', name: 'Horse Breeding', desc: 'Unlocks Knights and Stables.', cost: 320, branch: 'military', requires: ['tech_drill'], effect: { type: 'unlock' } },
  { id: 'tech_siege', name: 'Siege Engineering', desc: 'Unlocks Catapults and the Siege Workshop.', cost: 400, branch: 'military', requires: ['tech_drill'], effect: { type: 'unlock' } },
  { id: 'tech_weapons', name: 'Tempered Steel', desc: 'All friendly units deal +15% damage.', cost: 300, branch: 'military', requires: ['tech_drill'], effect: { type: 'stat', key: 'unitDmg', value: 0.15 } },
  { id: 'tech_armor', name: 'Plated Armour', desc: 'All friendly units gain +12% maximum health.', cost: 280, branch: 'defense', requires: [], effect: { type: 'stat', key: 'unitHp', value: 0.12 } },
  { id: 'tech_masonry', name: 'Masonry', desc: 'All structures gain +30% health.', cost: 240, branch: 'defense', requires: [], effect: { type: 'stat', key: 'bldHp', value: 0.3 } },
  { id: 'tech_engineering', name: 'Tower Engineering', desc: 'Unlocks Ballista Towers; towers gain +10% range.', cost: 360, branch: 'defense', requires: ['tech_masonry'], effect: { type: 'stat', key: 'towerRange', value: 0.1 } },
  { id: 'tech_logistics', name: 'Logistics', desc: 'All recruitment costs reduced by 10%.', cost: 260, branch: 'economy', requires: [], effect: { type: 'stat', key: 'costCut', value: 0.1 } },
  { id: 'tech_taxation', name: 'Taxation', desc: 'Kill bounties increased by 20%.', cost: 340, branch: 'economy', requires: ['tech_logistics'], effect: { type: 'stat', key: 'bounty', value: 0.2 } },
  { id: 'tech_granary', name: 'Granaries', desc: 'Farmstead income increased by 50%.', cost: 300, branch: 'economy', requires: ['tech_logistics'], effect: { type: 'stat', key: 'income', value: 0.5 } },
  { id: 'tech_faith', name: 'Order of Faith', desc: 'Unlocks War Clerics and Holy Shrines.', cost: 320, branch: 'magic', requires: [], effect: { type: 'unlock' } },
  { id: 'tech_arcana', name: 'Arcane Studies', desc: 'Unlocks Battlemages and Arcane Towers.', cost: 460, branch: 'magic', requires: ['tech_faith'], effect: { type: 'unlock' } },
  { id: 'tech_wards', name: 'Protective Wards', desc: 'Base takes 20% less damage.', cost: 420, branch: 'magic', requires: ['tech_faith'], effect: { type: 'stat', key: 'baseArmor', value: 0.2 } },
];

export type MissionDef = {
  id: string;
  name: string;
  region: string;
  biome: 'green' | 'swamp' | 'snow' | 'desert';
  desc: string;
  waves: number;
  lanes: number;
  startGold: number;
  reward: number;
  survivalBonusPct: number; // % of kill gold awarded on victory
  objectives: { id: string; text: string; optional?: boolean; kind: 'survive' | 'lairs' | 'nolosses' | 'treasure' | 'capture' }[];
  territory: string;
  enemyPool: string[];
  lairs: number;
  treasures: number;
  hazard?: 'rain' | 'fog' | 'storm' | 'blizzard' | 'none';
};

export const MISSIONS: MissionDef[] = [
  {
    id: 'm1', name: 'The Border Watch', region: 'Greenmarch', biome: 'green',
    desc: 'Goblin raiders probe the eastern road. Hold the watchpost.',
    waves: 5, lanes: 2, startGold: 320, reward: 180, survivalBonusPct: 20, territory: 'greenmarch',
    objectives: [
      { id: 'o1', text: 'Survive all 5 waves', kind: 'survive' },
      { id: 'o2', text: 'Finish with the Keep above 80% health', optional: true, kind: 'nolosses' },
    ],
    enemyPool: ['goblin', 'wolf', 'archergob'], lairs: 0, treasures: 2, hazard: 'none',
  },
  {
    id: 'm2', name: 'Ashford Crossing', region: 'Ashford', biome: 'green',
    desc: 'Orc marauders burn the river villages. Destroy their lairs.',
    waves: 7, lanes: 2, startGold: 420, reward: 280, survivalBonusPct: 20, territory: 'ashford',
    objectives: [
      { id: 'o1', text: 'Survive all 7 waves', kind: 'survive' },
      { id: 'o2', text: 'Destroy 2 enemy lairs', kind: 'lairs' },
      { id: 'o3', text: 'Recover the hidden treasure caches', optional: true, kind: 'treasure' },
    ],
    enemyPool: ['goblin', 'orc', 'archergob', 'wolf', 'ogre'], lairs: 2, treasures: 3, hazard: 'rain',
  },
  {
    id: 'm3', name: 'The Mirefen', region: 'Mirefen', biome: 'swamp',
    desc: 'Something old stirs in the bog. Trolls and the restless dead.',
    waves: 8, lanes: 3, startGold: 520, reward: 380, survivalBonusPct: 25, territory: 'mirefen',
    objectives: [
      { id: 'o1', text: 'Survive all 8 waves', kind: 'survive' },
      { id: 'o2', text: 'Destroy 2 enemy lairs', kind: 'lairs' },
      { id: 'o3', text: 'Capture the Mirefen territory beacon', kind: 'capture' },
    ],
    enemyPool: ['goblin', 'orc', 'skeleton', 'troll', 'shaman', 'archergob'], lairs: 2, treasures: 3, hazard: 'fog',
  },
  {
    id: 'm4', name: 'Frostgate Pass', region: 'Frostgate', biome: 'snow',
    desc: 'The northern pass must not fall. Expect elites.',
    waves: 10, lanes: 3, startGold: 620, reward: 520, survivalBonusPct: 25, territory: 'frostgate',
    objectives: [
      { id: 'o1', text: 'Survive all 10 waves', kind: 'survive' },
      { id: 'o2', text: 'Destroy 3 enemy lairs', kind: 'lairs' },
      { id: 'o3', text: 'Recover the hidden treasure caches', optional: true, kind: 'treasure' },
    ],
    enemyPool: ['orc', 'wolf', 'skeleton', 'ogre', 'shaman', 'harpy', 'warlord'], lairs: 3, treasures: 3, hazard: 'blizzard',
  },
  {
    id: 'm5', name: 'The Emberwaste', region: 'Emberwaste', biome: 'desert',
    desc: 'The demon host gathers in the burning sands. End it.',
    waves: 12, lanes: 4, startGold: 800, reward: 900, survivalBonusPct: 30, territory: 'emberwaste',
    objectives: [
      { id: 'o1', text: 'Survive all 12 waves', kind: 'survive' },
      { id: 'o2', text: 'Destroy 3 enemy lairs', kind: 'lairs' },
      { id: 'o3', text: 'Capture the Emberwaste obelisk', kind: 'capture' },
      { id: 'o4', text: 'Keep the Keep above 80% health', optional: true, kind: 'nolosses' },
    ],
    enemyPool: ['orc', 'skeleton', 'troll', 'shaman', 'harpy', 'ogre', 'warlord', 'necromancer', 'demon'],
    lairs: 3, treasures: 4, hazard: 'storm',
  },
];

export const ENDLESS: MissionDef = {
  id: 'endless', name: 'Endless Siege', region: 'Kingsmoor', biome: 'green',
  desc: 'Survive as long as the kingdom can bear. Waves never stop.',
  waves: 9999, lanes: 4, startGold: 600, reward: 0, survivalBonusPct: 10, territory: 'kingsmoor',
  objectives: [{ id: 'o1', text: 'Survive as many waves as possible', kind: 'survive' }],
  enemyPool: ['goblin', 'wolf', 'orc', 'archergob', 'skeleton', 'ogre', 'shaman', 'harpy', 'troll', 'warlord', 'necromancer', 'demon'],
  lairs: 2, treasures: 2, hazard: 'none',
};

export type TerritoryDef = { id: string; name: string; income: number; x: number; y: number; unlocks?: string };
export const TERRITORIES: TerritoryDef[] = [
  { id: 'kingsmoor', name: 'Kingsmoor (Home)', income: 0, x: 50, y: 60 },
  { id: 'greenmarch', name: 'Greenmarch', income: 25, x: 66, y: 52 },
  { id: 'ashford', name: 'Ashford', income: 40, x: 76, y: 66 },
  { id: 'mirefen', name: 'Mirefen', income: 60, x: 58, y: 80 },
  { id: 'frostgate', name: 'Frostgate', income: 85, x: 40, y: 26 },
  { id: 'emberwaste', name: 'Emberwaste', income: 130, x: 84, y: 36 },
];

export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTY: Record<Difficulty, { hp: number; dmg: number; count: number; bounty: number; label: string }> = {
  easy: { hp: 0.75, dmg: 0.75, count: 0.8, bounty: 1.15, label: 'Easy' },
  normal: { hp: 1, dmg: 1, count: 1, bounty: 1, label: 'Normal' },
  hard: { hp: 1.4, dmg: 1.3, count: 1.25, bounty: 0.9, label: 'Hard' },
};

/** Deterministic wave composition generator (data-driven, controlled variation). */
export function buildWave(mission: MissionDef, wave: number, diff: Difficulty): { id: string; count: number; lane: number; delay: number }[] {
  const d = DIFFICULTY[diff];
  const rnd = mulberry(wave * 7919 + mission.id.length * 131);
  const budget = Math.round((40 + wave * wave * 7 + wave * 34) * d.count);
  const pool = mission.enemyPool.filter((id) => {
    const e = ENEMIES.find((x) => x.id === id)!;
    if (e.elite) return wave >= 5 && wave % 4 === 0;
    if (['ogre', 'troll'].includes(id)) return wave >= 3;
    if (['shaman', 'harpy'].includes(id)) return wave >= 2;
    return true;
  });
  const lanes = Math.min(mission.lanes, 1 + Math.floor(wave / 2));
  const groups: { id: string; count: number; lane: number; delay: number }[] = [];
  let spent = 0;
  let guard = 0;
  while (spent < budget && guard++ < 40) {
    const id = pool[Math.floor(rnd() * pool.length)];
    const e = ENEMIES.find((x) => x.id === id)!;
    const costUnit = Math.max(6, e.bounty);
    const max = Math.max(1, Math.floor((budget - spent) / costUnit));
    const count = e.elite ? 1 : Math.max(1, Math.min(max, 2 + Math.floor(rnd() * 6) + Math.floor(wave / 3)));
    if (count * costUnit > budget - spent && groups.length > 0) break;
    groups.push({ id, count, lane: Math.floor(rnd() * lanes), delay: groups.length * (0.8 + rnd() * 1.6) });
    spent += count * costUnit;
  }
  return groups;
}

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const UNIT_MAP = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export const ENEMY_MAP = Object.fromEntries(ENEMIES.map((u) => [u.id, u]));
export const BUILDING_MAP = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
export const TECH_MAP = Object.fromEntries(TECHS.map((t) => [t.id, t]));
