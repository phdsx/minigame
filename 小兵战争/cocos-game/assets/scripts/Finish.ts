/** Ordinary actors keep this world scale while running, fighting and stacking. */
export const ACTOR_SCALE = 0.62;

/** Shared geometry for the stair faces and the tower's discrete ascent. */
export const FINISH = {
    runup: 8,
    tread: 2.6,
    rise: 0.72,
    clearance: 1.25,
    foot: 0.025,
    scale: ACTOR_SCALE,
    columns: 10,
    capacity: 70,
    depthSpacing: 0.3,
    spacing: 0.48,
    gatherZ: 3.4,
    gatherTime: 1.05,
    speed: 4.5,
    steps: 8,
};

export function stairFront(finish: number, index: number) {
    return finish + FINISH.runup + index * FINISH.tread;
}

/** Filled, supported layers: upper layers are never wider than those below. */
export function towerGroups(count: number): number[] {
    const groups: number[] = [];
    let remaining = count;
    let width=Math.min(FINISH.capacity,Math.ceil((Math.sqrt(8*count+1)-1)/2));
    while(remaining>0){
        const layer=Math.min(width,remaining);groups.push(layer);remaining-=layer;
        if(width>1 && remaining<=width*(width-1)/2)width--;
    }
    return groups;
}
