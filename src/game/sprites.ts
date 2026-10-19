/**
 * Procedural pixel-art sprite generator.
 * Produces real raster assets (offscreen canvases) at load time:
 * every unit/building gets a sprite sheet with directional + animated frames.
 * Grid-based: each sprite is drawn on a small pixel grid then scaled up.
 */

export type CreatureStyle = {
  skin: string;
  armor: string;
  accent: string;
  cloth: string;
  weapon: 'sword' | 'spear' | 'bow' | 'axe' | 'staff' | 'claw' | 'siege' | 'hammer';
  shield?: boolean;
  helmet?: boolean;
  horns?: boolean;
  mount?: string; // horse color
  scale?: number;
  wings?: boolean;
};

const PX = 2; // upscale factor

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(x * PX, y * PX, w * PX, h * PX);
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export const GRID = 24; // logical pixel grid per frame

/** Draw one frame of a creature facing right. */
function drawCreature(ctx: CanvasRenderingContext2D, s: CreatureStyle, frame: number, dead = false) {
  const cx = 12;
  const bob = frame === 1 ? -1 : frame === 2 ? 0 : 0;
  const atk = frame === 3;
  const baseY = 20;

  if (dead) {
    px(ctx, cx - 6, baseY - 2, 12, 3, s.armor);
    px(ctx, cx - 7, baseY - 1, 2, 2, s.skin);
    px(ctx, cx + 4, baseY - 3, 5, 1, shade(s.accent, -20));
    return;
  }

  if (s.mount) {
    // horse body
    px(ctx, cx - 7, baseY - 7, 13, 5, s.mount);
    px(ctx, cx + 5, baseY - 10, 4, 4, s.mount); // head/neck
    px(ctx, cx + 8, baseY - 8, 2, 2, shade(s.mount, -30));
    px(ctx, cx - 7, baseY - 9, 3, 3, shade(s.mount, -25)); // tail
    const l = frame === 1 ? 1 : 0;
    px(ctx, cx - 5, baseY - 2, 2, 2 + l, shade(s.mount, -40));
    px(ctx, cx + 3, baseY - 2, 2, 3 - l, shade(s.mount, -40));
  }

  const top = s.mount ? baseY - 14 : baseY - 12 + bob;

  // legs
  if (!s.mount) {
    const sw = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    px(ctx, cx - 3 + sw, baseY - 4, 2, 4, shade(s.cloth, -30));
    px(ctx, cx + 1 - sw, baseY - 4, 2, 4, shade(s.cloth, -30));
    px(ctx, cx - 4 + sw, baseY - 1, 3, 1, '#2b1f16');
    px(ctx, cx + 1 - sw, baseY - 1, 3, 1, '#2b1f16');
  }

  // torso
  px(ctx, cx - 3, top + 4, 6, 6, s.armor);
  px(ctx, cx - 3, top + 4, 6, 1, shade(s.armor, 35));
  px(ctx, cx - 1, top + 6, 2, 3, s.accent); // tabard
  // arms
  px(ctx, cx - 5, top + 5, 2, 4, shade(s.armor, -20));
  px(ctx, cx + 3, top + (atk ? 3 : 5), 2, 4, shade(s.armor, -20));
  // head
  px(ctx, cx - 2, top, 5, 4, s.skin);
  px(ctx, cx + 1, top + 1, 1, 1, '#1a1008');
  if (s.helmet) {
    px(ctx, cx - 3, top - 1, 7, 2, shade(s.armor, 20));
    px(ctx, cx - 3, top + 1, 1, 3, shade(s.armor, 10));
    px(ctx, cx + 1, top - 3, 1, 2, s.accent);
  }
  if (s.horns) {
    px(ctx, cx - 3, top - 2, 1, 2, '#e8dcc0');
    px(ctx, cx + 3, top - 2, 1, 2, '#e8dcc0');
  }
  if (s.wings) {
    px(ctx, cx - 9, top + 2, 6, 2, shade(s.accent, -10));
    px(ctx, cx - 8, top + 4, 4, 2, shade(s.accent, -30));
  }

  // weapon
  const ay = atk ? top + 1 : top + 3;
  switch (s.weapon) {
    case 'sword':
      px(ctx, cx + 5, ay - (atk ? 2 : 4), 1, 7, '#d9e2ea');
      px(ctx, cx + 4, ay + 3, 3, 1, '#8a6b2f');
      break;
    case 'spear':
      px(ctx, cx + 5, ay - 6, 1, 11, '#8a6b2f');
      px(ctx, cx + 4, ay - 8, 3, 3, '#d9e2ea');
      break;
    case 'bow':
      px(ctx, cx + 5, ay - 4, 1, 9, '#8a6b2f');
      px(ctx, cx + 6, ay - 2, 1, 5, '#e3d6b8');
      break;
    case 'axe':
      px(ctx, cx + 5, ay - 4, 1, 8, '#6b4a26');
      px(ctx, cx + 4, ay - 5, 4, 3, '#b9c4ce');
      break;
    case 'hammer':
      px(ctx, cx + 5, ay - 3, 1, 8, '#6b4a26');
      px(ctx, cx + 3, ay - 5, 5, 3, '#9aa4ae');
      break;
    case 'staff':
      px(ctx, cx + 5, ay - 6, 1, 11, '#6b4a26');
      px(ctx, cx + 4, ay - 8, 3, 3, s.accent);
      px(ctx, cx + 5, ay - 9, 1, 1, '#ffffff');
      break;
    case 'claw':
      px(ctx, cx + 5, ay + 1, 3, 1, shade(s.skin, -40));
      px(ctx, cx + 7, ay, 1, 3, '#f2e9d8');
      break;
    case 'siege':
      px(ctx, cx - 8, baseY - 8, 16, 6, '#7a5a32');
      px(ctx, cx - 8, baseY - 8, 16, 1, '#a07c47');
      px(ctx, cx - 6, baseY - 3, 4, 4, '#4a3620');
      px(ctx, cx + 2, baseY - 3, 4, 4, '#4a3620');
      px(ctx, cx + 1, baseY - 14, 2, 7, '#5d4426');
      px(ctx, cx - 2, baseY - 15, 6, 3, '#8c7049');
      break;
  }
  if (s.shield) {
    px(ctx, cx - 7, top + 4, 3, 6, s.accent);
    px(ctx, cx - 7, top + 4, 3, 1, shade(s.accent, 40));
    px(ctx, cx - 6, top + 6, 1, 2, '#f2e9d8');
  }
}

export type Sheet = { canvas: HTMLCanvasElement; frames: number; size: number };

/** 4 frames (idle, walk1, walk2, attack) + 1 dead, x 2 facings (right, left). */
export function makeCreatureSheet(style: CreatureStyle): Sheet {
  const size = GRID * PX;
  const frames = 5;
  const c = document.createElement('canvas');
  c.width = size * frames;
  c.height = size * 2;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.translate(f * size, 0);
    drawCreature(ctx, style, f, f === 4);
    ctx.restore();
  }
  // mirrored row
  for (let f = 0; f < frames; f++) {
    ctx.save();
    ctx.translate(f * size + size, size);
    ctx.scale(-1, 1);
    drawCreature(ctx, style, f, f === 4);
    ctx.restore();
  }
  return { canvas: c, frames, size };
}

export type BuildingStyle = {
  kind: 'keep' | 'tower' | 'wall' | 'barracks' | 'farm' | 'shrine' | 'range' | 'stable' | 'workshop' | 'trap' | 'lair';
  stone: string;
  roof: string;
  accent: string;
  w: number; // in tiles
  h: number;
};

function drawBuilding(ctx: CanvasRenderingContext2D, b: BuildingStyle, dmg: number) {
  const W = b.w * 16, H = b.h * 16;
  const stone = b.stone;
  const dark = shade(stone, -35);
  const light = shade(stone, 30);
  const rect = (x: number, y: number, w: number, h: number, c: string) => px(ctx, x, y, w, h, c);

  const base = () => {
    rect(1, 2, W - 2, H - 3, dark);
    rect(1, 1, W - 2, H - 3, stone);
    for (let y = 3; y < H - 3; y += 4)
      for (let x = 2 + ((y / 4) % 2 ? 2 : 0); x < W - 4; x += 5) rect(x, y, 3, 2, light);
  };

  switch (b.kind) {
    case 'keep':
      base();
      rect(0, 0, 4, 5, shade(stone, 10)); rect(W - 4, 0, 4, 5, shade(stone, 10));
      rect(0, H - 6, 4, 6, shade(stone, 10)); rect(W - 4, H - 6, 4, 6, shade(stone, 10));
      rect(W / 2 - 5, H / 2 - 5, 10, 10, b.roof);
      rect(W / 2 - 5, H / 2 - 5, 10, 2, shade(b.roof, 30));
      rect(W / 2 - 1, H / 2 - 11, 1, 6, '#5a4228');
      rect(W / 2, H / 2 - 11, 5, 4, b.accent);
      break;
    case 'tower':
      rect(2, 2, W - 4, H - 4, dark);
      rect(2, 1, W - 4, H - 4, stone);
      rect(4, 3, W - 8, H - 8, shade(stone, 15));
      for (let i = 2; i < W - 4; i += 4) rect(i, 0, 2, 2, light);
      rect(W / 2 - 3, H / 2 - 3, 6, 6, b.roof);
      rect(W / 2 - 1, H / 2 - 1, 2, 2, b.accent);
      break;
    case 'wall':
      rect(0, 3, W, H - 5, dark);
      rect(0, 2, W, H - 5, stone);
      for (let i = 0; i < W; i += 5) rect(i, 2, 3, 2, light);
      break;
    case 'barracks':
    case 'range':
    case 'stable':
    case 'workshop':
      base();
      rect(2, 2, W - 4, H - 5, b.roof);
      for (let y = 2; y < H - 3; y += 3) rect(2, y, W - 4, 1, shade(b.roof, -25));
      rect(W / 2 - 1, 0, 2, 3, '#5a4228');
      rect(W / 2 + 1, 0, 4, 3, b.accent);
      break;
    case 'farm':
      rect(0, 0, W, H, '#6b4f2a');
      for (let y = 1; y < H; y += 3) rect(1, y, W - 2, 2, '#9c7a3c');
      for (let y = 2; y < H; y += 3) rect(1, y, W - 2, 1, '#c9a84f');
      rect(W - 7, H - 7, 6, 6, b.roof);
      break;
    case 'shrine':
      rect(2, 3, W - 4, H - 5, shade(stone, 20));
      rect(4, 1, W - 8, H - 6, '#e6e1f5');
      rect(W / 2 - 2, H / 2 - 2, 4, 4, b.accent);
      rect(W / 2 - 1, H / 2 - 5, 2, 3, shade(b.accent, 40));
      break;
    case 'trap':
      rect(1, 1, W - 2, H - 2, '#3a2c1c');
      for (let i = 2; i < W - 2; i += 3) { rect(i, 2, 1, H - 4, '#cfd6dd'); }
      break;
    case 'lair':
      rect(1, 3, W - 2, H - 4, '#2e2420');
      rect(3, 1, W - 6, H - 5, '#4a3a33');
      rect(W / 2 - 3, H / 2 - 2, 6, 6, '#120d0b');
      rect(W / 2 - 4, H / 2 + 3, 8, 2, '#6b2222');
      break;
  }
  if (dmg > 0) {
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < dmg * 7; i++) {
      const x = (i * 7919) % (W - 2) + 1, y = (i * 104729) % (H - 2) + 1;
      px(ctx, x, y, 2, 2, i % 3 ? '#2a2018' : '#593b22');
    }
    ctx.globalAlpha = 1;
  }
}

export function makeBuildingSheet(b: BuildingStyle): Sheet {
  const W = b.w * 16 * PX, H = b.h * 16 * PX;
  const c = document.createElement('canvas');
  c.width = W * 3; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let d = 0; d < 3; d++) {
    ctx.save(); ctx.translate(d * W, 0);
    drawBuilding(ctx, b, d);
    ctx.restore();
  }
  return { canvas: c, frames: 3, size: W };
}

/** Terrain tile atlas: grass variants, dirt, path, stone, forest, swamp, snow, water, rock */
export const TILE = 32;
export type TerrainKind = 'grass' | 'grass2' | 'dirt' | 'path' | 'forest' | 'rock' | 'water' | 'swamp' | 'snow' | 'sand';
export const TERRAINS: TerrainKind[] = ['grass', 'grass2', 'dirt', 'path', 'forest', 'rock', 'water', 'swamp', 'snow', 'sand'];

export function makeTerrainAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE * TERRAINS.length; c.height = TILE;
  const ctx = c.getContext('2d')!;
  const palettes: Record<TerrainKind, string[]> = {
    grass: ['#4b7a32', '#568c38', '#43702c', '#5f9940'],
    grass2: ['#42702e', '#4f8434', '#3b6628', '#588f3a'],
    dirt: ['#6e5433', '#7d603a', '#60492c', '#8a6b43'],
    path: ['#8a7044', '#9a7e4e', '#7a6239', '#a98e5c'],
    forest: ['#2c4d20', '#376026', '#24401a', '#3f6d2b'],
    rock: ['#6a6a70', '#7a7a81', '#5b5b61', '#8a8a92'],
    water: ['#2a5a86', '#326a9a', '#234d74', '#3d7cae'],
    swamp: ['#3f4a2c', '#4a5733', '#354026', '#556240'],
    snow: ['#d9e3ec', '#e8f0f6', '#c7d3de', '#f2f7fb'],
    sand: ['#c2a768', '#d0b678', '#b0955a', '#dcc68a'],
  };
  TERRAINS.forEach((t, i) => {
    const p = palettes[t];
    for (let y = 0; y < TILE; y += 2)
      for (let x = 0; x < TILE; x += 2) {
        const n = (x * 7 + y * 13 + i * 31 + ((x * y) % 11)) % p.length;
        ctx.fillStyle = p[n];
        ctx.fillRect(i * TILE + x, y, 2, 2);
      }
    if (t === 'forest') {
      // canopy blobs
      for (let k = 0; k < 4; k++) {
        const bx = 4 + ((k * 11) % 20), by = 4 + ((k * 17) % 20);
        ctx.fillStyle = '#1e3715';
        ctx.fillRect(i * TILE + bx, by + 6, 10, 8);
        ctx.fillStyle = '#58913a';
        ctx.fillRect(i * TILE + bx, by + 2, 10, 8);
        ctx.fillStyle = '#75b24d';
        ctx.fillRect(i * TILE + bx + 2, by + 2, 5, 3);
      }
    }
    if (t === 'rock') {
      ctx.fillStyle = '#4e4e55';
      ctx.fillRect(i * TILE + 6, 10, 18, 14);
      ctx.fillStyle = '#9b9ba4';
      ctx.fillRect(i * TILE + 8, 8, 14, 10);
      ctx.fillStyle = '#c3c3cc';
      ctx.fillRect(i * TILE + 10, 9, 6, 3);
    }
  });
  return c;
}
