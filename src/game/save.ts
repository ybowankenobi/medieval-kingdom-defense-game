import type { Difficulty } from './data';

export const SAVE_VERSION = 3;
const KEY = (slot: number) => `kingdomfall.save.${slot}`;
const BACKUP = (slot: number) => `kingdomfall.backup.${slot}`;
export const SLOTS = [0, 1, 2];

export type SaveData = {
  version: number;
  slot: number;
  name: string;
  updated: number;
  gold: number;
  difficulty: Difficulty;
  completedMissions: string[];
  territories: string[]; // owned
  techs: string[];
  unitLevels: Record<string, number>;
  unitXp: Record<string, number>;
  endlessBest: number;
  claimedRewards: string[]; // audit log, prevents duplicate payouts
  cosmetics: { banner: string; color: string };
  settings: { music: number; sfx: number; uiScale: number; showFx: boolean };
};

export function defaultSave(slot: number): SaveData {
  return {
    version: SAVE_VERSION,
    slot,
    name: `Realm ${slot + 1}`,
    updated: Date.now(),
    gold: 400,
    difficulty: 'normal',
    completedMissions: [],
    territories: ['kingsmoor'],
    techs: [],
    unitLevels: {},
    unitXp: {},
    endlessBest: 0,
    claimedRewards: [],
    cosmetics: { banner: 'lion', color: '#b02a2a' },
    settings: { music: 0.4, sfx: 0.7, uiScale: 1, showFx: true },
  };
}

function validate(d: any, slot: number): SaveData | null {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.gold !== 'number' || !Array.isArray(d.territories)) return null;
  const base = defaultSave(slot);
  const out: SaveData = {
    ...base,
    ...d,
    slot,
    gold: Math.max(0, Math.floor(d.gold) || 0),
    completedMissions: Array.isArray(d.completedMissions) ? d.completedMissions : [],
    territories: Array.isArray(d.territories) && d.territories.length ? d.territories : ['kingsmoor'],
    techs: Array.isArray(d.techs) ? d.techs : [],
    claimedRewards: Array.isArray(d.claimedRewards) ? d.claimedRewards : [],
    unitLevels: typeof d.unitLevels === 'object' && d.unitLevels ? d.unitLevels : {},
    unitXp: typeof d.unitXp === 'object' && d.unitXp ? d.unitXp : {},
    settings: { ...base.settings, ...(d.settings || {}) },
    cosmetics: { ...base.cosmetics, ...(d.cosmetics || {}) },
    version: SAVE_VERSION,
  };
  return out;
}

export function loadSlot(slot: number): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (raw) {
      const v = validate(JSON.parse(raw), slot);
      if (v) return v;
    }
  } catch {
    /* corrupt primary save — try the backup below */
  }
  try {
    const b = localStorage.getItem(BACKUP(slot));
    if (b) return validate(JSON.parse(b), slot);
  } catch {
    /* backup unusable too */
  }
  return null;
}

/** Safe write: previous good save is kept as a backup before overwriting. */
export function saveSlot(data: SaveData) {
  try {
    const prev = localStorage.getItem(KEY(data.slot));
    if (prev) localStorage.setItem(BACKUP(data.slot), prev);
    data.updated = Date.now();
    data.version = SAVE_VERSION;
    const str = JSON.stringify(data);
    JSON.parse(str); // integrity check before commit
    localStorage.setItem(KEY(data.slot), str);
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(slot: number) {
  localStorage.removeItem(KEY(slot));
  localStorage.removeItem(BACKUP(slot));
}

export function listSlots() {
  return SLOTS.map((s) => ({ slot: s, data: loadSlot(s) }));
}

/** Deterministic, audited reward grant — never pays the same reward twice. */
export function grantReward(save: SaveData, id: string, amount: number): { save: SaveData; granted: number } {
  if (save.claimedRewards.includes(id)) return { save, granted: 0 };
  const next = { ...save, gold: save.gold + amount, claimedRewards: [...save.claimedRewards, id] };
  return { save: next, granted: amount };
}
