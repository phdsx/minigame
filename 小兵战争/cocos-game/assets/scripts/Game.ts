import {
    Node, Camera, Vec3, Color, view, ResolutionPolicy, director, input, Input,
    EventTouch, EventKeyboard, KeyCode, Layers, MeshRenderer, gfx, math, sys, resources, AudioClip, AudioSource,
} from 'cc';
import * as Art from './Art';
import { Squad } from './Squad';
import { World } from './World';
import { UI, UiHandlers } from './UI';
import {
    T, SaveData, loadSave, storeSave, getLevel, LevelDef, fmt, applyOp,
    UPGRADES, upgradePrice, SKIN_PRICES, SKIN_COLORS, LevelEvent,
    saveManualSlot, loadManualSlot, restoreBeforeLoad, CREATOR,
} from './Data';
import { c } from './UI';
import { FINISH, stairFront, towerGroups } from './Finish';

type State = 'menu' | 'playing' | 'battle' | 'bonus' | 'win' | 'lose';

interface EnemyPlan { z: number; count: number; strength: number; boss: boolean; spawned: boolean; }
interface EnemyState {
    squad: Squad; count: number; strength: number; boss: boolean;
    z: number; cost: number; engaged: boolean;
}

/** Tiny WebAudio blips — no audio assets needed. */
class Sfx {
    private ctx: AudioContext | null = null;
    private nativeSource: AudioSource | null = null;
    private nativeClips = new Map<string, AudioClip>();
    muted = false;
    init(node: Node) {
        if (!sys.isNative) return;
        this.nativeSource = node.addComponent(AudioSource);
        resources.loadDir('audio', AudioClip, (err, clips) => {
            if (err) { console.warn('Audio preload failed', err); return; }
            clips.forEach(clip => this.nativeClips.set(clip.name, clip));
        });
    }
    private ensure(): AudioContext | null {
        if (this.muted) return null;
        if (!this.ctx) {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        if (this.ctx!.state === 'suspended') this.ctx!.resume();
        return this.ctx;
    }
    blip(freq: number, dur = 0.08, type: OscillatorType = 'sine', gain = 0.05) {
        if (sys.isNative) {
            if (this.muted) return;
            const clip = this.nativeClips.get(`tone-${freq}-${type}-${Math.round(dur*1000)}`);
            if (clip && this.nativeSource) this.nativeSource.playOneShot(clip, Math.min(1, gain/0.05));
            return;
        }
        const ctx = this.ensure();
        if (!ctx) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.connect(g); g.connect(ctx.destination);
        const t = ctx.currentTime;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.02);
    }
    coin() { this.blip(1180, 0.07, 'triangle', 0.05); setTimeout(() => this.blip(1560, 0.06, 'triangle', 0.035), 40); }
    gateGood() { this.blip(520, 0.1, 'square', 0.04); setTimeout(() => this.blip(780, 0.1, 'square', 0.035), 70); }
    gateBad() { this.blip(220, 0.14, 'sawtooth', 0.045); }
    hit() { this.blip(140, 0.09, 'square', 0.05); }
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.05), i * 110)); }
    lose() { [400, 330, 260, 180].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.045), i * 130)); }
}

export class Game {
    private canvas: Node;
    private scene: Node;
    private cam: Camera = null!;
    private uiCam: Camera = null!;
    private world: World;
    private ui: UI = null!;
    private player: Squad = null!;
    private enemy: EnemyState | null = null;
    private fadingEnemies: Squad[] = [];
    private impactCooldown = 0;
    private sky: Node = null!;
    private save: SaveData = loadSave();
    private sfx = new Sfx();

    private state: State = 'menu';
    private level: LevelDef = getLevel(1);
    private enemyPlans: EnemyPlan[] = [];
    private z = 0;
    private x = 0;
    private targetX = 0;
    private speed = 7.6;
    private coinsRun = 0;
    private pendingDamage = 0;
    private battleT = 0;
    private battleDur = 1;
    private bonusStep = 0;
    private bonusWait = 0;
    private bonusDone = false;
    private bonusMultiplier = 1;
    private playerY = 0;
    private bonusPhase: 'gather' | 'climb' | 'chest' = 'gather';
    private cameraLookY = 0.5;
    private battleStartPlayer = 0;
    private battleStartEnemy = 0;
    private reviveCost = 150;
    private reviveClearEnemy = false;
    private keys = { left: false, right: false };
    private lastW = 0;
    private lastH = 0;

    constructor(canvas: Node) {
        this.canvas = canvas;
        this.scene = canvas.parent ?? director.getScene()!;
        this.world = new World(this.scene);
        this.sfx.muted = this.save.muted;
    }

    init() {
        if (!sys.isNative && typeof document !== 'undefined') {
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        }
        view.setDesignResolutionSize(1280, 720, ResolutionPolicy.FIXED_HEIGHT);
        this.sfx.init(this.canvas);
        const vs = view.getVisibleSize();
        this.lastW = vs.width; this.lastH = vs.height;
        this.setupCameras();
        this.buildSky();


        this.player = new Squad(this.scene, 'Player', { color: c(SKIN_COLORS[this.save.skin]) });
        this.player.setFacing(1);
        this.player.setPosition(0, 0, 0);
        this.player.setCount(1);

        this.ui = new UI(this.canvas, this.cam);
        this.ui.layout(vs.width, vs.height);
        this.ui.setCoins(this.save.coins);
        this.ui.setLevel(this.save.level);
        // preview world so the menu has a backdrop behind the panel
        this.world.build(getLevel(this.save.level));
        this.bindInput();
        this.showMenu();
    }

    /* ------------------------------ setup -------------------------------- */

    private setupCameras() {
        const camNode = this.scene.getChildByName('Main Camera') ?? this.scene.getChildByName('Camera');
        let camera = camNode ? camNode.getComponent(Camera) : null;
        if (!camNode) {
            const n = new Node('Main Camera');
            n.setParent(this.scene);
            camera = n.addComponent(Camera);
        }
        if (!camera) camera = camNode!.addComponent(Camera);
        camera.projection = Camera.ProjectionType.PERSPECTIVE;
        camera.fov = 50;
        camera.near = 0.2;
        camera.far = 600;
        camera.clearColor = new Color(188, 227, 243, 255);
        camera.clearFlags = gfx.ClearFlagBit.COLOR | gfx.ClearFlagBit.DEPTH | gfx.ClearFlagBit.STENCIL;
        camera.visibility = Layers.Enum.DEFAULT | Layers.Enum.IGNORE_RAYCAST;
        camera.priority = 0;
        this.cam = camera;
        camera.node.setPosition(0, 7.2, -9.5);
        camera.node.lookAt(new Vec3(0, 0.5, 6));

        const uiCamNode = this.canvas.getChildByName('UICamera') ?? this.canvas.getChildByName('Camera');
        let uiCam = uiCamNode ? uiCamNode.getComponent(Camera) : null;
        if (!uiCamNode) {
            const n = new Node('UICamera');
            n.layer = Layers.Enum.DEFAULT;
            n.setParent(this.canvas);
            n.setPosition(0, 0, 1000);
            uiCam = n.addComponent(Camera);
        }
        if (!uiCam) uiCam = uiCamNode!.addComponent(Camera);
        uiCam.projection = Camera.ProjectionType.ORTHO;
        uiCam.orthoHeight = 360;
        uiCam.near = 1;
        uiCam.far = 2000;
        uiCam.clearFlags = gfx.ClearFlagBit.DEPTH | gfx.ClearFlagBit.STENCIL;
        uiCam.visibility = Layers.Enum.UI_2D | Layers.Enum.UI_3D;
        uiCam.priority = 100;
        this.uiCam = uiCam;
        this.canvas.layer = Layers.Enum.UI_2D;
    }

    private buildSky() {
        this.sky = new Node('Sky');
        this.sky.layer = Layers.Enum.DEFAULT;
        this.sky.setParent(this.cam.node);
        this.sky.setPosition(0, 0, -500);
        // Track signs face -Z; the sky is viewed from +Z in camera space.
        this.sky.setRotationFromEuler(0,180,0);
        const mr = this.sky.addComponent(MeshRenderer);
        mr.mesh = Art.quadMesh(1, 1);
        mr.setMaterial(Art.unlitMaterial(new Color(255, 255, 255, 255), Art.skyTexture()), 0);
        this.resizeSky();
    }

    private resizeSky() {
        const vs = view.getVisibleSize();
        const aspect = vs.width / vs.height;
        const dist = 500;
        const hgt = 2 * dist * Math.tan(((this.cam.fov + 8) * Math.PI) / 360) * 1.15;
        const wid = hgt * aspect * 1.25;
        this.sky.setScale(wid, hgt, 1);
    }

    /* ------------------------------- input ------------------------------- */

    private onTouchMove = (e: EventTouch) => {
        const d = e.getDelta();
        const vs = view.getVisibleSize();
        const px = view.getVisibleSizeInPixel();
        this.targetX -= d.x * (vs.width / Math.max(1, px.width)) * 0.017;
        this.targetX = Math.max(-1.62, Math.min(1.62, this.targetX));
    };

    private onKeyDown = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT) this.keys.left = true;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this.keys.right = true;
        if (e.keyCode === KeyCode.SPACE && this.state === 'menu' && this.ui.mainMenuOpen) {
            this.ui.clearModal(); this.ui.setHint(false); this.startLevel(this.save.level);
        }
    };

    private onKeyUp = (e: EventKeyboard) => {
        if (e.keyCode === KeyCode.KEY_A || e.keyCode === KeyCode.ARROW_LEFT) this.keys.left = false;
        if (e.keyCode === KeyCode.KEY_D || e.keyCode === KeyCode.ARROW_RIGHT) this.keys.right = false;
    };

    private bindInput() {
        this.canvas.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    }

    dispose() {
        this.canvas.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
        this.fadingEnemies.forEach(s=>s.destroy());
    }

    /* ------------------------------ handlers ----------------------------- */

    private handlers(): UiHandlers {
        return {
            onPlay: () => { this.ui.clearModal(); this.ui.setHint(false); this.startLevel(this.save.level); },
            onNextLevel: () => {
                this.ui.clearModal();
                this.save.level = Math.min(999, this.level.id + 1);
                storeSave(this.save);
                this.startLevel(this.save.level);
            },
            onRetry: () => { this.ui.clearModal(); this.startLevel(this.level.id); },
            onRevive: () => {
                if (this.save.coins < this.reviveCost) { this.ui.showToast(T.notEnough); return; }
                this.save.coins -= this.reviveCost;
                storeSave(this.save);
                this.ui.clearModal();
                this.ui.setCoins(this.save.coins);
                if (this.enemy && this.reviveClearEnemy) { this.enemy.squad.destroy(); this.enemy = null; }
                this.reviveClearEnemy = false;
                this.player.setCount(30);
                this.player.setVisible(true);
                this.pendingDamage = 0;
                this.state = 'playing';
            },
            onMenu: () => { this.ui.clearModal(); this.showMenu(); },
            onBuyUpgrade: (key) => this.buyUpgrade(key),
            onSelectSkin: (i) => this.selectSkin(i),
            onSave: () => {
                const saved=storeSave(this.save);this.ui.showArchives(this.save,this.handlers());this.ui.showToast(saved?T.saved:T.saveFailed);
            },
            onArchives:()=>this.ui.showArchives(this.save,this.handlers()),
            onCredits:()=>this.ui.showCredits(this.handlers()),
            onSaveSlot:index=>{
                const saved=saveManualSlot(this.save,index);this.ui.showArchives(this.save,this.handlers());this.ui.showToast(saved?`存档 ${index+1} 已保存`:T.saveFailed);
            },
            onLoadSlot:index=>{
                if(!loadManualSlot(this.save,index)){this.ui.showToast('读取失败，原进度未更改');return;}
                this.sfx.muted=this.save.muted;this.startLevel(this.save.level);this.showMenu();this.ui.showToast('存档已读取');
            },
            onRecover:()=>{
                if(!restoreBeforeLoad(this.save)){this.ui.showToast('恢复失败，原进度未更改');return;}
                this.sfx.muted=this.save.muted;this.startLevel(this.save.level);this.showMenu();this.ui.showToast('已恢复读取前的进度');
            },
            onOpenCreator:()=>sys.openURL(CREATOR.homepage),
            onToggleSound: () => {
                this.save.muted = !this.save.muted;
                this.sfx.muted = this.save.muted;
                storeSave(this.save);
                this.ui.showMenu(this.save, this.handlers());
            },
        };
    }

    private showMenu() {
        this.state = 'menu';
        this.ui.clearModal();
        this.ui.showMenu(this.save, this.handlers());
        this.player.setVisible(false);
        this.ui.setHint(false);
        this.cam.node.setPosition(0, 7.2, -9.5);
        this.cam.node.lookAt(new Vec3(0, 0.5, 6));
    }

    private buyUpgrade(key: 'units' | 'income') {
        const def = UPGRADES.find(u => u.key === key)!;
        const lvl = this.save[key];
        if (lvl >= def.max) return;
        const price = upgradePrice(def, lvl);
        if (this.save.coins < price) { this.ui.showToast(T.notEnough); return; }
        this.save.coins -= price;
        this.save[key] = lvl + 1;
        storeSave(this.save);
        this.ui.setCoins(this.save.coins);
        this.sfx.gateGood();
        this.ui.showMenu(this.save, this.handlers());
    }

    private selectSkin(i: number) {
        if (this.save.ownedSkins.includes(i)) {
            this.save.skin = i;
        } else if (this.save.coins >= SKIN_PRICES[i]) {
            this.save.coins -= SKIN_PRICES[i];
            this.save.skin = i;
            this.save.ownedSkins.push(i);
            this.sfx.win();
        } else {
            this.ui.showToast(T.notEnough);
            return;
        }
        storeSave(this.save);
        this.ui.setCoins(this.save.coins);
        if (this.player) this.player.recolor(c(SKIN_COLORS[this.save.skin]));
        this.ui.showMenu(this.save, this.handlers());
    }

    /* -------------------------------- level ------------------------------ */

    private startLevel(id: number) {
        this.level = getLevel(id);
        this.world.build(this.level);
        this.z = 0; this.x = 0; this.targetX = 0; this.playerY = 0;
        this.cameraLookY = 0.5;
        this.bonusStep = 0; this.bonusWait = 0; this.bonusDone = false; this.bonusMultiplier = 1;
        this.coinsRun = 0; this.pendingDamage = 0; this.battleT = 0; this.reviveClearEnemy = false;
        if (this.enemy) { this.enemy.squad.destroy(); this.enemy = null; }
        this.fadingEnemies.forEach(s=>s.destroy());this.fadingEnemies.length=0;

        this.enemyPlans = this.level.events
            .filter(e => e.t === 'enemy')
            .map(e => ({
                z: (e as any).d, count: (e as any).count,
                strength: (e as any).strength, boss: !!(e as any).boss, spawned: false,
            }));

        if (this.player) this.player.destroy();
        this.player = new Squad(this.scene, 'Player', { color: c(SKIN_COLORS[this.save.skin]) });
        this.player.setFacing(1);
        this.player.setPosition(0, 0, 0);
        this.player.setCount(1 + this.save.units);

        this.state = 'playing';
        this.ui.setLevel(id);
        this.ui.setHint(id <= 1);
        this.ui.clearModal();
        this.sfx.gateGood();
        this.snapCamera();
    }

    private snapCamera() {
        this.cam.node.setPosition(this.x * 0.18, 7.2, this.z - 9.5);
        this.cam.node.lookAt(new Vec3(this.x * 0.35, this.playerY + 0.5, this.z + 6));
    }

    /* --------------------------------- loop ------------------------------ */

    update(dt: number) {
        const vs = view.getVisibleSize();
        if (Math.abs(vs.width - this.lastW) > 1 || Math.abs(vs.height - this.lastH) > 1) {
            this.lastW = vs.width; this.lastH = vs.height;
            this.ui.layout(vs.width, vs.height);
            this.resizeSky();
        }
        // Substep slow frames so collision checks remain bounded without
        // discarding ordinary frame time. Cap long stalls/background resumes.
        const elapsed = Math.max(0, Math.min(dt, 0.25));
        this.impactCooldown=Math.max(0,(this.impactCooldown||0)-elapsed);
        let remaining = elapsed;
        while (remaining > 0.000001) {
            const step = Math.min(remaining, 0.05);
            if (this.state === 'playing') this.tickPlaying(step);
            else if (this.state === 'battle') this.tickBattle(step);
            else if (this.state === 'bonus') this.tickBonus(step);
            remaining -= step;
        }

        const running = this.state === 'playing';
        const fighting = this.state === 'battle';
        if (this.player) {
            if (this.state === 'bonus' || (this.state === 'win' && this.player.towerHeight>0)) this.player.updateTower(elapsed,this.state==='bonus' && !this.bonusDone);
            else this.player.update(elapsed, running ? this.speed : fighting ? 3 : 0, fighting && !!this.enemy?.engaged);
            if (fighting && this.enemy?.engaged) this.player.fight();
            this.player.updateEffects?.(elapsed);
        }
        if (this.enemy) { this.enemy.squad.update(elapsed,fighting?3:0,fighting && this.enemy.engaged); if (fighting && this.enemy.engaged) this.enemy.squad.fight();this.enemy.squad.updateEffects?.(elapsed); }
        for(let i=(this.fadingEnemies?.length||0)-1;i>=0;i--){const s=this.fadingEnemies[i];s.updateEffects(elapsed);if(!s.hasEffects){s.destroy();this.fadingEnemies.splice(i,1);}}
        this.world?.animate?.(elapsed);

        this.syncCamera(elapsed);
        this.hudUpdate();
    }

    private tickPlaying(dt: number) {
        let dir = 0;
        if (this.keys.left) dir += 1;
        if (this.keys.right) dir -= 1;
        if (dir !== 0) this.targetX = Math.max(-1.62, Math.min(1.62, this.targetX + dir * dt * 4.2));
        this.x += (this.targetX - this.x) * Math.min(1, dt * 12);
        this.z += this.speed * dt;
        this.player.setPosition(this.x, 0, this.z);

        this.world.update(dt, this.x, this.z, this.player.radius, {
            onGatePass: (op) => {
                const before = this.player.count;
                const after = applyOp(before, op);
                this.player.setCount(after,true);
                if (after <= 0) this.failLevel();

                if (after >= before) this.sfx.gateGood(); else this.sfx.gateBad();
            },
            onCoin: () => { this.coinsRun++; this.sfx.coin(); },
            onObstacleDamage: (units,atX,atZ) => {
                this.pendingDamage += units;
                if (this.pendingDamage >= 1) {
                    const lose = Math.floor(this.pendingDamage);
                    this.pendingDamage -= lose;
                    const next = Math.max(0, this.player.count - lose);
                    this.player.setCount(next,true);
                    this.player.react();
                    if(this.impactCooldown<=0){this.world.impact(atX,atZ);this.sfx.hit();this.impactCooldown=0.16;}
                    if (next <= 0) this.failLevel();
                }
            },
            onFinish: () => this.beginBonus(),
            onSpinnerWarn: () => {},
        });

        if (this.state !== 'playing') return;
        if (this.z > 45 && this.ui) this.ui.setHint(false);
        this.trySpawnEnemy();
        this.tryEngageEnemy();
    }

    private trySpawnEnemy() {
        if (this.enemy) return;
        for (const p of this.enemyPlans) {
            if (p.spawned) continue;
            if (this.z >= p.z - 42) {
                p.spawned = true;
                const s = new Squad(this.scene, 'Enemy', { color: c('#F2453D'), unitScale: p.boss ? 2.4 : undefined });
                s.setFacing(-1);
                s.setPosition(0, 0, p.z);
                s.setCount(p.count);
                this.enemy = {
                    squad: s, count: p.count, strength: p.strength, boss: p.boss,
                    z: p.z, cost: Math.ceil(p.count * p.strength), engaged: false,
                };
                break;
            }
        }
    }

    private tryEngageEnemy() {
        const e = this.enemy;
        if (!e) return;
        if (this.z >= e.z - 4.4) this.beginBattle();
    }

    private beginBattle() {
        const e = this.enemy;
        if (!e) return;
        this.state = 'battle';
        this.battleT = 0;
        this.battleStartPlayer = this.player.count;
        this.battleStartEnemy = e.count;
        this.battleDur = math.clamp(0.75 + e.count / 50, 0.75, 2.6);
        this.sfx.hit();
    }

    private tickBattle(dt: number) {
        const e = this.enemy;
        if (!e) { this.state = 'playing'; return; }
        const contactZ = this.z + 2.5;
        if (e.z > contactZ) {
            e.z = Math.max(contactZ, e.z - 4.2 * dt);
            e.squad.setPosition(0, 0, e.z);
            if (e.z > contactZ) return;
        }
        e.engaged = true;

        this.battleT += dt;
        const progress = Math.min(1, this.battleT / this.battleDur);
        const remainP = Math.max(0, this.battleStartPlayer - Math.round(e.cost * progress));
        const remainE = Math.max(0, this.battleStartEnemy - Math.round(this.battleStartEnemy * progress));
        const impact=remainP!==this.player.count || remainE!==e.count;
        if (remainP !== this.player.count) { this.player.setCount(remainP,true);this.player.react?.(); }
        if (remainE !== e.count) { e.count = remainE; e.squad.setCount(remainE,true);e.squad.react?.(); }
        if(impact && this.impactCooldown<=0){this.world?.impact?.(this.x||0,this.z+1.25);this.sfx?.hit?.();this.impactCooldown=0.18;}


        if (this.battleT >= this.battleDur) {
            if(e.squad.hasEffects){e.squad.setVisible(false);this.fadingEnemies.push(e.squad);}else e.squad.destroy();
            this.enemy = null;
            if (this.player.count <= 0) this.failLevel();
            else this.state = 'playing';
        }
    }

    /* -------------------------------- camera ----------------------------- */

    private syncCamera(dt: number) {
        const camNode = this.cam.node;
        if (this.state === 'menu') return;
        const tower = this.state==='bonus' || this.state==='win';
        const height = tower ? (this.player?.towerHeight || FINISH.rise) : 0;
        const towerDistance=Math.max(13,height*1.4+6);
        const targetZ = this.z - (tower ? towerDistance : 9.5);
        const targetY = this.playerY + (tower ? Math.max(5.2,height*0.6+3) : 7.2);
        const targetXc = this.x * 0.18+(tower?Math.min(5,towerDistance*0.25):0);
        const cur = camNode.position;
        const lerp = Math.min(1, dt * 9);
        camNode.setPosition(
            cur.x + (targetXc - cur.x) * lerp,
            cur.y + (targetY - cur.y) * lerp,
            cur.z + (targetZ - cur.z) * lerp,
        );
        const lookY=this.playerY+(tower ? height*0.55 : 0.5);
        this.cameraLookY = Number.isFinite(this.cameraLookY) ? this.cameraLookY+(lookY-this.cameraLookY)*Math.min(1,dt*5) : lookY;
        camNode.lookAt(new Vec3(this.x * 0.35,this.cameraLookY,this.z+(tower?3:6)));

        // Camera remains stable during combat. Impact is shown on the units.
    }

    /* --------------------------------- hud ------------------------------- */

    private hudUpdate() {
        if (!this.ui) return;
        this.ui.setCoins(this.save.coins + (this.state === 'playing' || this.state === 'battle' || this.state === 'bonus' ? this.coinsRun : 0));
        const t = Math.max(0, Math.min(1, this.z / Math.max(1, this.level.length)));
        this.ui.setProgress(t);
        if (this.state === 'playing' || this.state === 'battle') {
            this.ui.setGateChips(this.world.upcomingGates(this.z, 2));
        }
        if (this.player && this.player.node.active) {
            const wp = this.player.node.position;
            this.ui.placeBubble(this.ui.playerBubble, this.ui.playerBubbleLabel,
                new Vec3(wp.x,wp.y+(this.state==='bonus' ? this.player.towerHeight+0.3 : 1.05),wp.z),this.player.count,44);
            if((this.state==='bonus' || this.state==='win') && this.player.towerHeight>0 && this.ui.playerBubble) this.ui.playerBubble.active=false;
        }
        if (this.enemy && this.enemy.squad.node.active && this.enemy.count > 0) {
            const wp = this.enemy.squad.node.position;
            this.ui.placeBubble(this.ui.foeBubble, this.ui.foeBubbleLabel,
                new Vec3(wp.x, 1.35, wp.z), this.enemy.count, 40);
            if (this.enemy.boss && this.ui.foeBubbleLabel) {
                this.ui.foeBubbleLabel.string = 'BOSS';
                this.ui.foeBubbleLabel.fontSize = 22;
            }
        } else if (this.ui.foeBubble) {
            this.ui.foeBubble.active = false;
        }
    }

    /* -------------------------------- result ----------------------------- */

    private beginBonus() {
        if (this.state !== 'playing') return;
        this.state = 'bonus'; this.targetX = 0;
        this.bonusStep = 0; this.bonusWait = 0; this.bonusDone = false; this.bonusMultiplier = 1;
        this.bonusPhase='gather'; this.playerY=FINISH.foot;
        this.player.beginTower(towerGroups(this.player.count));
        this.ui.setBonusHint(`集合人塔 · ${this.player.count} 人`);
        this.ui.setGateChips([]);
    }

    private tickBonus(dt: number) {
        if (this.bonusDone) {
            this.bonusWait += dt;
            if (this.bonusWait >= 1.3) this.winLevel();
            return;
        }
        this.x += (0-this.x)*Math.min(1,dt*8);
        if (this.bonusPhase==='gather') {
            this.z=Math.min(this.level.length+FINISH.gatherZ,this.z+dt*4);
            this.player.setPosition(this.x,this.playerY,this.z);
            if (this.player.towerReady && this.z>=this.level.length+FINISH.gatherZ) {
                this.bonusPhase='climb'; this.ui.setBonusHint(`奖励 ×1 · 剩余 ${this.player.count} 人`);
            }
            return;
        }
        const finalZ=stairFront(this.level.length,FINISH.steps)+1.2;
        const target=this.bonusPhase==='chest' ? finalZ : stairFront(this.level.length,this.bonusStep)-FINISH.clearance;
        this.z=Math.min(target,this.z+dt*FINISH.speed);
        this.player.setPosition(this.x,this.playerY,this.z);
        if (this.z<target) return;
        if (this.bonusPhase==='chest' || this.player.count<=this.player.towerBaseCount) {
            this.bonusDone = true; this.bonusWait = 0;
            this.ui.setBonusHint(`冲刺完成 · 奖励 ×${this.bonusMultiplier}`);
            if (this.bonusPhase==='chest') this.world.openBonusChest();
            this.sfx.win(); return;
        }
        // Shed the lowest row while still safely in front of the solid face.
        this.player.consumeTowerLayer(this.player.towerBaseCount);
        this.world.markBonusStep(this.bonusStep);
        this.bonusStep++; this.bonusMultiplier=1+this.bonusStep*0.5;
        this.playerY=FINISH.foot+this.bonusStep*FINISH.rise;
        this.player.setPosition(this.x,this.playerY,this.z);
        if (this.bonusStep===FINISH.steps) this.bonusPhase='chest';
        this.ui.setBonusHint(`奖励 ×${this.bonusMultiplier} · 剩余 ${this.player.count} 人`);
        this.sfx.coin();
    }

    private winLevel() {
        if (this.state === 'win') return;
        this.state = 'win';
        const incomeMul = 1 + this.save.income * 0.1;
        const base = Math.round((this.coinsRun + 45 + this.level.id * 8) * incomeMul);
        const earned = Math.round(base * 2 * (this.bonusMultiplier || 1));                    // ad-free build: always doubled
        this.save.coins += earned;
        this.save.best = Math.max(this.save.best, this.level.id);
        this.save.level = Math.min(999, Math.max(this.save.level, this.level.id + 1));
        storeSave(this.save);
        this.sfx.win();
        this.ui.setHint(false);
        this.ui.showWin(this.level.id, earned, this.save.coins, this.handlers(), this.bonusMultiplier || 1);
    }

    private failLevel() {
        if (this.state === 'lose') return;
        this.reviveClearEnemy = this.state === 'battle';
        this.state = 'lose';
        this.sfx.lose();
        this.ui.setHint(false);
        this.ui.showLose(this.level.id, this.reviveCost, this.save.coins >= this.reviveCost, this.handlers());
    }
}
