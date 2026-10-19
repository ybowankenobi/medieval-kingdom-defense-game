import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, type Snapshot } from '../game/engine';
import { BUILDINGS, UNITS, UNIT_MAP, ENEMY_MAP, BUILDING_MAP, DIFFICULTY, type MissionDef, type Difficulty } from '../game/data';
import { TILE } from '../game/sprites';
import type { SaveData } from '../game/save';
import { audio } from '../game/audio';

type Panel = null | 'recruit' | 'build' | 'objectives' | 'info' | 'presets';
type Mode = { kind: 'select' } | { kind: 'place'; defId: string } | { kind: 'deploy'; unitId: string } | { kind: 'command' };

const PRESETS: { name: string; list: { id: string; n: number }[] }[] = [
  { name: 'Shield Wall', list: [{ id: 'swordsman', n: 4 }, { id: 'spearman', n: 2 }] },
  { name: 'Skirmish Line', list: [{ id: 'swordsman', n: 2 }, { id: 'archer', n: 4 }] },
  { name: 'Lance Charge', list: [{ id: 'knight', n: 3 }] },
  { name: 'Siege Battery', list: [{ id: 'catapult', n: 2 }, { id: 'spearman', n: 3 }] },
];

export default function Battle({
  mission, difficulty, save, onExit, onFinish,
}: {
  mission: MissionDef; difficulty: Difficulty; save: SaveData;
  onExit: () => void;
  onFinish: (result: 'victory' | 'defeat', killGold: number, wave: number, optional: string[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'select' });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [toast, setToast] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [finished, setFinished] = useState<null | 'victory' | 'defeat'>(null);
  const [paused, setPaused] = useState(false);
  const [boxSel, setBoxSel] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 1800); }, []);

  // init engine
  useEffect(() => {
    const c = canvasRef.current!;
    const g = new Game(c, mission, difficulty, save, (s) => setSnap(s));
    gameRef.current = g;
    const resize = () => {
      const r = wrapRef.current!.getBoundingClientRect();
      g.resize(r.width, r.height);
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    const mini = setInterval(() => { if (miniRef.current) g.renderMinimap(miniRef.current); }, 250);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize); clearInterval(mini); g.destroy(); };
  }, [mission, difficulty, save]);

  // victory / defeat hand-off
  useEffect(() => {
    if (!snap || finished) return;
    if (snap.phase === 'victory' || snap.phase === 'defeat') {
      setFinished(snap.phase);
      const opt = snap.objectives.filter((o) => o.optional && o.done).map((o) => o.id);
      onFinish(snap.phase, snap.killGold, snap.wave, opt);
    }
  }, [snap, finished, onFinish]);

  // ---- touch / pointer input ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragState = useRef({ moved: 0, start: { x: 0, y: 0 }, pinch: 0, longPress: 0, boxing: false });

  const onPointerDown = (e: React.PointerEvent) => {
    audio.init();
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragState.current.moved = 0;
    dragState.current.start = { x: e.clientX, y: e.clientY };
    dragState.current.boxing = modeRef.current.kind === 'command';
    if (dragState.current.boxing) {
      const r = canvasRef.current!.getBoundingClientRect();
      setBoxSel({ x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top });
    }
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      dragState.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gameRef.current; if (!g) return;
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (modeRef.current.kind === 'place') updatePlace(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragState.current.moved += Math.abs(dx) + Math.abs(dy);

    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (dragState.current.pinch > 0) {
        const r = canvasRef.current!.getBoundingClientRect();
        g.zoomBy(d / dragState.current.pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
      dragState.current.pinch = d;
      return;
    }
    if (dragState.current.boxing) {
      const r = canvasRef.current!.getBoundingClientRect();
      setBoxSel((s) => (s ? { ...s, x1: e.clientX - r.left, y1: e.clientY - r.top } : s));
      return;
    }
    if (modeRef.current.kind === 'place') { updatePlace(e.clientX, e.clientY); return; }
    g.panBy(dx, dy);
  };

  const updatePlace = (cx: number, cy: number) => {
    const g = gameRef.current!; const m = modeRef.current;
    if (m.kind !== 'place') return;
    const r = canvasRef.current!.getBoundingClientRect();
    const w = g.screenToWorld(cx - r.left, cy - r.top);
    const def = BUILDING_MAP[m.defId];
    const tx = Math.round(w.x / TILE - def.w / 2), ty = Math.round(w.y / TILE - def.h / 2);
    g.placing = { defId: m.defId };
    g.placeTile = { x: tx, y: ty };
    g.placeValid = g.canPlace(def, tx, ty) && g.gold >= def.cost;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gameRef.current; if (!g) return;
    const wasBoxing = dragState.current.boxing;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) dragState.current.pinch = 0;
    const r = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const world = g.screenToWorld(sx, sy);

    if (wasBoxing && boxSel) {
      dragState.current.boxing = false;
      if (dragState.current.moved > 16) {
        const a = g.screenToWorld(boxSel.x0, boxSel.y0), b = g.screenToWorld(sx, sy);
        const n = g.boxSelect(a.x, a.y, b.x, b.y);
        notify(n ? `${n} troops selected` : 'No troops in selection');
      } else {
        g.command('hold', world.x, world.y);
        notify('Move order issued');
      }
      setBoxSel(null);
      return;
    }

    if (dragState.current.moved > 12) return; // was a pan

    const m = modeRef.current;
    if (m.kind === 'place') {
      const def = BUILDING_MAP[m.defId];
      const tx = Math.round(world.x / TILE - def.w / 2), ty = Math.round(world.y / TILE - def.h / 2);
      const err = g.tryPlaceBuilding(m.defId, tx, ty);
      if (err) { notify(err); audio.play('error'); }
      else notify(`${def.name} built`);
      return;
    }
    if (m.kind === 'deploy') {
      const err = g.deploy(m.unitId, world.x, world.y);
      if (err) { notify(err); audio.play('error'); setMode({ kind: 'select' }); g.placing = null; }
      else if (!(g.reserves[m.unitId] || 0)) { setMode({ kind: 'select' }); notify('Reserve empty'); }
      return;
    }
    const sel = g.selectAt(world.x, world.y);
    if (sel) { setPanel('info'); audio.play('ui'); }
  };

  const exitMode = () => { setMode({ kind: 'select' }); if (gameRef.current) gameRef.current.placing = null; };

  const miniTap = (e: React.PointerEvent) => {
    const g = gameRef.current!; const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    g.focus(fx * g.cols * TILE, fy * g.rows * TILE);
  };

  const setSpeed = (s: number) => {
    const g = gameRef.current!;
    if (s === 0) { g.running = false; setPaused(true); } else { g.running = true; g.speed = s; setPaused(false); }
    audio.play('ui');
  };

  if (!snap) return <div className="flex h-full items-center justify-center bg-stone-900 text-amber-200">Forging the realm…</div>;

  const g = gameRef.current!;
  const btn = 'rounded-md border-2 border-amber-900/70 bg-gradient-to-b from-stone-700 to-stone-800 px-3 py-2 text-amber-100 shadow active:translate-y-px disabled:opacity-40';
  const panelCls = 'absolute bottom-16 left-2 right-2 max-h-[58%] overflow-y-auto rounded-lg border-2 border-amber-900/80 bg-stone-900/95 p-3 text-amber-100 shadow-2xl md:right-auto md:w-[520px]';

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none overflow-hidden bg-stone-950 select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => gameRef.current?.zoomBy(e.deltaY < 0 ? 1.12 : 0.9)}
      />
      {boxSel && (
        <div className="pointer-events-none absolute border-2 border-emerald-400/80 bg-emerald-400/10"
          style={{ left: Math.min(boxSel.x0, boxSel.x1), top: Math.min(boxSel.y0, boxSel.y1), width: Math.abs(boxSel.x1 - boxSel.x0), height: Math.abs(boxSel.y1 - boxSel.y0) }} />
      )}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 text-xs" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border-2 border-amber-900/80 bg-stone-900/90 px-3 py-1.5 text-amber-100 shadow-lg">
          <span className="font-bold text-amber-300">🪙 {snap.gold}</span>
          <span className="text-amber-200/70">|</span>
          <span>🏰 {snap.baseHp}/{snap.baseMax}</span>
          <span className="text-amber-200/70">|</span>
          <span>Wave {snap.wave}/{mission.waves === 9999 ? '∞' : mission.waves}</span>
          <span className="text-amber-200/70">|</span>
          <span className={snap.phase === 'battle' ? 'text-red-300' : 'text-emerald-300'}>{snap.phase === 'battle' ? `⚔ ${snap.enemiesAlive} foes` : 'Preparation'}</span>
          {snap.weather !== 'none' && <span className="text-sky-300">· {snap.weather}</span>}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          {[0, 1, 2, 3].map((s) => (
            <button key={s} onClick={() => setSpeed(s)}
              className={`rounded border-2 border-amber-900/70 px-2 py-1 ${(paused ? 0 : g.speed) === s ? 'bg-amber-600 text-stone-900' : 'bg-stone-800 text-amber-100'}`}>
              {s === 0 ? '⏸' : `${s}×`}
            </button>
          ))}
          <button className={btn + ' px-2 py-1'} onClick={onExit}>☰</button>
        </div>
      </div>

      {/* minimap + nav */}
      <div className="absolute right-2 top-14 flex flex-col items-end gap-1" >
        <canvas ref={miniRef} width={168} height={116} onPointerDown={miniTap}
          className="rounded border-2 border-amber-900/80 bg-stone-900/90 shadow-lg" style={{ touchAction: 'none' }} />
        <div className="flex gap-1 text-[11px]">
          <button className={btn + ' px-2 py-1'} onClick={() => g.focusBase()}>🏰</button>
          <button className={btn + ' px-2 py-1'} onClick={() => g.focusArmy()}>🛡</button>
          <button className={btn + ' px-2 py-1'} onClick={() => g.focusThreat()}>⚠</button>
          <button className={btn + ' px-2 py-1'} onClick={() => g.zoomBy(1.2)}>＋</button>
          <button className={btn + ' px-2 py-1'} onClick={() => g.zoomBy(0.83)}>－</button>
        </div>
      </div>

      {/* objectives strip */}
      <div className="absolute left-2 top-14 w-56 rounded-lg border-2 border-amber-900/80 bg-stone-900/85 p-2 text-[11px] text-amber-100 shadow-lg">
        <div className="mb-1 font-bold text-amber-300">Objectives</div>
        {snap.objectives.map((o) => (
          <div key={o.id} className={`flex justify-between gap-2 ${o.done ? 'text-emerald-300' : o.failed ? 'text-red-300' : ''}`}>
            <span>{o.done ? '✔' : o.failed ? '✖' : '◻'} {o.text}{o.optional ? ' (opt)' : ''}</span>
            <span className="opacity-70">{o.progress}</span>
          </div>
        ))}
      </div>

      {(snap.message || toast) && (
        <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-md border-2 border-amber-700 bg-stone-900/95 px-4 py-2 text-sm font-bold text-amber-200 shadow-xl">
          {toast || snap.message}
        </div>
      )}

      {mode.kind !== 'select' && (
        <div className="absolute left-1/2 top-36 flex -translate-x-1/2 items-center gap-2 rounded-md border-2 border-amber-700 bg-stone-900/95 px-3 py-1.5 text-xs text-amber-100">
          {mode.kind === 'place' && <span>Tap the map to build {BUILDING_MAP[mode.defId].name}</span>}
          {mode.kind === 'deploy' && <span>Tap your territory to deploy {UNIT_MAP[mode.unitId].name} ({snap.reserves[mode.unitId] || 0} left)</span>}
          {mode.kind === 'command' && <span>Drag to select troops · tap to order a move</span>}
          <button className="rounded bg-red-800 px-2 py-0.5" onClick={exitMode}>Cancel</button>
        </div>
      )}

      {/* bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 overflow-x-auto border-t-2 border-amber-900/80 bg-stone-900/95 p-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <button className={btn + ' text-sm'} onClick={() => { setPanel(panel === 'recruit' ? null : 'recruit'); exitMode(); }}>⚔ Recruit</button>
        <button className={btn + ' text-sm'} onClick={() => { setPanel(panel === 'build' ? null : 'build'); exitMode(); }}>🏗 Build</button>
        <button className={btn + ' text-sm'} onClick={() => { setPanel(panel === 'presets' ? null : 'presets'); exitMode(); }}>⚡ Presets</button>
        <button className={btn + ' text-sm'} onClick={() => setMode(mode.kind === 'command' ? { kind: 'select' } : { kind: 'command' })}>🎯 Orders</button>
        <button className={btn + ' text-sm'} onClick={() => g.command('hold')}>✋ Hold</button>
        <button className={btn + ' text-sm'} onClick={() => g.command('resume')}>➡ Resume</button>
        <button className={btn + ' text-sm'} onClick={() => g.command('retreat')}>🏳 Retreat</button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-amber-200/60">{snap.fps}fps · {snap.unitCount}u</span>
          {snap.phase === 'prep' && (
            <button className="rounded-md border-2 border-amber-500 bg-gradient-to-b from-amber-500 to-amber-700 px-4 py-2 font-bold text-stone-900 shadow-lg"
              onClick={() => { g.startWave(); setPanel(null); exitMode(); }}>
              ▶ Start Wave {snap.wave + 1}
            </button>
          )}
        </div>
      </div>

      {/* panels */}
      {panel === 'recruit' && (
        <div className={panelCls}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-amber-300">Recruitment & Reserves</h3>
            <div className="flex gap-1">
              {[1, 5, 10].map((q) => (
                <button key={q} className={`rounded px-2 py-1 text-xs ${qty === q ? 'bg-amber-600 text-stone-900' : 'bg-stone-700'}`} onClick={() => setQty(q)}>×{q}</button>
              ))}
              <button className="rounded bg-stone-700 px-2 py-1 text-xs" onClick={() => setPanel(null)}>✕</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {UNITS.map((u) => {
              const locked = !!u.unlockTech && !save.techs.includes(u.unlockTech);
              const cost = g.unitCost(u.id);
              return (
                <div key={u.id} className={`rounded border border-amber-900/60 bg-stone-800/80 p-2 ${locked ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span>{u.name} <span className="text-[10px] text-amber-300">Lv{save.unitLevels[u.id] || 1}</span></span>
                    <span className="text-amber-300">{cost}g</span>
                  </div>
                  <div className="text-[11px] text-amber-100/70">{u.desc}</div>
                  <div className="text-[10px] text-amber-200/60">HP {u.hp} · DMG {u.dmg} · RNG {u.range} · {u.damageType}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button disabled={locked} className={btn + ' flex-1 py-1 text-xs'} onClick={() => {
                      const err = g.recruit(u.id, qty); if (err) { notify(err); audio.play('error'); } else notify(`Recruited ${qty} ${u.name}`);
                    }}>Recruit ×{qty}</button>
                    <button disabled={locked || !(snap.reserves[u.id] || 0)} className={btn + ' flex-1 py-1 text-xs'}
                      onClick={() => { setMode({ kind: 'deploy', unitId: u.id }); setPanel(null); }}>
                      Deploy ({snap.reserves[u.id] || 0})
                    </button>
                  </div>
                  {locked && <div className="mt-1 text-[10px] text-red-300">🔒 Requires {u.unlockTech}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {panel === 'build' && (
        <div className={panelCls}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-amber-300">Construction</h3>
            <button className="rounded bg-stone-700 px-2 py-1 text-xs" onClick={() => setPanel(null)}>✕</button>
          </div>
          {(['defense', 'military', 'economy', 'magic'] as const).map((cat) => (
            <div key={cat} className="mb-2">
              <div className="mb-1 text-xs uppercase tracking-wide text-amber-400/80">{cat}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {BUILDINGS.filter((b) => b.category === cat).map((b) => {
                  const locked = !!b.unlockTech && !save.techs.includes(b.unlockTech);
                  return (
                    <button key={b.id} disabled={locked}
                      className={`rounded border border-amber-900/60 bg-stone-800/80 p-2 text-left ${locked ? 'opacity-50' : 'active:bg-stone-700'}`}
                      onClick={() => { setMode({ kind: 'place', defId: b.id }); setPanel(null); notify(`Placing ${b.name} — tap the map`); }}>
                      <div className="flex justify-between text-sm font-bold"><span>{b.name}</span><span className="text-amber-300">{b.cost}g</span></div>
                      <div className="text-[11px] text-amber-100/70">{b.desc}</div>
                      {locked && <div className="text-[10px] text-red-300">🔒 Locked</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {panel === 'presets' && (
        <div className={panelCls}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-amber-300">Quick Deployment Presets</h3>
            <button className="rounded bg-stone-700 px-2 py-1 text-xs" onClick={() => setPanel(null)}>✕</button>
          </div>
          <p className="mb-2 text-[11px] text-amber-100/70">Presets buy any missing troops first; they never create free units. Deployed at your keep.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => {
              const cost = p.list.reduce((s, e) => s + Math.max(0, e.n - (snap.reserves[e.id] || 0)) * g.unitCost(e.id), 0);
              const locked = p.list.some((e) => UNIT_MAP[e.id].unlockTech && !save.techs.includes(UNIT_MAP[e.id].unlockTech!));
              return (
                <button key={p.name} disabled={locked} className={`rounded border border-amber-900/60 bg-stone-800/80 p-2 text-left ${locked ? 'opacity-50' : ''}`}
                  onClick={() => {
                    const err = g.deployPreset(p.list, g.base.x + 120, g.base.y);
                    if (err) { notify(err); audio.play('error'); } else { notify(`${p.name} deployed`); g.focusBase(); }
                  }}>
                  <div className="flex justify-between text-sm font-bold"><span>{p.name}</span><span className="text-amber-300">{cost}g</span></div>
                  <div className="text-[11px] text-amber-100/70">{p.list.map((e) => `${UNIT_MAP[e.id].name}×${e.n}`).join(', ')}</div>
                  {locked && <div className="text-[10px] text-red-300">🔒 Requires research</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {panel === 'info' && snap.selected && (
        <div className={panelCls}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-bold text-amber-300">{snap.selected.name} <span className="text-xs">Lv{snap.selected.level}</span></h3>
            <button className="rounded bg-stone-700 px-2 py-1 text-xs" onClick={() => setPanel(null)}>✕</button>
          </div>
          <div className="text-xs text-amber-100/80">{snap.selected.info}</div>
          <div className="my-2 h-2 w-full rounded bg-stone-700">
            <div className="h-2 rounded bg-emerald-500" style={{ width: `${(snap.selected.hp / snap.selected.max) * 100}%` }} />
          </div>
          <div className="text-xs">HP {snap.selected.hp}/{snap.selected.max}</div>
          {snap.selected.kind === 'building' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btn + ' text-xs'} onClick={() => { const e = g.upgradeSelected(); notify(e || 'Upgraded'); }}>⬆ Upgrade</button>
              <button className={btn + ' text-xs'} onClick={() => { const e = g.repairSelected(); notify(e || 'Repaired'); }}>🔧 Repair</button>
              <button className={btn + ' text-xs'} onClick={() => { const e = g.sellSelected(); notify(e || 'Demolished'); setPanel(null); }}>💰 Sell</button>
            </div>
          )}
          {snap.selected.kind === 'unit' && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={btn + ' text-xs'} onClick={() => g.command('hold')}>✋ Hold</button>
              <button className={btn + ' text-xs'} onClick={() => g.command('resume')}>➡ Resume</button>
              <button className={btn + ' text-xs'} onClick={() => g.command('retreat')}>🏳 Retreat</button>
            </div>
          )}
        </div>
      )}

      {/* prep overlay: next wave */}
      {snap.phase === 'prep' && (
        <div className="absolute bottom-16 right-2 w-56 rounded-lg border-2 border-amber-900/80 bg-stone-900/90 p-2 text-[11px] text-amber-100 shadow-lg">
          <div className="font-bold text-amber-300">Next Wave {snap.wave + 1}</div>
          {snap.nextWave.map((n) => <div key={n.name}>• {n.name} ×{n.count}</div>)}
          <div className="mt-1 text-amber-200/60">Difficulty: {DIFFICULTY[difficulty].label}</div>
          <div className="text-amber-200/60">Survival bonus: {mission.survivalBonusPct}% of kill gold</div>
        </div>
      )}

      {finished && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-950/85 p-4">
          <div className="w-full max-w-md rounded-xl border-4 border-amber-700 bg-stone-900 p-5 text-center text-amber-100 shadow-2xl">
            <h2 className={`mb-2 text-2xl font-black ${finished === 'victory' ? 'text-emerald-400' : 'text-red-400'}`}>
              {finished === 'victory' ? '⚜ VICTORY ⚜' : '☠ THE KEEP HAS FALLEN ☠'}
            </h2>
            <p className="mb-3 text-sm text-amber-200/80">
              {finished === 'victory'
                ? `You held ${mission.name} through ${snap.wave} waves.`
                : `The enemy broke through on wave ${snap.wave}. Gold earned from kills is kept.`}
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <Stat label="Kill gold" value={`${snap.killGold}g`} />
              <Stat label="Enemies slain" value={snap.killCount} />
              <Stat label="Troops lost" value={snap.lostUnits} />
              <Stat label="Waves" value={`${snap.wave}/${mission.waves === 9999 ? '∞' : mission.waves}`} />
              {finished === 'victory' && <Stat label="Stage reward" value={`${mission.reward}g`} />}
              {finished === 'victory' && <Stat label={`Survival +${mission.survivalBonusPct}%`} value={`${Math.round(snap.killGold * mission.survivalBonusPct / 100)}g`} />}
            </div>
            <button className="w-full rounded-md border-2 border-amber-500 bg-amber-600 px-4 py-3 font-bold text-stone-900" onClick={onExit}>
              Return to the Kingdom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-amber-900/60 bg-stone-800 px-2 py-1">
      <div className="text-[10px] uppercase text-amber-300/70">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}

export { ENEMY_MAP };
