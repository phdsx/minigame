import { Node, MeshRenderer, Color, Vec3 } from 'cc';
import { stickmanMesh, litMaterial, crowdMaterial } from './Art';
import { ACTOR_SCALE, FINISH } from './Finish';

export interface SquadOptions {
    color: Color;
    unitScale?: number;
}

/**
 * One fixed-size actor per person. Staggered rows grow along the road instead
 * of scaling the people down. The full crowd also participates in the tower.
 */
export class Squad {
    readonly node: Node;
    private units: Node[] = [];
    private renderers: MeshRenderer[] = [];
    private poses: number[] = [];
    private offsets: Array<{ x: number; z: number; phase: number }> = [];
    private mat: ReturnType<typeof litMaterial>;
    private gpuMat: ReturnType<typeof crowdMaterial>;
    private gpu = false;
    private anim = new Float32Array(4);
    private baseScale: number;
    private unitScale = 1;
    private bob = 0;
    private facing = 1;
    private tower: { groups: number[]; widths: number[]; origins: {x:number;y:number;z:number;scale:number}[]; time: number } | null = null;
    private retired: Node[] = [];
    private falling: {node:Node;time:number;x:number;y:number;z:number;scale:number;side:number}[] = [];
    private hitTime = 0;
    private birthTime = 0;
    private birthFrom = 0;

    count = 1;
    radius = 0.5;

    constructor(parent: Node, name: string, opts: SquadOptions) {
        this.node = new Node(name);
        this.node.setParent(parent);
        this.mat = litMaterial(opts.color,true);
        this.gpuMat = crowdMaterial(opts.color);
        this.baseScale = opts.unitScale ?? ACTOR_SCALE;
        this.setCount(1);
    }

    setFacing(f: number) { this.facing = f; this.layout(); }

    get position(): Vec3 { return this.node.position; }

    setPosition(x: number, y: number, z: number) { this.node.setPosition(x, y, z); }

    setVisible(v: boolean) { this.node.active = v; this.retired.forEach(u=>u.active=v); }

    get towerReady() { return !!this.tower && this.tower.time >= FINISH.gatherTime; }
    get towerHeight() { return this.tower ? this.tower.widths.length*FINISH.rise : 0; }
    get towerBaseCount() { return this.tower?.widths[0] || 0; }
    get hasEffects() { return this.falling.length>0; }
    get renderedCount() { return this.units.length; }
    get retiredCount() { return this.retired.length; }
    react() { this.hitTime=0.22; }

    private pose(index: number, frame: number, action: 'run'|'attack'|'hurt'='run', stacked=false, phase=0, moving=false) {
        if(this.gpu) {
            this.anim[0]=phase;this.anim[1]=action==='hurt'?3:action==='attack'?2:moving?1:0;this.anim[2]=stacked?1:0;
            this.renderers[index].setInstancedAttribute('a_anim',this.anim);
        } else if(this.poses[index]!==frame) {
            this.renderers[index].mesh=stickmanMesh(frame%16,stacked,action);
        }
        this.poses[index]=frame;
    }

    beginTower(groups: number[]) {
        this.tower = {
            groups: groups.slice(), widths:groups.slice(), time: 0,
            origins: this.units.map(u=>({x:u.position.x,y:u.position.y,z:u.position.z,scale:this.unitScale})),
        };
        this.radius = 2.7;
    }

    /** Upper people stay still on the layer below; only the base walks. */
    updateTower(dt: number, moving: boolean) {
        const tower = this.tower;
        if (!tower) return;
        tower.time += dt;
        const t = Math.min(1,tower.time/FINISH.gatherTime);
        const ease = t*t*(3-2*t);
        this.bob += dt*10;
        let index = 0;
        tower.widths.forEach((width,layer)=>{
            for (let column=0;column<width;column++,index++) {
                const u=this.units[index], origin=tower.origins[index];
                // A common centre-out grid keeps every upper person directly
                // above a supporting lower person, including partial layers.
                const col=column%FINISH.columns,row=Math.floor(column/FINISH.columns);
                const x=(Math.floor(col/2)+0.5)*FINISH.spacing*(col%2?1:-1);
                const z=row===0?0:Math.ceil(row/2)*FINISH.depthSpacing*(row%2?-1:1);
                const y=layer*FINISH.rise;
                u.setPosition(origin.x+(x-origin.x)*ease,origin.y+(y-origin.y)*ease,origin.z+(z-origin.z)*ease);
                const scale=origin.scale+(FINISH.scale-origin.scale)*ease;
                u.setScale(scale,scale,scale);
                u.setRotationFromEuler(0,0,0);
                const pose=layer>0?16:layer===0 && moving?Math.floor((this.bob+column)*2.5)%16:0;
                this.pose(index,pose,'run',layer>0,this.bob+column,layer===0 && moving);
            }
        });
    }

    /** Leave the bottom row on the lower tread before moving over the riser. */
    consumeTowerLayer(cost: number) {
        const tower=this.tower;
        if (!tower || tower.groups.length<2) return;
        const width=tower.widths.shift()!;
        if(width!==cost) throw new Error('Tower layer count must match the step cost');
        tower.groups.shift(); this.count-=cost;
        const root=this.node.position;
        for (let i=0;i<width;i++) {
            const u=this.units[i], local=u.position;
            u.setParent(this.node.parent!);
            u.setPosition(root.x+local.x,root.y+local.y,root.z+local.z);
            if(this.gpu)this.renderers[i].setInstancedAttribute('a_anim',[0,0,0,0]);
            else this.renderers[i].mesh=stickmanMesh();
            this.retired.push(u);
        }
        this.units.splice(0,width); this.renderers.splice(0,width); this.poses.splice(0,width); this.offsets.splice(0,width);
        tower.origins.splice(0,width);
        // Root rises by the same amount, preserving every survivor's world Y.
        this.units.forEach(u=>u.setPosition(u.position.x,u.position.y-FINISH.rise,u.position.z));
    }

    recolor(color: Color) {
        this.mat = litMaterial(color,true);
        this.gpuMat = crowdMaterial(color);
        for (const u of this.units) {
            const mr = u.getComponent(MeshRenderer);
            if (mr) mr.setMaterial(this.gpu?this.gpuMat!:this.mat, 0);
        }
    }

    private layout() {
        // Fit the ordinary crowd inside a 3.25m half-track even at the full
        // 1.62m steering offset. More people add rows, never a scale change.
        const n = Math.max(1,this.count);
        const columns=Math.min(13,Math.ceil(Math.sqrt(n)));
        const rows=Math.ceil(n/columns),ratio=this.baseScale/ACTOR_SCALE;
        const sideStep=.23*ratio,rowStep=.27*ratio;
        const front=Math.min(rows-1,8)*rowStep*.5;
        this.unitScale=this.baseScale;
        let halfWidth=0;
        for (let i = 0; i < this.offsets.length; i++) {
            const row=Math.floor(i/columns),col=i%columns;
            const width=Math.min(columns,n-row*columns);
            const stagger=rows>1?(row%2?1:-1)*sideStep*.25:0;
            const x=(col-(width-1)*.5)*sideStep+stagger;
            this.offsets[i].x=x;
            this.offsets[i].z=(front-row*rowStep)*this.facing;
            halfWidth=Math.max(halfWidth,Math.abs(x));
        }
        this.radius=halfWidth+this.baseScale*.24;
        for (const u of this.units) u.setScale(this.unitScale, this.unitScale, this.unitScale);
    }

    private ensure(n: number, animate = false) {
        while (this.units.length < n) {
            const u = new Node('u');
            u.setParent(this.node);
            const mr = u.addComponent(MeshRenderer);
            mr.mesh = stickmanMesh(0,false,'run',this.gpu);
            mr.setMaterial(this.gpu?this.gpuMat!:this.mat, 0);
            this.units.push(u);
            this.renderers.push(mr); this.poses.push(-1);
            const i = this.units.length - 1;
            this.offsets.push({ x:0,z:0,phase: (i * 1.7) % 6.283 });
        }
        if (this.units.length > n) {
            // The formation is ordered from its battle front to its rear.
            // Show casualties at contact, then let the following ranks fill in.
            const amount=this.units.length-n,start=animate?0:n;
            const removed=this.units.splice(start,amount);
            this.offsets.splice(start,amount);this.renderers.splice(start,amount);this.poses.splice(start,amount);
            removed.forEach((u,i)=>{
                if(animate) {
                    const root=this.node.position, local=u.position;
                    const x=root.x+local.x,y=root.y+local.y,z=root.z+local.z;
                    u.setParent(this.node.parent!);u.setPosition(x,y,z);
                    this.falling.push({node:u,time:0,x,y,z,scale:this.unitScale,side:i%2?1:-1});
                } else u.destroy();
            });
        }
    }

    setCount(n: number, animate = false) {
        const before=this.count, previous=this.units.length;
        this.count = Math.max(0, Math.round(n));
        // Keep every actor. Only joint detail changes, once per squad lifetime;
        // moving poses then update four floats instead of rebuilding models.
        if(!this.gpu && this.count>160 && this.gpuMat) {
            this.gpu=true;
            this.renderers.forEach(mr=>{mr.mesh=stickmanMesh(0,false,'run',true);mr.setMaterial(this.gpuMat!,0);});
        }
        this.ensure(this.count,animate);
        this.layout();
        if(animate && this.count>before){this.birthTime=0.4;this.birthFrom=previous;}
        this.node.active = this.count > 0;
    }

    update(dt: number, speed: number, fighting = false) {
        this.hitTime=Math.max(0,this.hitTime-dt);
        this.birthTime=Math.max(0,this.birthTime-dt);
        this.bob += dt * (speed > 0.1 ? 8 + speed * 0.5 : 0);
        const amp = speed > 0.1 ? 0.035 : 0;
        for (let i = 0; i < this.units.length; i++) {
            const u = this.units[i];
            const o = this.offsets[i];
            const ph = this.bob + o.phase;
            const hit=this.hitTime>0 && i%3===0;
            if(fighting && !hit)continue;
            const frame = hit ? 48 : speed > 0.1 ? Math.floor(((ph % (Math.PI*2)) + Math.PI*2) % (Math.PI*2) / (Math.PI*2) * 16) : 0;
            this.pose(i,frame,hit?'hurt':'run',false,ph,speed>0.1);
            const born=this.birthTime>0 && i>=this.birthFrom ? Math.sin(Math.PI*(1-this.birthTime/0.4)) : 0;
            u.setPosition(o.x,Math.abs(Math.sin(ph))*amp+born*0.4+(hit?0.06:0),o.z-(hit?Math.sin(this.hitTime/0.22*Math.PI)*0.25*this.facing:0));
            u.setRotationFromEuler(hit?-18*this.facing:0,this.facing>0?0:180,hit?12:Math.sin(ph)*4);
        }
    }

    /** Push the crowd forward a little during combat lunges. */
    fight() {
        for (let i = 0; i < this.units.length; i++) {
            const u = this.units[i];
            const o = this.offsets[i];
            if(this.hitTime>0 && i%3===0) continue;
            const phase=this.bob*1.8+o.phase;
            const punch=Math.max(0,Math.sin(phase));
            const frame=Math.floor((phase%(Math.PI*2))/(Math.PI*2)*16);
            const pose=32+frame;
            this.pose(i,pose,'attack',false,phase,true);
            u.setPosition(o.x,Math.sin(punch*Math.PI)*0.09,o.z+punch*0.38*this.facing);
            u.setRotationFromEuler(punch*12*this.facing,this.facing>0?0:180,Math.sin(phase)*7);
        }
    }

    updateEffects(dt:number) {
        for(let i=this.falling.length-1;i>=0;i--){
            const f=this.falling[i];f.time+=dt;const p=Math.min(1,f.time/0.65);
            f.node.setPosition(f.x+f.side*p*0.5,f.y+Math.sin(p*Math.PI)*(0.6+f.scale*0.2)+p*f.scale*0.45,f.z-this.facing*p*0.9);
            f.node.setRotationFromEuler(p*85,this.facing>0?0:180,f.side*p*70);
            const scale=f.scale*(1-Math.max(0,(p-0.6)/0.4));f.node.setScale(scale,scale,scale);
            if(p===1){f.node.destroy();this.falling.splice(i,1);}
        }
    }

    worldPos(): Vec3 { return this.node.worldPosition; }

    destroy() { this.retired.forEach(u=>u.destroy());this.falling.forEach(f=>f.node.destroy());this.falling.length=0; this.node.destroy(); }
}
