import { sys } from 'cc';

/* --------------------------------- types -------------------------------- */

export type OpKind = 'add' | 'mul' | 'sub' | 'div';

export interface Op { kind: OpKind; value: number; }

export type LevelEvent =
    | { t: 'gate'; d: number; left: Op; right: Op }
    | { t: 'enemy'; d: number; count: number; strength: number; boss?: boolean }
    | { t: 'coins'; d: number; n: number; pattern: 'line' | 'arc' | 'diamond' | 'circle'; x: number }
    | { t: 'spikes'; d: number; gapX: number }
    | { t: 'spinner'; d: number };

export interface LevelDef {
    id: number;
    length: number;
    events: LevelEvent[];
}

export interface SaveProgress {
    coins: number;
    level: number;
    units: number;
    income: number;
    skin: number;
    ownedSkins: number[];
    best: number;
    muted: boolean;
}
export interface ManualSave { savedAt: number; progress: SaveProgress; }
export interface SaveData extends SaveProgress {
    savedAt?: number;
    manualSlots?: (ManualSave | null)[];
    recoverySave?: ManualSave | null;
}

export const CREATOR = {
    name: 'phdsx',
    homepage: 'https://github.com/phdsx/minigame/tree/main/%E5%B0%8F%E5%85%B5%E6%88%98%E4%BA%89',
} as const;

/* -------------------------------- strings -------------------------------- */

export const T = {
    title: '小兵战争',
    subtitle: '集结队伍，突破重围',
    tapToStart: '点击开始',
    moveHint: '拖动屏幕 / A·D 左右移动',
    level: (n: number) => `第 ${n} 关`,
    coins: '金币',
    upgrade: '升级',
    play: '开始游戏',
    resume: '继续游戏',
    retry: '重新开始',
    nextLevel: '下一关',
    backMenu: '返回主菜单',
    win: '过关！',
    lose: '全军覆没',
    winReward: '本关获得',
    bonus: '关卡奖励',
    noAdsDouble: '奖励已计入金币',
    claim: '领取',
    revive: '原地复活',
    reviveCost: (n: number) => `${n} 金币 · 带 30 名士兵继续`,
    notEnough: '金币不足',
    boss: 'BOSS',
    unitsUpgrade: '起始兵力',
    incomeUpgrade: '金币收益',
    lvlShort: (n: number) => `Lv.${n}`,
    max: '已满级',
    price: (n: number) => `${n}`,
    skins: '皮肤',
    skinNames: ['蓝色小兵', '黄金战士', '暗夜忍者'],
    skinDesc: ['初始皮肤', '全身金甲，登场更亮眼', '暗紫涂装，杀气十足'],
    owned: '已拥有',
    buy: '购买',
    equip: '使用',
    equipped: '使用中',
    locked: '未解锁',
    settings: '设置',
    sound: '音效',
    save: '保存进度',
    saved: '进度已保存',
    saveFailed: '保存失败，请检查浏览器权限',
    on: '开',
    off: '关',
    close: '关闭',
    tutorialGate: '选择数值更高的门！',
    progress: '进度',
    kill: '击败',
} as const;

/* ------------------------------ number format ---------------------------- */

export function fmt(n: number): string {
    const v = Math.max(0, Math.round(n));
    if (v >= 100000000) return (v / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
    if (v >= 10000) return (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return String(v);
}

export function opLabel(op: Op): string {
    switch (op.kind) {
        case 'add': return `+${op.value}`;
        case 'sub': return `-${op.value}`;
        case 'mul': return `×${op.value}`;
        case 'div': return `÷${op.value}`;
    }
}

export function applyOp(count: number, op: Op): number {
    switch (op.kind) {
        case 'add': return count + op.value;
        case 'sub': return Math.max(0, count - op.value);
        case 'mul': return count * op.value;
        case 'div': return Math.floor(count / Math.max(1, op.value));
    }
}

/* -------------------------------- levels -------------------------------- */

/** Deterministic RNG so a level always looks the same. */
function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function gate(d: number, left: Op, right: Op): LevelEvent { return { t: 'gate', d, left, right }; }
function enemy(d: number, count: number, strength: number, boss = false): LevelEvent {
    return { t: 'enemy', d, count, strength, boss };
}
function coins(d: number, n: number, pattern: 'line' | 'arc' | 'diamond' | 'circle', x = 0): LevelEvent {
    return { t: 'coins', d, n, pattern, x };
}

function buildLevel(id: number): LevelDef {
    const r = rng(id * 7919 + 13);
    const strength = 1.15 + Math.min(0.55, id * 0.022);
    const events: LevelEvent[] = [];
    let d = 28;

    const gatePairAt = (prevBase: number, idx: number): number => {
        // escalate the numbers so the crowd can snowball like the original
        const base = Math.max(4, Math.round(prevBase * (1.35 + r() * 0.5) + 2 + idx));
        const mulChance = id >= 3 ? 0.5 : 0.25;
        const mix = r();
        let left: Op, right: Op;
        if (mix < mulChance) {
            left = { kind: 'add', value: Math.max(3, Math.round(base * 0.7)) };
            right = { kind: 'mul', value: 2 };
        } else if (mix < mulChance + 0.3) {
            left = { kind: 'sub', value: Math.round(base * 0.6) };
            right = { kind: 'add', value: Math.round(base * 1.1) };
        } else {
            left = { kind: 'add', value: base };
            right = { kind: 'add', value: Math.round(base * (1.15 + r() * 0.5)) };
        }
        events.push(gate(d, left, right));
        d += 20 + r() * 5;
        return base;
    };

    let base = Math.round(4 + id * 1.6);
    // two "grow" clusters, each followed by one fight
    for (let cluster = 0; cluster < 2; cluster++) {
        base = gatePairAt(base, 0);
        events.push(coins(d, 5 + Math.floor(r() * 5), r() < 0.5 ? 'line' : 'arc', (r() - 0.5) * 2));
        d += 12;
        base = gatePairAt(base, 1);
        events.push(coins(d, 6 + Math.floor(r() * 5), 'diamond', 0));
        d += 14;

        if (id >= 2 && cluster === 1) {
            events.push({ t: 'spikes', d, gapX: (r() - 0.5) * 2.2 });
            d += 18;
        }
        if (id >= 4 && cluster === 1 && id % 2 === 0) {
            events.push({ t: 'spinner', d });
            d += 16;
        }

        const squadCount = Math.round(6 + id * 3.2 + r() * (3 + id * 0.9));
        events.push(enemy(d, squadCount, strength));
        d += 24;
    }

    // final stretch: one last gate pair, then the boss or the final squad
    base = gatePairAt(base, 2);
    events.push(coins(d, 10, 'diamond', 0));
    d += 18;

    if (id % 5 === 0) {
        events.push(enemy(d, 1, 20 + id * 3, true));
    } else {
        events.push(enemy(d, Math.round(8 + id * 4 + r() * 5), strength));
    }
    d += 26;
    events.push(coins(d, 12, 'circle', 0));
    d += 16;

    return { id, length: d + 12, events: events.sort((a, b) => a.d - b.d) };
}

const levelCache = new Map<number, LevelDef>();
export function getLevel(id: number): LevelDef {
    const key = Math.max(1, id);
    if (!levelCache.has(key)) levelCache.set(key, buildLevel(key));
    return levelCache.get(key)!;
}

/* ------------------------------- upgrades ------------------------------- */

export interface UpgradeDef { key: 'units' | 'income'; name: string; max: number; base: number; growth: number; }

export const UPGRADES: UpgradeDef[] = [
    { key: 'units', name: T.unitsUpgrade, max: 12, base: 120, growth: 1.65 },
    { key: 'income', name: T.incomeUpgrade, max: 10, base: 160, growth: 1.7 },
];

export const SKIN_PRICES = [0, 800, 2000];
export const SKIN_COLORS = ['#3FA9F5', '#E8B23A', '#7C5CE0'];

export function upgradePrice(def: UpgradeDef, level: number): number {
    return Math.round(def.base * Math.pow(def.growth, level));
}

/* --------------------------------- save --------------------------------- */

const SAVE_KEY = 'xiaobing.save.v1';

export function defaultSave(): SaveData {
    return { coins: 0, level: 1, units: 0, income: 0, skin: 0, ownedSkins: [0], best: 1, muted: false, manualSlots:[null,null,null],recoverySave:null };
}

const integer = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;

function progressOf(d: any): SaveProgress {
    const base=defaultSave(),skin=integer(d.skin,0,0,SKIN_PRICES.length-1);
    const owned=Array.isArray(d.ownedSkins)?d.ownedSkins.filter((i:unknown)=>typeof i==='number' && Number.isInteger(i) && i>=0 && i<SKIN_PRICES.length):[];
    return { coins:integer(d.coins,base.coins,0,Number.MAX_SAFE_INTEGER),level:integer(d.level,base.level,1,999),
        units:integer(d.units,base.units,0,12),income:integer(d.income,base.income,0,10),skin,
        ownedSkins:Array.from(new Set([0,skin,...owned])) as number[],best:integer(d.best,base.best,1,999),muted:d.muted===true };
}

function manualOf(value: any): ManualSave | null {
    if(!value || !Number.isFinite(value.savedAt) || value.savedAt<=0 || value.savedAt>8640000000000000)return null;
    const p=value.progress;
    if(!p || typeof p!=='object' || !Number.isInteger(p.level) || p.level<1 || p.level>999 || !Number.isSafeInteger(p.coins) || p.coins<0)return null;
    return {savedAt:value.savedAt,progress:progressOf(p)};
}

export function manualSlots(save: SaveData): (ManualSave | null)[] {
    return Array.from({length:3},(_,i)=>manualOf(save.manualSlots?.[i]));
}

/** Snapshots contain progression only, never other slots or recursive backups. */
export function saveManualSlot(save: SaveData, index: number): boolean {
    if(!Number.isInteger(index) || index<0 || index>=3)return false;
    const slots=manualSlots(save);slots[index]={savedAt:Date.now(),progress:progressOf(save)};
    const next={...save,manualSlots:slots};
    if(!storeSave(next))return false;
    Object.assign(save,next);return true;
}

function restoreProgress(save: SaveData, snapshot: ManualSave | null): boolean {
    if(!snapshot)return false;
    const next:SaveData={...progressOf(snapshot.progress),savedAt:save.savedAt,manualSlots:manualSlots(save),
        recoverySave:{savedAt:Date.now(),progress:progressOf(save)}};
    if(!storeSave(next))return false;
    Object.assign(save,next);return true;
}

export function loadManualSlot(save: SaveData, index: number): boolean {
    return Number.isInteger(index) && index>=0 && index<3 && restoreProgress(save,manualSlots(save)[index]);
}

export function restoreBeforeLoad(save: SaveData): boolean {
    return restoreProgress(save,manualOf(save.recoverySave));
}

export function loadSave(): SaveData {
    try {
        let localRaw: string | null = null;
        try { localRaw = sys.localStorage.getItem(SAVE_KEY); } catch { /* disk backup can still recover */ }
        let local: any = null, disk: any = null;
        try { if (localRaw) local = JSON.parse(localRaw); } catch { /* recover from disk */ }
        try {
            if (typeof XMLHttpRequest !== 'undefined' && typeof location !== 'undefined' && location.protocol.startsWith('http')) {
                const req = new XMLHttpRequest(); req.open('GET', '/__save', false); req.send();
                if (req.status === 200) disk = JSON.parse(req.responseText);
            }
        } catch { /* browser-only storage remains usable */ }
        const d = disk && (!local || (disk.savedAt || 0) > (local.savedAt || 0)) ? disk : local;
        if (!d || typeof d !== 'object') return defaultSave();
        return {
            ...progressOf(d),manualSlots:manualSlots(d),recoverySave:manualOf(d.recoverySave),
            savedAt: integer(d.savedAt, 0, 0, Number.MAX_SAFE_INTEGER),
        };
    } catch {
        return defaultSave();
    }
}

export function storeSave(s: SaveData): boolean {
    s.savedAt = Math.max(Date.now(), (s.savedAt || 0) + 1);
    const raw = JSON.stringify(s);
    let saved = false;
    try { sys.localStorage.setItem(SAVE_KEY, raw); saved = true; } catch { /* try local server */ }
    try {
        if (typeof XMLHttpRequest !== 'undefined' && typeof location !== 'undefined' && location.protocol.startsWith('http')) {
            const req = new XMLHttpRequest(); req.open('POST', '/__save', false);
            req.setRequestHeader('Content-Type', 'application/json'); req.send(raw);
            saved = saved || (req.status >= 200 && req.status < 300);
        }
    } catch { /* browser-only storage remains usable */ }
    return saved;
}
