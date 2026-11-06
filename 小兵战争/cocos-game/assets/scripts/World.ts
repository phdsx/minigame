import { Node, MeshRenderer, Color, Vec3, Camera, Texture2D, Mesh, Material, Vec4, primitives } from 'cc';
import * as Art from './Art';
import { FINISH, stairFront } from './Finish';
import { LevelDef, LevelEvent, Op, opLabel, applyOp } from './Data';

export interface WorldHooks {
    onGatePass(op: Op, x: number, label: string): void;
    onCoin(): void;
    onObstacleDamage(units: number, atX: number, atZ: number): void;
    onFinish(): void;
    onSpinnerWarn(): void;
}

interface Coin { node: Node; z: number; x: number; taken: boolean; collectTime: number; phase: number; }

interface GatePair {
    z: number; left: Op; right: Op; passed: boolean;
    leftNode: Node; rightNode: Node;
    leftOp: Op; rightOp: Op; divider: Node;
    animation: number; chosen: Node | null;
}

interface SpikeObstacle { z: number; xs: number[]; }
interface SpinnerObstacle { z: number; node: Node; angle: number; speed: number; }

const TRACK_W = 6.5;
const RAIL_H = 0.22;

export class World {
    root: Node;
    private scene: Node;
    private coinsArr: Coin[] = [];
    private gates: GatePair[] = [];
    private spikes: SpikeObstacle[] = [];
    private spinners: SpinnerObstacle[] = [];
    private finishZ = 0;
    private finished = false;
    private visualTime = 0;
    private particles: {node:Node;x:number;z:number;age:number;vx:number;vz:number}[] = [];
    private bonusSteps: MeshRenderer[] = [];
    private chestLid: Node | null = null;
    private coinMesh: Mesh | null = null;
    private coinMat: Material | null = null;
    private mountainMat1 = new Color(75, 142, 130, 255);
    private mountainMat2 = new Color(105, 170, 150, 255);
    private mountainMat3 = new Color(62, 120, 113, 255);

    constructor(scene: Node) {
        this.scene = scene;
        this.root = new Node('World');
        this.root.setParent(scene);
    }

    /** Upcoming gate pairs, used for the HUD preview chips. */
    upcomingGates(z: number, n = 2): string[][] {
        const out: string[][] = [];
        for (const g of this.gates) {
            if (g.z > z - 2) {
                out.push([opLabel(g.rightOp), opLabel(g.leftOp)]);
                if (out.length >= n) break;
            }
        }
        return out;
    }

    build(level: LevelDef) {
        this.clear();
        this.finishZ = level.length;
        this.finished = false;

        this.buildRoad(level.length);
        this.buildMountains(level.length);
        this.buildFinish(level.length);
        this.buildBonus(level.length);

        for (const ev of level.events) this.buildEvent(ev);
    }

    private clear() {
        this.root.destroyAllChildren();
        this.coinsArr.length = 0;
        this.gates.length = 0;
        this.spikes.length = 0;
        this.spinners.length = 0;
        this.bonusSteps.length = 0; this.chestLid = null;
        this.particles.length=0;this.visualTime=0;
    }

    /* ------------------------------ scenery ------------------------------ */

    private buildRoad(len: number) {
        const pad = 45;
        const total = len + pad * 2;
        const road = new Node('Road');
        road.setParent(this.root);
        road.setPosition(0, 0, len / 2);
        const mr = road.addComponent(MeshRenderer);
        const mesh = Art.groundQuadMesh(TRACK_W, total, 1, Math.max(1, Math.round(total / 3.2)));
        mr.mesh = mesh;
        const tex = Art.trackTexture();
        const mat = Art.unlitMaterial(new Color(255, 255, 255, 255), tex);
        mat.setProperty('mainColor', new Vec4(1,1,1,1));
        mr.setMaterial(mat, 0);

        // side rails
        for (const sx of [-1, 1]) {
            const rail = new Node('Rail');
            rail.setParent(this.root);
            rail.setPosition((sx * (TRACK_W + 0.28)) / 2, RAIL_H / 2, len / 2);
            rail.setScale(0.16, RAIL_H, total);
            const rmr = rail.addComponent(MeshRenderer);
            rmr.mesh = Art.boxMesh();
            rmr.setMaterial(Art.unlitMaterial(new Color(169, 199, 215, 255)), 0);
        }

        // soft ground plane under everything, so the horizon reads as a valley
        const ground = new Node('Ground');
        ground.setParent(this.root);
        ground.setPosition(0, -0.6, len / 2);
        const gmr = ground.addComponent(MeshRenderer);
        gmr.mesh = Art.groundQuadMesh(90, total + 120);
        const groundMat = Art.unlitMaterial(new Color(255, 255, 255, 255));
        groundMat.setProperty('mainColor', new Color(224,240,248,255));
        gmr.setMaterial(groundMat, 0);
    }

    private buildMountains(len: number) {
        const palette = [this.mountainMat1, this.mountainMat2, this.mountainMat3];
        const mats = palette.map(() => Art.litMaterial(new Color(255,255,255,255)));
        let seed = 7;
        const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        for (let z = -20; z < len + 60; z += 12) {
            for (const side of [-1, 1]) {
                if (rnd() < 0.25) continue;
                const m = new Node('Mountain');
                m.setParent(this.root);
                const dist = 7.5 + rnd() * 6;
                const s = 1.25 + rnd() * 1.3;
                m.setPosition(side * dist, -0.4, z + (rnd() - 0.5) * 8);
                m.setScale(s, s * (0.7 + rnd() * 0.5), s);
                const mr = m.addComponent(MeshRenderer);
                mr.mesh = Art.mountainMesh(Math.floor(rnd() * 1000) + 1);
                mr.setMaterial(mats[Math.floor(rnd() * mats.length)], 0);
            }
        }
    }

    private buildFinish(len: number) {
        const banner = new Node('Finish');
        banner.setParent(this.root);
        banner.setPosition(0, 0.02, len);
        const mr = banner.addComponent(MeshRenderer);
        mr.mesh = Art.groundQuadMesh(TRACK_W, 1.6, 6, 1.5);
        mr.setMaterial(Art.unlitMaterial(new Color(255, 255, 255, 255), Art.checkerTexture()), 0);

        for (const sx of [-1, 1]) {
            const post = new Node('Post');
            post.setParent(this.root);
            post.setPosition((sx * TRACK_W) / 2, 1.5, len);
            post.setScale(0.14, 3, 0.14);
            const pmr = post.addComponent(MeshRenderer);
            pmr.mesh = Art.boxMesh();
            pmr.setMaterial(Art.unlitMaterial(new Color(60, 60, 80, 255)), 0);
        }
    }

    private buildBonus(finish: number) {
        const colors = ['#69CFDA','#61C9D7','#69B8E7','#858DDF','#A27CDD','#BC75CB','#E58AB1','#EAC25B'];
        for (let i=0;i<FINISH.steps;i++) {
            const step = new Node('RewardStep'); step.setParent(this.root);
            const height = (i+1)*FINISH.rise;
            const front=stairFront(finish,i);
            step.setPosition(0,height/2,front+FINISH.tread/2);
            const mesh = step.addComponent(MeshRenderer); mesh.mesh=Art.boxMesh(6.1,height,FINISH.tread);
            const h = colors[i].slice(1); const color = new Color(parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16),255);
            mesh.setMaterial(Art.litMaterial(color),0); this.bonusSteps.push(mesh);
            const sign = this.quadNode('RewardMultiplier',2.0,0.5,Art.gateTexture(`×${1+(i+1)*0.5}`,'mul'));
            sign.setParent(this.root); sign.setPosition(0,height-FINISH.rise/2,front-0.015);
        }
        const summit=FINISH.steps*FINISH.rise;
        const podiumFront=stairFront(finish,FINISH.steps);
        const podium = new Node('ChestPodium'); podium.setParent(this.root);
        podium.setPosition(0,summit/2,podiumFront+2.5); const pm = podium.addComponent(MeshRenderer);
        pm.mesh=Art.boxMesh(6.1,summit,5); pm.setMaterial(Art.litMaterial(new Color(235,196,91,255)),0);
        const chest = new Node('RewardChest'); chest.setParent(this.root); chest.setPosition(0,summit,podiumFront+3.4);
        const body = new Node('ChestBody'); body.setParent(chest); body.setPosition(0,0.52,0);
        const bm=body.addComponent(MeshRenderer); bm.mesh=Art.boxMesh(1.9,1.04,1.4); bm.setMaterial(Art.litMaterial(new Color(229,158,42,255)),0);
        const lid = new Node('ChestLid'); lid.setParent(chest); lid.setPosition(0,1.14,0.55);
        const lm=lid.addComponent(MeshRenderer); lm.mesh=Art.boxMesh(2.04,0.26,1.5); lm.setMaterial(Art.litMaterial(new Color(255,214,91,255)),0);
        this.chestLid=lid;
        const lock = new Node('ChestLock'); lock.setParent(chest); lock.setPosition(0,0.78,-0.73);
        const km=lock.addComponent(MeshRenderer); km.mesh=Art.boxMesh(0.3,0.36,0.08); km.setMaterial(Art.litMaterial(new Color(255,239,154,255)),0);
    }

    markBonusStep(index: number) {
        const step = this.bonusSteps[index];
        if (step) step.setMaterial(Art.litMaterial(new Color(255,224,131,255)),0);
    }

    openBonusChest() { this.chestLid?.setRotationFromEuler(-65,0,0); }

    /* ------------------------------- events ------------------------------ */

    private buildEvent(ev: LevelEvent) {
        switch (ev.t) {
            case 'gate':
                this.buildGate(ev.d, ev.left, ev.right);
                break;
            case 'coins':
                this.buildCoins(ev.d, ev.n, ev.pattern, ev.x);
                break;
            case 'spikes':
                this.buildSpikes(ev.d, ev.gapX);
                break;
            case 'spinner':
                this.buildSpinner(ev.d);
                break;
            default:
                break;
        }
    }

    private quadNode(name: string, w: number, h: number, tex: Texture2D, tint = new Color(255, 255, 255, 255)): Node {
        const n = new Node(name);
        const mr = n.addComponent(MeshRenderer);
        mr.mesh = Art.quadMesh(w, h);
        mr.setMaterial(Art.unlitMaterial(tint, tex), 0);
        return n;
    }

    private buildGate(z: number, left: Op, right: Op) {
        const half = TRACK_W / 2 - 0.05;
        const lk = left.kind === 'sub' || left.kind === 'div' ? 'sub' : (left.kind === 'mul' ? 'mul' : 'add');
        const rk = right.kind === 'sub' || right.kind === 'div' ? 'sub' : (right.kind === 'mul' ? 'mul' : 'add');
        const ln = this.quadNode('GateL', half, 1.4, Art.gateTexture(opLabel(left), lk as any));
        const rn = this.quadNode('GateR', half, 1.4, Art.gateTexture(opLabel(right), rk as any));
        ln.setParent(this.root);
        rn.setParent(this.root);
        ln.setPosition(-half / 2 - 0.02, 0.74, z);
        rn.setPosition(half / 2 + 0.02, 0.74, z);

        // centre divider
        const div = new Node('Divider');
        div.setParent(this.root);
        div.setPosition(0, 0.75, z);
        div.setScale(0.1, 1.5, 0.1);
        const mr = div.addComponent(MeshRenderer);
        mr.mesh = Art.boxMesh();
        mr.setMaterial(Art.unlitMaterial(new Color(70, 70, 90, 255)), 0);

        this.gates.push({
            z, passed: false, leftNode: ln, rightNode: rn, divider: div,
            leftOp: left, rightOp: right, left, right,animation:0,chosen:null,
        });
    }

    private buildCoins(z: number, n: number, pattern: 'line' | 'arc' | 'diamond' | 'circle', x: number) {
        if (!this.coinMesh) {
            this.coinMesh = Art.coinMesh();
            this.coinMat = Art.coinMaterial();
        }
        const place = (ox: number, oz: number) => {
            const c = new Node('Coin');
            c.setParent(this.root);
            c.setPosition(x + ox, 0.85, z + oz);
            const phase=this.coinsArr.length*.65;
            c.setRotationFromEuler(-10,Math.sin(phase)*32,-8);
            const mr = c.addComponent(MeshRenderer);
            mr.mesh = this.coinMesh!;
            mr.setMaterial(this.coinMat, 0);
            this.coinsArr.push({ node: c, z: z + oz, x: x + ox, taken: false,collectTime:0,phase });
        };
        switch (pattern) {
            case 'line':
                for (let i = 0; i < n; i++) place(0, i * 1.1);
                break;
            case 'arc':
                for (let i = 0; i < n; i++) {
                    const t = i / Math.max(1, n - 1);
                    place(Math.sin(t * Math.PI) * 1.6 - 0.0, i * 1.15);
                }
                break;
            case 'diamond': {
                const rows = Math.ceil((Math.sqrt(8 * n + 1) - 1) / 2);
                let k = 0;
                for (let r = 0; r < rows && k < n; r++) {
                    for (let q = 0; q <= r && k < n; q++) {
                        place(-r * 0.55 + q * 1.1, r * 1.05);
                        k++;
                    }
                }
                break;
            }
            case 'circle':
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * Math.PI * 2;
                    place(Math.cos(a) * 1.5, Math.sin(a) * 1.5 + 1.5);
                }
                break;
        }
    }

    private buildSpikes(z: number, gapX: number) {
        const xs: number[] = [];
        for (const off of [-2.05, 2.05]) {
            const px = gapX + off;
            if (Math.abs(px) > TRACK_W / 2 + 0.4) continue;
            const n = new Node('Spikes');
            n.setParent(this.root);
            n.setPosition(px, 0, z);
            const mr = n.addComponent(MeshRenderer);
            mr.mesh = Art.spikePillarMesh();
            mr.setMaterial(Art.litMaterial(new Color(92, 96, 118, 255)), 0);
            // red spike caps
            const cap = new Node('Cap');
            cap.setParent(n);
            cap.setPosition(0, 2.55, 0);
            cap.setScale(0.9, 0.9, 0.9);
            const cmr = cap.addComponent(MeshRenderer);
            cmr.mesh = Art.coneMesh(0.55, 0.7, 8);
            cmr.setMaterial(Art.litMaterial(new Color(228, 52, 52, 255)), 0);
            xs.push(px);
        }
        this.spikes.push({ z, xs });
    }

    private buildSpinner(z: number) {
        const hub = new Node('Spinner');
        hub.setParent(this.root);
        hub.setPosition(0, 1.1, z);
        const rot = new Node('Arm');
        rot.setParent(hub);
        const mr = rot.addComponent(MeshRenderer);
        mr.mesh = Art.boxMesh(TRACK_W + 1.4, 0.3, 0.42);
        mr.setMaterial(Art.litMaterial(new Color(120, 62, 62, 255)), 0);
        for (const s of [-1, 1]) {
            const spike = new Node('S');
            spike.setParent(rot);
            spike.setPosition(s * (TRACK_W / 2 + 0.5), 0, 0);
            const smr = spike.addComponent(MeshRenderer);
            smr.mesh = Art.coneMesh(0.4, 0.9, 6);
            smr.setMaterial(Art.litMaterial(new Color(228, 52, 52, 255)), 0);
        }
        this.spinners.push({ z, node: rot, angle: 0, speed: 1.9 });
    }

    /* ------------------------------- update ------------------------------ */

    impact(x:number,z:number) { this.burst(x,z,new Color(255,232,145,255)); }

    private burst(x:number,z:number,color:Color) {
        for(let i=0;i<10;i++){
            const n=new Node('ImpactSpark');n.setParent(this.root);
            const mr=n.addComponent(MeshRenderer);mr.mesh=Art.boxMesh(0.12,0.12,0.12);mr.setMaterial(Art.litMaterial(color,true),0);
            const a=i*Math.PI*2/10;
            this.particles.push({node:n,x,z,age:0,vx:Math.cos(a)*2,vz:Math.sin(a)*1.5});
        }
    }

    /** Visuals keep playing while combat pauses course collisions. */
    animate(dt:number) {
        this.visualTime+=dt;
        for(const coin of this.coinsArr){
            if(coin.taken && coin.collectTime>=0.32)continue;
            const phase=this.visualTime*1.8+(coin.phase||0);
            if(coin.taken){
                coin.collectTime+=dt;const p=Math.min(1,coin.collectTime/0.32);
                coin.node.setPosition(coin.x,0.85+p*2.2,coin.z+p*0.6);
                const scale=(1-p)*(1+Math.sin(p*Math.PI)*.24);
                coin.node.setScale(scale,scale,scale);coin.node.active=p<1;
                coin.node.setRotationFromEuler(-10,p*640,-8+p*25);
            }else{
                coin.node.setPosition(coin.x,.85+Math.sin(phase)*.06,coin.z);
                coin.node.setRotationFromEuler(-10,Math.sin(phase)*32,-8);
            }
        }
        for(const gate of this.gates){
            if(!gate.passed || gate.animation>=1)continue;
            gate.animation=Math.min(1,gate.animation+dt/0.4);const p=gate.animation;
            for(const n of [gate.leftNode,gate.rightNode]){
                n.setScale(n===gate.chosen?1+Math.sin(p*Math.PI)*0.14:1-p,1-p,1);
                n.setPosition(n.position.x,n.position.y+dt*(n===gate.chosen?1.2:-0.4),n.position.z);
                n.active=p<1;
            }
        }
        for(const spinner of this.spinners){spinner.angle+=spinner.speed*dt;spinner.node.setRotationFromEuler(0,spinner.angle*180/Math.PI,0);}
        for(let i=this.particles.length-1;i>=0;i--){
            const f=this.particles[i];f.age+=dt;const p=Math.min(1,f.age/0.45);
            f.node.setPosition(f.x+f.vx*f.age,0.8+Math.sin(p*Math.PI)*0.9,f.z+f.vz*f.age);
            f.node.setRotationFromEuler(p*300,p*150,p*200);f.node.setScale(1-p,1-p,1-p);
            if(p===1){f.node.destroy();this.particles.splice(i,1);}
        }
    }

    /**
     * Advance world state for a player at (x, z). Returns true if the player
     * touched something lethal this frame (damage is reported via hooks).
     */
    update(dt: number, x: number, z: number, radius: number, hooks: WorldHooks) {
        // coins
        for (const c of this.coinsArr) {
            if (c.taken) continue;
            if (Math.abs(c.z - z) < 1.2 && Math.abs(c.x - x) < 1.7 + radius * 0.35) {
                c.taken = true;
                hooks.onCoin();
            }
        }

        // gates
        for (const g of this.gates) {
            if (g.passed) continue;
            if (z >= g.z - 0.25) {
                g.passed = true;
                const useLeft = x < 0;
                const op = useLeft ? g.leftOp : g.rightOp;
                const node = useLeft ? g.leftNode : g.rightNode;
                const other = useLeft ? g.rightNode : g.leftNode;
                hooks.onGatePass(op, useLeft ? -TRACK_W / 4 : TRACK_W / 4, opLabel(op));
                g.chosen=node;g.animation=0;
                this.burst(useLeft?-TRACK_W/4:TRACK_W/4,g.z,new Color(105,239,244,255));
                g.divider.setScale(0.01, 0.01, 0.01);
            }
        }

        // spike pillars: continuous damage while the crowd overlaps
        for (const s of this.spikes) {
            if (Math.abs(s.z - z) > 1.6) continue;
            for (const px of s.xs) {
                const d = Math.abs(px - x);
                if (d < 0.95 + radius * 0.35) {
                    const dmg = 42 * dt * (1 - Math.min(0.8, d / (1.2 + radius)));
                    hooks.onObstacleDamage(dmg, px, s.z);
                }
            }
        }

        // rotating bars
        for (const sp of this.spinners) {
            if (Math.abs(sp.z - z) > 1.1) continue;
            const dx = x - 0, dz = z - sp.z;
            const line = Math.abs(dx * Math.sin(sp.angle) - dz * Math.cos(sp.angle));
            const along = Math.abs(dx * Math.cos(sp.angle) + dz * Math.sin(sp.angle));
            if (line < 0.6 + radius * 0.3 && along < (TRACK_W + 1.2) / 2) {
                hooks.onObstacleDamage(70 * dt, x, sp.z);
            }
        }

        if (!this.finished && z >= this.finishZ) {
            this.finished = true;
            hooks.onFinish();
        }
    }

    get finishLine(): number { return this.finishZ; }

    destroy() { this.root.destroy(); }
}
