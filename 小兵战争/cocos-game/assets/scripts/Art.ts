import {
    ImageAsset, Texture2D, Material, Mesh, utils, primitives, Color, Vec3, Mat4, Quat, gfx, resources, EffectAsset, director,
} from 'cc';

/** ------------------------------------------------------------------
 *  Procedural art: textures and meshes are generated at runtime, so the
 *  project ships without binary assets.
 *
 *  The built-in *standard* effect is not available in this build, so shading
 *  is baked into vertex colours and every material uses `builtin-unlit`.
 *  ------------------------------------------------------------------ */

const cache = new Map<string, Texture2D>();
const LIGHT = new Vec3(0.38, 0.86, 0.34);
LIGHT.normalize();

function makeCanvas(w: number, h: number) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

export function texFromCanvas(c: HTMLCanvasElement, mipmaps = false): Texture2D {
    const img = new ImageAsset(c);
    const tex = new Texture2D();
    if(mipmaps)tex.setMipFilter(Texture2D.Filter.LINEAR);
    tex.image = img;
    tex.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
    tex.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    return tex;
}

export function hex(h: string, a = 1) {
    const v = h.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

/** Native Canvas exposes createLinearGradient but may return null. */
function fillGradient(g: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][], horizontal = false) {
    const gradient = g.createLinearGradient(0, 0, horizontal ? w : 0, horizontal ? 0 : h);
    if (gradient) {
        stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
        g.fillStyle = gradient; g.fillRect(0, 0, w, h); return;
    }
    const colors = stops.map(([offset, color]) => {
        const rgba = color.startsWith('#')
            ? [parseInt(color.slice(1,3),16), parseInt(color.slice(3,5),16), parseInt(color.slice(5,7),16), 1]
            : color.match(/[\d.]+/g)!.map(Number);
        return { offset, rgba };
    });
    const size = horizontal ? w : h;
    let segment = 0;
    for (let i=0;i<size;i++) {
        const p = i/Math.max(1,size-1);
        while (segment < colors.length-2 && p > colors[segment+1].offset) segment++;
        const a=colors[segment], b=colors[segment+1];
        const t=Math.max(0,Math.min(1,(p-a.offset)/(b.offset-a.offset)));
        const c=a.rgba.map((v,j)=>v+(b.rgba[j]-v)*t);
        g.fillStyle=`rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3]})`;
        g.fillRect(horizontal?i:0,horizontal?0:i,horizontal?1:w,horizontal?h:1);
    }
}

/* ------------------------------- textures ------------------------------- */

export function skyTexture(): Texture2D {
    if (cache.has('sky')) return cache.get('sky')!;
    const c = makeCanvas(8, 512);
    const g = c.getContext('2d')!;
    fillGradient(g,8,512,[[0,'#8ECBE9'],[0.35,'#BCE3F3'],[0.65,'#E7F5FB'],[1,'#F5FBFE']]);
    const t = texFromCanvas(c);
    cache.set('sky', t);
    return t;
}

export function trackTexture(): Texture2D {
    if (cache.has('track')) return cache.get('track')!;
    const W = 256, H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;
    g.fillStyle = '#D3E1EA'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#F5F9FC'; g.fillRect(8, 0, W - 16, H);
    g.fillStyle = '#E5EDF2'; g.fillRect(9, H-2, W - 18, 2);
    const t = texFromCanvas(c);
    t.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
    cache.set('track', t);
    return t;
}

/** A single minted design is used by HUD icons and both faces of the 3D coin. */
function paintCoinFace(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const disk=(radius:number,fill:string|CanvasGradient)=>{
        g.beginPath();g.arc(cx,cy,radius,0,Math.PI*2);g.fillStyle=fill;g.fill();
    };
    const gold=g.createLinearGradient(cx-r,cy-r,cx+r,cy+r);
    if(gold){gold.addColorStop(0,'#FFF3A1');gold.addColorStop(.32,'#FFDA50');gold.addColorStop(.7,'#F7B51C');gold.addColorStop(1,'#D88A08');}
    disk(r,'#A96C0B');disk(r*.97,gold||'#FFCC37');
    g.lineWidth=r*.035;g.strokeStyle='#FFF3B0';g.beginPath();g.arc(cx,cy,r*.92,Math.PI,Math.PI*1.87);g.stroke();
    disk(r*.78,'#BA790C');disk(r*.745,'#FFE070');disk(r*.71,'#FDC02B');
    g.lineWidth=r*.025;g.strokeStyle='#E49B12';g.beginPath();g.arc(cx,cy,r*.71,.05,Math.PI);g.stroke();
    // Raised I-shaped mint mark: dark lower bevel and a narrow upper highlight.
    const stamp=(dx:number,dy:number,fill:string)=>{
        g.fillStyle=fill;
        g.fillRect(cx-r*.075+dx,cy-r*.4+dy,r*.15,r*.8);
        g.fillRect(cx-r*.255+dx,cy-r*.44+dy,r*.51,r*.13);
        g.fillRect(cx-r*.255+dx,cy+r*.31+dy,r*.51,r*.13);
    };
    stamp(r*.018,r*.036,'#B57A0E');stamp(-r*.012,-r*.018,'#FFF0A0');
    stamp(r*.008,r*.012,'#FFE37A');
    g.strokeStyle='rgba(255,255,255,0.8)';g.lineWidth=r*.034;
    g.beginPath();g.moveTo(cx-r*.55,cy-r*.65);g.lineTo(cx-r*.32,cy-r*.75);g.stroke();
}

export function coinIconTexture(): Texture2D {
    if(cache.has('coin-icon'))return cache.get('coin-icon')!;
    const canvas=makeCanvas(256,256);paintCoinFace(canvas.getContext('2d')!,128,128,118);
    const texture=texFromCanvas(canvas,true);cache.set('coin-icon',texture);return texture;
}

function coinAtlas(): Texture2D {
    if(cache.has('coin-atlas'))return cache.get('coin-atlas')!;
    const canvas=makeCanvas(512,256),g=canvas.getContext('2d')!;
    paintCoinFace(g,128,128,118);
    const edge=g.createLinearGradient(256,0,256,256);
    if(edge){edge.addColorStop(0,'#FFF0A1');edge.addColorStop(.35,'#FFD443');edge.addColorStop(.7,'#D79412');edge.addColorStop(1,'#A66908');}
    g.fillStyle=edge||'#DB9B17';g.fillRect(256,0,256,256);
    const texture=texFromCanvas(canvas,true);cache.set('coin-atlas',texture);return texture;
}

export function checkerTexture(): Texture2D {
    if (cache.has('checker')) return cache.get('checker')!;
    const S = 128, cells = 8;
    const c = makeCanvas(S, S);
    const g = c.getContext('2d')!;
    const cs = S / cells;
    for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
            g.fillStyle = (x + y) % 2 === 0 ? '#2B2B33' : '#F5F6F8';
            g.fillRect(x * cs, y * cs, cs, cs);
        }
    }
    const t = texFromCanvas(c);
    t.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT);
    cache.set('checker', t);
    return t;
}

/** Gate panel with the operation text baked in. */
export function gateTexture(label: string, kind: 'add' | 'mul' | 'sub'): Texture2D {
    const key = 'gate:' + kind + ':' + label;
    if (cache.has(key)) return cache.get(key)!;

    const W = 1024, H = 512;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d')!;

    const top = kind === 'sub' ? '#FFC6BD' : '#C0FFF1';
    const bottom = kind === 'sub' ? '#F2453D' : '#12C4C9';

    fillGradient(g,W,H,[[0,top],[1,bottom]]);

    g.strokeStyle = 'rgba(255,255,255,0.34)';
    g.lineWidth = 8;
    for (let i = 1; i <= 4; i++) {
        const y = (H * i) / 5;
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    fillGradient(g,W,H,[[0,'rgba(255,255,255,0.16)'],[0.35,'rgba(255,255,255,0.02)'],[1,'rgba(0,60,80,0.18)']],true);

    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 18;
    g.beginPath(); g.rect(9, 9, W - 18, H - 18); g.stroke();
    g.strokeStyle = kind === 'sub' ? 'rgba(150,20,20,0.55)' : 'rgba(0,90,110,0.45)';
    g.lineWidth = 10;
    g.beginPath(); g.rect(26, 26, W - 52, H - 52); g.stroke();

    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fs = label.length > 3 ? 180 : 220;
    g.font = `900 ${fs}px "Microsoft YaHei", "Arial Black", Arial, sans-serif`;
    // soft dark drop shadow first, then white fill with a thin outline
    g.fillStyle = 'rgba(0,50,70,0.30)';
    g.fillText(label, W / 2 + 6, H / 2 + 14);
    g.lineWidth = 22;
    g.strokeStyle = 'rgba(65,102,120,0.9)';
    g.strokeText(label, W / 2, H / 2 + 8);
    g.fillStyle = '#ffffff';
    g.fillText(label, W / 2, H / 2 + 8);

    const t = texFromCanvas(c);
    cache.set(key, t);
    return t;
}

/* -------------------------------- meshes -------------------------------- */

interface Geom { positions: number[]; normals: number[]; uvs: number[]; colors: number[]; indices: number[]; }

function emptyGeom(): Geom { return { positions: [], normals: [], uvs: [], colors: [], indices: [] }; }

function pushGeom(dst: Geom, src: any, m: Mat4) {
    const base = dst.positions.length / 3;
    const p = src.positions as ArrayLike<number>;
    const n = src.normals as ArrayLike<number>;
    const uv = src.uvs as ArrayLike<number> | undefined;
    const v = new Vec3();
    const nm = new Mat4();
    Mat4.invert(nm, m);
    Mat4.transpose(nm, nm);
    for (let i = 0; i < p.length; i += 3) {
        Vec3.set(v, p[i], p[i + 1], p[i + 2]);
        v.transformMat4(m);
        dst.positions.push(v.x, v.y, v.z);

        let nx = 0, ny = 1, nz = 0;
        if (n && n.length) {
            Vec3.set(v, n[i], n[i + 1], n[i + 2]);
            v.transformMat4(nm);
            v.normalize();
            nx = v.x; ny = v.y; nz = v.z;
        }
        dst.normals.push(nx, ny, nz);
        // bake a soft lambert term into the vertex colour
        const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
        const shade = 0.58 + 0.42 * d;
        dst.colors.push(shade, shade, shade, 1);
    }
    if (uv && uv.length) {
        for (let i = 0; i < uv.length; i++) dst.uvs.push(uv[i]);
    } else {
        for (let i = 0; i < p.length / 3; i++) dst.uvs.push(0, 0);
    }
    const idx = src.indices as ArrayLike<number>;
    for (let i = 0; i < idx.length; i++) dst.indices.push(base + idx[i]);
}

function trs(pos: Vec3, rotZ = 0, scale: Vec3 = new Vec3(1, 1, 1)): Mat4 {
    const m = new Mat4();
    const q = new Quat();
    Quat.fromEuler(q, 0, 0, rotZ);
    Mat4.fromRTS(m, q, pos, scale);
    return m;
}

export function meshFromGeom(g: Geom): Mesh {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < g.positions.length; i += 3) {
        minX = Math.min(minX, g.positions[i]); maxX = Math.max(maxX, g.positions[i]);
        minY = Math.min(minY, g.positions[i + 1]); maxY = Math.max(maxY, g.positions[i + 1]);
        minZ = Math.min(minZ, g.positions[i + 2]); maxZ = Math.max(maxZ, g.positions[i + 2]);
    }
    return utils.createMesh({
        positions: g.positions,
        normals: g.normals,
        uvs: g.uvs,
        colors: g.colors,
        indices: g.indices,
        minPos: new Vec3(minX, minY, minZ),
        maxPos: new Vec3(maxX, maxY, maxZ),
    });
}

export function stickmanMesh(frame = 0, stacked = false, action: 'run' | 'attack' | 'hurt' = 'run', gpu = false): Mesh {
    frame = ((frame % 16) + 16) % 16;
    const key = gpu ? 128 : stacked ? 16 : action==='attack' ? 32+frame : action==='hurt' ? 48+frame : frame;
    const cached = runnerMeshes.get(key);
    if (cached) return cached;
    const phase = frame / 16 * Math.PI * 2;
    const g = emptyGeom();
    if (!stacked) pushGeom(g, primitives.sphere(0.21,{segments:gpu?4:10}),trs(new Vec3(0,0.022,0),0,new Vec3(1.15,0.05,0.9)));
    if(gpu) for(let i=0;i<g.uvs.length;i+=2)g.uvs[i]=9;
    for (let i=0;i<g.colors.length;i+=4) { g.colors[i]=0.28; g.colors[i+1]=0.28; g.colors[i+2]=0.28; }
    const joint = (x: number, y: number, z: number, r: number) =>
        pushGeom(g, primitives.sphere(r, { segments: gpu?6:10 }), trs(new Vec3(x,y,z)));
    const limb = (a: Vec3, b: Vec3, radius: number, bone: number) => {
        const firstUV=g.uvs.length;
        const direction = new Vec3(); Vec3.subtract(direction, b, a);
        const len = direction.length(); direction.normalize();
        const q = new Quat(); Quat.rotationTo(q, new Vec3(0,1,0), direction);
        const mid = new Vec3(); Vec3.add(mid,a,b); mid.multiplyScalar(0.5);
        const m = new Mat4(); Mat4.fromRTS(m,q,mid,new Vec3(1,1,1));
        pushGeom(g, primitives.cylinder(radius,radius,len,{radialSegments:gpu?5:8}),m);
        if(!gpu){joint(a.x,a.y,a.z,radius); joint(b.x,b.y,b.z,radius);}
        if(gpu)for(let i=firstUV;i<g.uvs.length;i+=2)g.uvs[i]=bone;
    };
    const bodyUV=g.uvs.length;
    pushGeom(g, primitives.sphere(0.18,{segments:gpu?6:12}),trs(new Vec3(0,0.55,0),0,new Vec3(0.78,1.3,0.7)));
    joint(0,0.91,0,0.17);
    if(gpu)for(let i=bodyUV;i<g.uvs.length;i+=2)g.uvs[i]=0;
    for (const side of [-1,1]) {
        const swing = stacked ? 0 : Math.sin(phase + (side > 0 ? Math.PI : 0));
        const hip = new Vec3(side*0.085,0.43,0);
        const thigh = swing*0.72;
        const knee = new Vec3(hip.x,hip.y-Math.cos(thigh)*0.20,Math.sin(thigh)*0.20);
        const lower = thigh - (0.22 + Math.max(0,-swing)*1.15);
        const ankle = new Vec3(hip.x,knee.y-Math.cos(lower)*0.19,knee.z+Math.sin(lower)*0.19);
        limb(hip,knee,0.055,side<0?1:3); limb(knee,ankle,0.047,side<0?2:4);
        const shoulder = new Vec3(side*0.14,0.69,0);
        const arm = -swing*0.62;
        let elbow = stacked ? new Vec3(side*0.22,0.88,0) : new Vec3(side*0.2,0.69-Math.cos(arm)*0.17,Math.sin(arm)*0.17);
        let hand = stacked ? new Vec3(side*0.13,1.07,0) : new Vec3(side*0.2,elbow.y-0.09,elbow.z+0.12);
        if (!stacked && action==='attack') {
            const punch=Math.max(0,Math.sin(phase+(side>0?0:Math.PI)));
            elbow=new Vec3(side*0.21,0.77,0.13+punch*0.16);
            hand=new Vec3(side*0.12,0.83,0.22+punch*0.48);
        } else if (!stacked && action==='hurt') {
            elbow=new Vec3(side*0.3,0.8,-0.13);
            hand=new Vec3(side*0.38,0.63,-0.3);
        }
        limb(shoulder,elbow,0.045,side<0?5:7); limb(elbow,hand,0.04,side<0?6:8);
    }
    const mesh = meshFromGeom(g); runnerMeshes.set(key,mesh); return mesh;
}
const runnerMeshes = new Map<number,Mesh>();

export function spikePillarMesh(): Mesh {
    if (spikePillarCache) return spikePillarCache;
    const g = emptyGeom();
    pushGeom(g, primitives.cylinder(0.42, 0.5, 2.4, { radialSegments: 10 }), trs(new Vec3(0, 1.2, 0)));
    for (let ring = 0; ring < 3; ring++) {
        const y = 0.55 + ring * 0.72;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + ring * 0.4;
            const px = Math.cos(a) * 0.52, pz = Math.sin(a) * 0.52;
            const cone = primitives.cone(0.15, 0.42, { radialSegments: 6 });
            const m = new Mat4();
            const q = new Quat();
            Quat.fromEuler(q, 0, (-a * 180) / Math.PI, -90);
            Mat4.fromRTS(m, q, new Vec3(px, y, pz), new Vec3(1, 1, 1));
            pushGeom(g, cone, m);
        }
    }
    spikePillarCache = meshFromGeom(g);
    return spikePillarCache;
}
let spikePillarCache: Mesh | null = null;

export function mountainMesh(seed: number): Mesh {
    const g = emptyGeom();
    const r = 0.9 + (seed % 7) * 0.06;
    const h = 3.2 + (seed % 11) * 0.12;
    pushGeom(g, primitives.cylinder(r,r*1.06,h,{radialSegments:10,heightSegments:8}),trs(new Vec3(0,h/2,0)));
    pushGeom(g, primitives.sphere(r,{segments:10}),trs(new Vec3(0,h,0),0,new Vec3(1,0.52,1)));
    // White valley haze rising up the columns, baked into the vertex colours.
    for (let i=0;i<g.positions.length/3;i++) {
        const y = g.positions[i*3+1];
        const t = Math.max(0,Math.min(1,(y/h-0.04)/0.68));
        const shade = 0.8 + g.colors[i*4] * 0.2;
        const band = y>h*0.88 ? 0.88 : 1;
        g.colors[i*4] = .88*(1-t) + t*.34*shade*band;
        g.colors[i*4+1] = .95*(1-t) + t*.64*shade*band;
        g.colors[i*4+2] = .99*(1-t) + t*.82*shade;
    }
    return meshFromGeom(g);
}

/** Textured quad in the XY plane, facing -Z (towards the camera looking down the track). */
export function quadMesh(w: number, h: number): Mesh {
    const hw = w / 2, hh = h / 2;
    const g: Geom = {
        positions: [-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0],
        normals: [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1],
        // Camera faces +Z, so increasing world X appears left on screen.
        uvs: [1, 1, 0, 1, 0, 0, 1, 0],
        colors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        indices: [0, 2, 1, 0, 3, 2],
    };
    return meshFromGeom(g);
}

/** Flat quad in the XZ plane (ground decals) with UV repeat. */
export function groundQuadMesh(w: number, l: number, uRep = 1, vRep = 1): Mesh {
    const hw = w / 2, hl = l / 2;
    const g: Geom = {
        positions: [-hw, 0, -hl, hw, 0, -hl, hw, 0, hl, -hw, 0, hl],
        normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        uvs: [0, 0, uRep, 0, uRep, vRep, 0, vRep],
        colors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        indices: [0, 2, 1, 0, 3, 2],
    };
    return meshFromGeom(g);
}

/* ------------------------------ materials ------------------------------ */

const primCache = new Map<string, Mesh>();

/** Convert a `primitives.*` geometry into a real Mesh (cached by key). */
export function primMesh(geom: any, key?: string): Mesh {
    if (key && primCache.has(key)) return primCache.get(key)!;
    const g = emptyGeom();
    pushGeom(g, geom, new Mat4());
    const m = meshFromGeom(g);
    if (key) primCache.set(key, m);
    return m;
}

export function boxMesh(w = 1, h = 1, l = 1): Mesh {
    return primMesh(primitives.box({ width: w, height: h, length: l }), `box:${w}:${h}:${l}`);
}

export function coneMesh(radius = 0.4, height = 0.9, segments = 6): Mesh {
    return primMesh(primitives.cone(radius, height, { radialSegments: segments }), `cone:${radius}:${height}:${segments}`);
}

export function cylinderMesh(rTop = 0.3, rBottom = 0.3, height = 0.1, segments = 12): Mesh {
    return primMesh(primitives.cylinder(rTop, rBottom, height, { radialSegments: segments }),
        `cyl:${rTop}:${rBottom}:${height}:${segments}`);
}

let mintedCoin: Mesh | null = null;
/** Closed, two-sided coin, with a bevelled and reeded edge. One shared mesh. */
export function coinMesh(): Mesh {
    if(mintedCoin)return mintedCoin;
    const g=emptyGeom(),segments=40,faceRadius=.315;
    const vertex=(x:number,y:number,z:number,nx:number,ny:number,nz:number,u:number,v:number,shade=1)=>{
        const i=g.positions.length/3;g.positions.push(x,y,z);g.normals.push(nx,ny,nz);
        g.uvs.push(u,v);g.colors.push(shade,shade,shade,1);return i;
    };
    for(const side of [-1,1]){
        const center=vertex(0,0,side*.065,0,0,side,.25,.5);
        for(let i=0;i<=segments;i++){
            const a=i/segments*Math.PI*2,x=Math.cos(a)*faceRadius,y=Math.sin(a)*faceRadius;
            vertex(x,y,side*.065,0,0,side,(128+side*x/faceRadius*118)/512,(128-y/faceRadius*118)/256);
            if(i>0){const first=center+i,next=first+1;g.indices.push(center,side>0?first:next,side>0?next:first);}
        }
    }
    const profile=[[.315,-.065],[.34,-.043],[.34,.043],[.315,.065]];
    for(let band=0;band<profile.length-1;band++){
        const [ra,za]=profile[band],[rb,zb]=profile[band+1];
        const slope=-(rb-ra)/(zb-za),normalScale=1/Math.sqrt(1+slope*slope);
        for(let i=0;i<segments;i++){
            const base=g.positions.length/3;
            for(const [r,z] of [[ra,za],[rb,zb]])for(const k of [i,i+1]){
                const a=k/segments*Math.PI*2,cos=Math.cos(a),sin=Math.sin(a);
                vertex(cos*r,sin*r,z,cos*normalScale,sin*normalScale,slope*normalScale,.75,.5-sin*.46,band===1 && i%2===0?.82:1);
            }
            g.indices.push(base,base+1,base+2,base+1,base+3,base+2);
        }
    }
    mintedCoin=meshFromGeom(g);return mintedCoin;
}

const matCache = new Map<string, Material>();
export function coinMaterial(): Material {
    const key='minted-coin';if(matCache.has(key))return matCache.get(key)!;
    const material=new Material();
    material.initialize({effectName:'builtin-unlit',defines:{USE_TEXTURE:true,USE_VERTEX_COLOR:true,USE_INSTANCING:true}});
    material.setProperty('mainTexture',coinAtlas());material.setProperty('mainColor',new Color(255,255,255,255));
    matCache.set(key,material);return material;
}
let crowdEffect: EffectAsset | null = null;

/** Load once before creating squads; ordinary meshes remain a safe fallback. */
export function loadCrowdMotion(): Promise<void> {
    return new Promise(resolve=>resources.load('crowd-motion',EffectAsset,(err,effect)=>{
        if(!err && director.root?.device.hasFeature(gfx.Feature.INSTANCED_ARRAYS)) crowdEffect=effect;
        resolve();
    }));
}

export function crowdMaterial(color: Color): Material | null {
    if(!crowdEffect) return null;
    const key='motion:'+color.toHEX();
    if(matCache.has(key))return matCache.get(key)!;
    const m=new Material();m.initialize({effectAsset:crowdEffect,defines:{USE_INSTANCING:true}});
    m.setProperty('mainColor',color);matCache.set(key,m);return m;
}

/** Vertex-coloured flat material (shading comes from baked vertex colours). */
export function litMaterial(color: Color, instanced = false): Material {
    const key = 'vc:' + color.toHEX() + (instanced?':actors':'');
    const found = matCache.get(key);
    if (found) return found;
    const m = new Material();
    m.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: instanced } as any });
    m.setProperty('mainColor', color);
    matCache.set(key, m);
    return m;
}

/** Single-colour or textured material. */
export function unlitMaterial(color: Color, texture?: Texture2D): Material {
    if (texture) {
        const m = new Material();
        m.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } as any });
        m.setProperty('mainColor', color);
        m.setProperty('mainTexture', texture);
        return m;
    }
    const key = 'flat:' + color.toHEX();
    const found = matCache.get(key);
    if (found) return found;
    const m = new Material();
    m.initialize({ effectName: 'builtin-unlit' });
    m.setProperty('mainColor', color);
    matCache.set(key, m);
    return m;
}
