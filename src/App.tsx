import { useEffect, useMemo, useState } from 'react';
import Battle from './ui/Battle';
import {
  MISSIONS, ENDLESS, TECHS, TERRITORIES, UNITS, DIFFICULTY,
  type Difficulty, type MissionDef,
} from './game/data';
import { defaultSave, loadSlot, saveSlot, deleteSlot, listSlots, grantReward, type SaveData } from './game/save';
import { audio } from './game/audio';

type Screen = 'title' | 'slots' | 'campaign' | 'research' | 'barracks' | 'territory' | 'settings' | 'battle';

const frame = 'rounded-xl border-4 border-amber-800/80 bg-stone-900/90 shadow-[0_0_0_2px_#1c1917_inset]';
const btn = 'rounded-lg border-2 border-amber-700 bg-gradient-to-b from-amber-600 to-amber-800 px-4 py-3 font-bold text-stone-950 shadow active:translate-y-px disabled:opacity-40 disabled:grayscale';
const btn2 = 'rounded-lg border-2 border-amber-900/70 bg-gradient-to-b from-stone-700 to-stone-800 px-4 py-2 font-semibold text-amber-100 active:translate-y-px disabled:opacity-40';

export default function App() {
  const [screen, _setScreen] = useState<Screen>('title');
  const [prev, setPrev] = useState<Screen>('title');
  const setScreen = (next: Screen) => { _setScreen((cur) => { setPrev(cur); return next; }); };
  const [save, setSave] = useState<SaveData | null>(null);
  const [mission, setMission] = useState<MissionDef | null>(null);
  const [slots, setSlots] = useState(() => listSlots());
  const [toast, setToast] = useState<string | null>(null);

  const notify = (m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 2200); };

  useEffect(() => { audio.init(); }, []);
  useEffect(() => {
    if (save) audio.setVolumes(save.settings.music, save.settings.sfx);
  }, [save?.settings.music, save?.settings.sfx]);
  useEffect(() => { if (screen !== 'battle') audio.setMood('menu'); }, [screen]);

  const persist = (s: SaveData) => { setSave(s); saveSlot(s); setSlots(listSlots()); };

  const startSlot = (slot: number, fresh = false) => {
    const data = fresh ? defaultSave(slot) : loadSlot(slot) || defaultSave(slot);
    saveSlot(data);
    setSave(data); setSlots(listSlots()); setScreen('campaign');
    audio.init(); audio.resume();
  };

  const finish = (result: 'victory' | 'defeat', killGold: number, wave: number, optionalDone: string[]) => {
    if (!save || !mission) return;
    let s: SaveData = { ...save, gold: save.gold + killGold };
    let msg = `Kept ${killGold}g earned from kills.`;
    if (result === 'victory') {
      const bonus = Math.round(killGold * mission.survivalBonusPct / 100);
      s.gold += bonus;
      msg += ` Survival bonus +${bonus}g.`;
      if (mission.id !== 'endless') {
        const r = grantReward(s, `stage:${mission.id}`, mission.reward);
        s = r.save;
        if (r.granted) msg += ` Stage reward +${r.granted}g.`;
        if (!s.completedMissions.includes(mission.id)) s.completedMissions = [...s.completedMissions, mission.id];
        if (!s.territories.includes(mission.territory)) {
          s.territories = [...s.territories, mission.territory];
          msg += ` ${TERRITORIES.find((t) => t.id === mission.territory)?.name} conquered!`;
        }
        const income = s.territories.reduce((a, id) => a + (TERRITORIES.find((t) => t.id === id)?.income || 0), 0);
        if (income) { s.gold += income; msg += ` Territory income +${income}g.`; }
        optionalDone.forEach((o) => {
          const r2 = grantReward(s, `opt:${mission.id}:${o}`, 120);
          s = r2.save;
          if (r2.granted) msg += ` Optional objective +120g.`;
        });
      }
    }
    if (mission.id === 'endless' && wave > s.endlessBest) s.endlessBest = wave;
    persist(s);
    notify(msg);
  };

  if (screen === 'battle' && save && mission) {
    return (
      <div className="fixed inset-0 bg-stone-950">
        <Battle mission={mission} difficulty={save.difficulty} save={save}
          onExit={() => { setScreen('campaign'); persist({ ...save }); }}
          onFinish={finish} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_30%_20%,#3a3024,#17140f_70%)] p-3 text-amber-100">
      <div className="mx-auto max-w-5xl">
        {toast && (
          <div className="fixed left-1/2 top-3 z-50 w-[92%] max-w-xl -translate-x-1/2 rounded-lg border-2 border-amber-600 bg-stone-900/95 px-4 py-2 text-center text-sm shadow-xl">
            {toast}
          </div>
        )}

        {screen === 'title' && (
          <div className="flex min-h-[90vh] flex-col items-center justify-center gap-6 text-center">
            <div>
              <h1 className="text-5xl font-black tracking-tight text-amber-400 drop-shadow-[0_3px_0_#5a3a10]">KINGDOMFALL</h1>
              <p className="mt-1 text-sm uppercase tracking-[0.3em] text-amber-200/70">Medieval Kingdom Defense</p>
            </div>
            <div className={frame + ' w-full max-w-sm p-5'}>
              <div className="flex flex-col gap-3">
                <button className={btn} onClick={() => { audio.init(); audio.resume(); setScreen('slots'); }}>⚔ Play</button>
                <button className={btn2} onClick={() => { const s = loadSlot(0) || defaultSave(0); setSave(s); setScreen('settings'); }}>⚙ Settings</button>
              </div>
              <p className="mt-4 text-xs text-amber-200/60">
                Landscape recommended · fully offline · touch controls: drag to pan, pinch to zoom.
              </p>
            </div>
          </div>
        )}

        {screen === 'slots' && (
          <Section title="Choose a Realm" onBack={() => setScreen('title')}>
            <div className="grid gap-3 sm:grid-cols-3">
              {slots.map(({ slot, data }) => (
                <div key={slot} className={frame + ' p-4'}>
                  <div className="font-bold text-amber-300">Slot {slot + 1}</div>
                  {data ? (
                    <>
                      <div className="text-xs text-amber-200/70">{data.name}</div>
                      <div className="mt-1 text-xs">🪙 {data.gold} · {data.completedMissions.length}/{MISSIONS.length} missions</div>
                      <div className="text-xs">Territories: {data.territories.length} · Techs: {data.techs.length}</div>
                      <div className="text-[10px] text-amber-200/50">{new Date(data.updated).toLocaleString()}</div>
                      <div className="mt-3 flex gap-2">
                        <button className={btn + ' flex-1 py-2 text-sm'} onClick={() => startSlot(slot)}>Continue</button>
                        <button className={btn2 + ' text-sm'} onClick={() => { deleteSlot(slot); setSlots(listSlots()); notify('Slot erased'); }}>🗑</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mt-2 text-xs text-amber-200/60">Empty slot</div>
                      <button className={btn + ' mt-3 w-full py-2 text-sm'} onClick={() => startSlot(slot, true)}>New Kingdom</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {screen === 'campaign' && save && (
          <Section title="The Kingdom" onBack={() => setScreen('slots')}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={frame + ' px-3 py-1.5 font-bold text-amber-300'}>🪙 {save.gold}</span>
              <span className={frame + ' px-3 py-1.5'}>🏳 {save.territories.length} territories</span>
              <span className={frame + ' px-3 py-1.5'}>🏆 Endless best: wave {save.endlessBest}</span>
              <div className="ml-auto flex gap-2">
                <button className={btn2} onClick={() => setScreen('research')}>🔬 Research</button>
                <button className={btn2} onClick={() => setScreen('barracks')}>🛡 Barracks</button>
                <button className={btn2} onClick={() => setScreen('territory')}>🗺 Territory</button>
                <button className={btn2} onClick={() => setScreen('settings')}>⚙</button>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-amber-200/70">Difficulty:</span>
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                <button key={d} className={`rounded border-2 px-3 py-1 ${save.difficulty === d ? 'border-amber-500 bg-amber-600 text-stone-900' : 'border-amber-900/70 bg-stone-800'}`}
                  onClick={() => persist({ ...save, difficulty: d })}>{DIFFICULTY[d].label}</button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {MISSIONS.map((m, i) => {
                const done = save.completedMissions.includes(m.id);
                const locked = i > 0 && !save.completedMissions.includes(MISSIONS[i - 1].id);
                return (
                  <div key={m.id} className={frame + ' p-4 ' + (locked ? 'opacity-50' : '')}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-amber-300">{i + 1}. {m.name}</h3>
                      {done && <span className="text-xs text-emerald-400">✔ Completed</span>}
                    </div>
                    <div className="text-xs text-amber-200/70">{m.region} · {m.biome} · {m.waves} waves · {m.lanes} lanes</div>
                    <p className="mt-1 text-sm">{m.desc}</p>
                    <ul className="mt-1 text-[11px] text-amber-200/70">
                      {m.objectives.map((o) => <li key={o.id}>• {o.text}{o.optional ? ' (optional)' : ''}</li>)}
                    </ul>
                    <div className="mt-1 text-[11px] text-amber-300/80">Reward {m.reward}g + {m.survivalBonusPct}% survival bonus</div>
                    <button disabled={locked} className={btn + ' mt-3 w-full py-2 text-sm'}
                      onClick={() => { setMission(m); setScreen('battle'); }}>
                      {locked ? '🔒 Locked' : done ? 'Replay (no duplicate rewards)' : 'March to battle'}
                    </button>
                  </div>
                );
              })}
              <div className={frame + ' border-purple-800/80 p-4'}>
                <h3 className="font-bold text-purple-300">∞ Endless Siege</h3>
                <p className="mt-1 text-sm">Survive endless escalating waves. Kill gold and a 10% survival bonus are always kept.</p>
                <button className={btn + ' mt-3 w-full py-2 text-sm'} onClick={() => { setMission(ENDLESS); setScreen('battle'); }}>Begin the siege</button>
              </div>
            </div>
          </Section>
        )}

        {screen === 'research' && save && <Research save={save} persist={persist} onBack={() => setScreen('campaign')} notify={notify} />}
        {screen === 'barracks' && save && <Barracks save={save} persist={persist} onBack={() => setScreen('campaign')} notify={notify} />}
        {screen === 'territory' && save && <Territory save={save} onBack={() => setScreen('campaign')} />}
        {screen === 'settings' && save && <Settings save={save} persist={persist} onBack={() => setScreen(prev === 'battle' ? 'campaign' : prev)} />}
      </div>
    </div>
  );
}

function Section({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="mb-3 flex items-center gap-3">
        <button className={btn2 + ' px-3 py-1.5'} onClick={onBack}>← Back</button>
        <h2 className="text-2xl font-black text-amber-400">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Research({ save, persist, onBack, notify }: { save: SaveData; persist: (s: SaveData) => void; onBack: () => void; notify: (m: string) => void }) {
  const branches = ['military', 'defense', 'economy', 'magic'] as const;
  return (
    <Section title="Kingdom Research" onBack={onBack}>
      <div className="mb-3 text-sm">🪙 {save.gold}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {branches.map((b) => (
          <div key={b} className={frame + ' p-3'}>
            <h3 className="mb-2 font-bold capitalize text-amber-300">{b}</h3>
            {TECHS.filter((t) => t.branch === b).map((t) => {
              const owned = save.techs.includes(t.id);
              const ready = t.requires.every((r) => save.techs.includes(r));
              return (
                <div key={t.id} className={`mb-2 rounded border border-amber-900/60 bg-stone-800/70 p-2 ${!ready && !owned ? 'opacity-50' : ''}`}>
                  <div className="flex justify-between text-sm font-bold"><span>{t.name}</span><span className="text-amber-300">{owned ? '✔' : `${t.cost}g`}</span></div>
                  <div className="text-[11px] text-amber-100/70">{t.desc}</div>
                  {!ready && !owned && <div className="text-[10px] text-red-300">Requires: {t.requires.map((r) => TECHS.find((x) => x.id === r)?.name).join(', ')}</div>}
                  {!owned && (
                    <button disabled={!ready || save.gold < t.cost} className={btn + ' mt-1 w-full py-1 text-xs'}
                      onClick={() => {
                        if (save.techs.includes(t.id)) return;
                        persist({ ...save, gold: save.gold - t.cost, techs: [...save.techs, t.id] });
                        audio.play('build'); notify(`${t.name} researched`);
                      }}>Research</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Section>
  );
}

function Barracks({ save, persist, onBack, notify }: { save: SaveData; persist: (s: SaveData) => void; onBack: () => void; notify: (m: string) => void }) {
  return (
    <Section title="Barracks — Permanent Unit Upgrades" onBack={onBack}>
      <div className="mb-3 text-sm">🪙 {save.gold} · Units also level up from battlefield experience.</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {UNITS.map((u) => {
          const lvl = save.unitLevels[u.id] || 1;
          const xp = save.unitXp[u.id] || 0;
          const cost = Math.round(u.cost * 2.2 * Math.pow(1.5, lvl - 1));
          const locked = !!u.unlockTech && !save.techs.includes(u.unlockTech);
          return (
            <div key={u.id} className={frame + ' p-3 ' + (locked ? 'opacity-50' : '')}>
              <div className="flex justify-between font-bold"><span>{u.name}</span><span className="text-amber-300">Lv {lvl}</span></div>
              <div className="text-[11px] text-amber-100/70">{u.desc}</div>
              <div className="mt-1 text-[11px]">HP {Math.round(u.hp * (1 + (lvl - 1) * 0.12))} · DMG {Math.round(u.dmg * (1 + (lvl - 1) * 0.12))} · XP {xp}/{lvl * 25}</div>
              <button disabled={locked || save.gold < cost || lvl >= 10} className={btn + ' mt-2 w-full py-1 text-xs'}
                onClick={() => {
                  persist({ ...save, gold: save.gold - cost, unitLevels: { ...save.unitLevels, [u.id]: lvl + 1 } });
                  notify(`${u.name} upgraded to level ${lvl + 1}`);
                }}>
                {lvl >= 10 ? 'Max level' : locked ? '🔒 Requires research' : `Upgrade — ${cost}g`}
              </button>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function Territory({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const income = useMemo(() => save.territories.reduce((a, id) => a + (TERRITORIES.find((t) => t.id === id)?.income || 0), 0), [save.territories]);
  return (
    <Section title="Strategic Map" onBack={onBack}>
      <div className={frame + ' relative h-[60vh] overflow-hidden p-0'}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,#3d5a2d,#22301b)]" />
        {TERRITORIES.map((t) => {
          const owned = save.territories.includes(t.id);
          return (
            <div key={t.id} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${t.x}%`, top: `${t.y}%` }}>
              <div className={`h-6 w-6 rounded-full border-2 ${owned ? 'border-amber-300 bg-amber-500' : 'border-stone-500 bg-stone-700'}`} />
              <div className={`mt-1 text-[11px] font-bold ${owned ? 'text-amber-200' : 'text-stone-400'}`}>{t.name}</div>
              <div className="text-[10px] text-amber-300/80">{owned ? `+${t.income}g / victory` : 'unclaimed'}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-sm">Total territory income: <span className="font-bold text-amber-300">{income}g</span> paid after each campaign victory. Territory is only granted when a mission is actually won.</div>
    </Section>
  );
}

function Settings({ save, persist, onBack }: { save: SaveData; persist: (s: SaveData) => void; onBack: () => void }) {
  const set = (k: string, v: any) => persist({ ...save, settings: { ...save.settings, [k]: v } });
  const colors = ['#b02a2a', '#2f5f9b', '#6a2f8b', '#2f8b4f', '#b8962f'];
  return (
    <Section title="Settings" onBack={onBack}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={frame + ' p-4'}>
          <h3 className="mb-2 font-bold text-amber-300">Audio</h3>
          <label className="block text-sm">Music {Math.round(save.settings.music * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={save.settings.music} className="w-full"
              onChange={(e) => set('music', +e.target.value)} />
          </label>
          <label className="block text-sm">Sound effects {Math.round(save.settings.sfx * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={save.settings.sfx} className="w-full"
              onChange={(e) => set('sfx', +e.target.value)} />
          </label>
        </div>
        <div className={frame + ' p-4'}>
          <h3 className="mb-2 font-bold text-amber-300">Kingdom Colours (cosmetic only)</h3>
          <div className="flex gap-2">
            {colors.map((c) => (
              <button key={c} onClick={() => persist({ ...save, cosmetics: { ...save.cosmetics, color: c } })}
                className={`h-10 w-10 rounded border-2 ${save.cosmetics.color === c ? 'border-amber-300' : 'border-stone-600'}`} style={{ background: c }} />
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={save.settings.showFx} onChange={(e) => set('showFx', e.target.checked)} />
            Battlefield visual effects
          </label>
        </div>
      </div>
      <p className="mt-3 text-xs text-amber-200/60">
        All progress is stored locally in this device's browser storage. The game requires no internet connection.
      </p>
    </Section>
  );
}
