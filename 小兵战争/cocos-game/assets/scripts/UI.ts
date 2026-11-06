import {
    Node, Label, UITransform, Graphics, Color, view, Vec3, Camera, Layers, Sprite, SpriteFrame,
} from 'cc';
import { T, fmt, SKIN_PRICES, SKIN_COLORS, UPGRADES, upgradePrice, UpgradeDef, SaveData, manualSlots, CREATOR } from './Data';
import * as Art from './Art';

const UI_LAYER = Layers.Enum.UI_2D;
const FONT = 'Microsoft YaHei';

export function c(hexStr: string, a = 255): Color {
    const v = hexStr.replace('#', '');
    return new Color(parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), a);
}

export function roundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.min(r, w / 2, h / 2);
    g.roundRect(x - w / 2, y - h / 2, w, h, rr);
}

export function filledPanel(parent: Node, w: number, h: number, fill: Color, radius = 18, stroke?: Color, strokeW = 4): Node {
    const n = new Node('Panel');
    n.layer = UI_LAYER;
    n.setParent(parent);
    n.addComponent(UITransform).setContentSize(w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = fill;
    roundRect(g, 0, 0, w, h, radius);
    g.fill();
    if (stroke) {
        g.strokeColor = stroke;
        g.lineWidth = strokeW;
        roundRect(g, 0, 0, w, h, radius);
        g.stroke();
    }
    return n;
}

export function text(parent: Node, str: string, size: number, color: Color, bold = false, name = 'Text'): Label {
    const n = new Node(name);
    n.layer = UI_LAYER;
    n.setParent(parent);
    const ut = n.addComponent(UITransform);
    ut.setContentSize(size * str.length * 1.1 + 20, size * 1.5);
    const lb = n.addComponent(Label);
    lb.string = str;
    lb.fontSize = size;
    lb.lineHeight = Math.round(size * 1.22);
    lb.color = color;
    lb.useSystemFont = true;
    lb.fontFamily = FONT;
    lb.isBold = bold;
    lb.horizontalAlign = Label.HorizontalAlign.CENTER;
    lb.verticalAlign = Label.VerticalAlign.CENTER;
    lb.overflow = Label.Overflow.NONE;
    return lb;
}

let coinFrame: SpriteFrame | null = null;
export function coinIcon(parent: Node, size: number): Node {
    const n = new Node('CoinIcon');
    n.layer = UI_LAYER;
    n.setParent(parent);
    n.addComponent(UITransform).setContentSize(size, size);
    if(!coinFrame){coinFrame=new SpriteFrame();coinFrame.texture=Art.coinIconTexture();}
    const sprite=n.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.spriteFrame=coinFrame;
    return n;
}

/* ------------------------------------------------------------------ UI --- */

export interface UiHandlers {
    onPlay(): void;
    onNextLevel(): void;
    onRetry(): void;
    onRevive(): void;
    onMenu(): void;
    onBuyUpgrade(key: 'units' | 'income'): void;
    onSelectSkin(index: number): void;
    onToggleSound(): void;
    onSave(): void;
    onArchives(): void;
    onCredits(): void;
    onSaveSlot(index: number): void;
    onLoadSlot(index: number): void;
    onRecover(): void;
    onOpenCreator(): void;
}

export class UI {
    mainMenuOpen = false;
    private rerenderMenu: (()=>void) | null = null;
    canvas: Node;
    camera: Camera;
    private hudRoot: Node;
    private modal: Node | null = null;
    private coinLabel: Label | null = null;
    private levelLabel: Label | null = null;
    private countBubble: Node | null = null;
    private countLabel: Label | null = null;
    private enemyBubble: Node | null = null;
    private enemyLabel: Label | null = null;
    private progressFill: Graphics | null = null;
    private progressW = 520;
    private progressH = 14;
    private progressChip: Node | null = null;
    private hintLabel: Label | null = null;
    private bonusHint = false;
    private chipRow: Node | null = null;
    private lastChips = '';
    private w = 1280;
    private h = 720;

    constructor(canvas: Node, camera: Camera) {
        this.canvas = canvas;
        this.camera = camera;
        this.hudRoot = new Node('HUD');
        this.hudRoot.layer = UI_LAYER;
        this.hudRoot.setParent(canvas);
        this.hudRoot.addComponent(UITransform).setContentSize(100, 100);
        this.buildHud();
        this.layout();
    }

    /* ------------------------------- HUD -------------------------------- */

    private buildHud() {
        const root = this.hudRoot;

        // coin chip (top right)
        const chip = filledPanel(root, 150, 50, c('#244B6D', 220), 25, c('#83B9D9', 255), 3);
        chip.name = 'CoinChip';
        const icon = coinIcon(chip, 34);
        icon.setPosition(-48, 0, 0);
        this.coinLabel = text(chip, '0', 28, c('#FFFFFF'), true);
        this.coinLabel.node.setPosition(14, 0, 0);

        // level chip (top left)
        const lv = filledPanel(root, 140, 46, c('#244B6D', 200), 23, c('#83B9D9', 255), 3);
        lv.name = 'LevelChip';
        this.levelLabel = text(lv, T.level(1), 24, c('#FFFFFF'), true);

        // progress bar
        const bar = new Node('Bar');
        bar.layer = UI_LAYER;
        bar.setParent(root);
        bar.addComponent(UITransform).setContentSize(this.progressW, this.progressH);
        const bg = bar.addComponent(Graphics);
        bg.fillColor = c('#FFFFFF', 235);
        roundRect(bg, 0, 0, this.progressW, this.progressH, this.progressH / 2);
        bg.fill();
        bg.strokeColor = c('#C9D3E0');
        bg.lineWidth = 3;
        roundRect(bg, 0, 0, this.progressW, this.progressH, this.progressH / 2);
        bg.stroke();

        const fillNode = new Node('Fill');
        fillNode.layer = UI_LAYER;
        fillNode.setParent(bar);
        fillNode.addComponent(UITransform).setContentSize(this.progressW, this.progressH);
        this.progressFill = fillNode.addComponent(Graphics);
        this.progressChip = new Node('Marker');this.progressChip.layer=UI_LAYER;this.progressChip.setParent(bar);
        this.progressChip.addComponent(UITransform).setContentSize(24,24);
        const marker=this.progressChip.addComponent(Graphics);
        marker.fillColor=c('#FFFFFF');marker.circle(0,0,11);marker.fill();
        marker.fillColor=c('#2F9BF2');marker.circle(0,0,8);marker.fill();
        marker.fillColor=c('#FFFFFF');marker.moveTo(-2,-4);marker.lineTo(4,0);marker.lineTo(-2,4);marker.close();marker.fill();

        // gate preview chips container
        this.chipRow = new Node('Chips');
        this.chipRow.layer = UI_LAYER;
        this.chipRow.setParent(root);
        this.chipRow.addComponent(UITransform).setContentSize(300, 40);

        // world-anchored count bubble
        this.countBubble = this.makeBubble(root, c('#2F9BF2'), c('#8FD4FF'));
        this.countLabel = text(this.countBubble, '1', 24, c('#FFFFFF'), true);

        // enemy bubble
        this.enemyBubble = this.makeBubble(root, c('#F2453D'), c('#FFC0BA'));
        this.enemyLabel = text(this.enemyBubble, '0', 24, c('#FFFFFF'), true);
        this.enemyBubble.active = false;

        // bottom hint
        this.hintLabel = text(root, T.moveHint, 26, c('#5B6478'), true);
        this.hintLabel.node.active = false;
    }

    private makeBubble(parent: Node, fill: Color, stroke: Color): Node {
        const n = new Node('Bubble');
        n.layer = UI_LAYER;
        n.setParent(parent);
        n.addComponent(UITransform).setContentSize(68, 48);
        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        roundRect(g, 0, 8, 62, 40, 12);
        g.fill();
        // tail
        g.moveTo(-9, -14);
        g.lineTo(9, -14);
        g.lineTo(0, -30);
        g.close();
        g.fill();
        g.strokeColor = stroke;
        g.lineWidth = 3;
        roundRect(g, 0, 8, 62, 40, 12);
        g.stroke();
        return n;
    }

    layout(w?: number, h?: number) {
        const oldW=this.w,oldH=this.h;
        const vs = view.getVisibleSize();
        this.w = w ?? vs.width;
        this.h = h ?? vs.height;
        const W = this.w, H = this.h;
        const halfW = W / 2, halfH = H / 2;

        const chip = this.hudRoot.getChildByName('CoinChip');
        if (chip) chip.setPosition(halfW - 80, halfH - 52, 0);
        const lv = this.hudRoot.getChildByName('LevelChip');
        if (lv) lv.setPosition(-halfW + 76, halfH - 52, 0);

        const bar = this.hudRoot.getChildByName('Bar');
        this.progressW = Math.max(24, Math.min(560, W - 360));
        this.progressH = 16;
        if (bar) {
            bar.active = W >= 600;
            bar.setPosition(0, halfH - 52, 0);
            const ut = bar.getComponent(UITransform)!;
            ut.setContentSize(this.progressW, this.progressH);
            const bg = bar.getComponent(Graphics)!;
            bg.clear();
            bg.fillColor = c('#FFFFFF', 235);
            roundRect(bg, 0, 0, this.progressW, this.progressH, this.progressH / 2);
            bg.fill();
            bg.strokeColor = c('#C9D3E0');
            bg.lineWidth = 3;
            roundRect(bg, 0, 0, this.progressW, this.progressH, this.progressH / 2);
            bg.stroke();
            if (this.progressChip) this.progressChip.setPosition(this.progressW / 2 + 22, 0, 0);
        }

        if (this.chipRow) this.chipRow.setPosition(0, halfH - 100, 0);
        if (this.modal && this.rerenderMenu && (oldW!==this.w || oldH!==this.h)) this.rerenderMenu();
        else if (this.modal) this.fitModal();
        this.layoutHint();
    }

    setCoins(n: number) {
        if (this.coinLabel) this.coinLabel.string = fmt(n);
    }

    setLevel(n: number) {
        if (this.levelLabel) this.levelLabel.string = T.level(n);
    }

    setProgress(t: number) {
        if (!this.progressFill) return;
        const g = this.progressFill;
        const w = (this.progressW - 8) * Math.max(0, Math.min(1, t));
        g.clear();
        if (w <= 1) return;
        g.fillColor = c('#4BB9F5');
        roundRect(g, -this.progressW / 2 + 4 + w / 2 - w / 2 + w / 2, 0, w, this.progressH - 8, (this.progressH - 8) / 2);
        g.fill();
        if (this.progressChip) this.progressChip.setPosition(-this.progressW / 2 + 4 + w, 0, 0);
    }

    setGateChips(chips: string[][]) {
        const key = chips.map(c => c.join('|')).join(',');
        if (key === this.lastChips || !this.chipRow) return;
        this.lastChips = key;
        this.chipRow.destroyAllChildren();
        let x = 0;
        const total = chips.length;
        for (let i = 0; i < total; i++) {
            const pair = chips[i];
            for (let s = 0; s < 2; s++) {
                const val = pair[s];
                const bad = val.startsWith('-') || val.startsWith('÷');
                const p = filledPanel(this.chipRow, 62, 26, bad ? c('#F2453D', 210) : c('#26C6C9', 210), 8, c('#FFFFFF', 200), 2);
                p.setPosition(x - (total * 2 * 66) / 2 + 33, 0, 0);
                const lb = text(p, val, 18, c('#FFFFFF'), true);
                lb.node.setPosition(0, 0, 0);
                x += 66;
            }
            x += 6;
        }
    }

    /** Project a world position to HUD space and place the bubble. */
    placeBubble(node: Node | null, label: Label | null, world: Vec3, value: number, offsetY: number) {
        if (!node) return;
        const sp = this.camera.worldToScreen(world);
        const vs = view.getVisibleSize();
        const wx = (sp.x / view.getVisibleSizeInPixel().width) * vs.width - vs.width / 2;
        const wy = (sp.y / view.getVisibleSizeInPixel().height) * vs.height - vs.height / 2;
        node.setPosition(wx, wy + offsetY, 0);
        node.active = value > 0;
        if (label) label.string = fmt(value);
    }

    setBonusHint(message: string) {
        this.bonusHint=true;
        if (this.hintLabel) { this.hintLabel.string = message; this.hintLabel.node.active = true; }
        this.layoutHint();
    }

    setHint(v: boolean) {
        this.bonusHint=false;
        if (this.hintLabel) { this.hintLabel.string = T.moveHint; this.hintLabel.node.active = v; }
        this.layoutHint();
    }

    private layoutHint() {
        if (!this.hintLabel) return;
        this.hintLabel.fontSize=this.bonusHint ? (this.w<600?18:24) : 26;
        this.hintLabel.node.setPosition(0,this.bonusHint ? this.h/2-102 : -this.h/2+70,0);
    }

    get playerBubble(): Node | null { return this.countBubble; }
    get playerBubbleLabel(): Label | null { return this.countLabel; }
    get foeBubble(): Node | null { return this.enemyBubble; }
    get foeBubbleLabel(): Label | null { return this.enemyLabel; }

    /* ----------------------------- windows ------------------------------ */

    clearModal() {
        this.mainMenuOpen=false;this.rerenderMenu=null;
        if (this.modal) {
            this.modal.destroy();
            this.modal = null;
        }
    }

    private fitModal() {
        if (!this.modal) return;
        const panel = this.modal.getChildByName('Panel');
        const size = panel?.getComponent(UITransform)?.contentSize;
        if (panel && size) {
            const scale = Math.min(1, Math.max(0.1, (this.w - 32) / size.width), Math.max(0.1, (this.h - 32) / size.height));
            panel.setScale(scale, scale, 1);
        }
        const dim = this.modal.getChildByName('Dim');
        const g = dim?.getComponent(Graphics);
        if (dim && g) {
            dim.getComponent(UITransform)?.setContentSize(this.w, this.h);
            g.clear(); g.fillColor = c('#101828', 110);
            g.rect(-this.w / 2, -this.h / 2, this.w, this.h); g.fill();
        }
        this.modal.getComponent(UITransform)?.setContentSize(this.w, this.h);
    }

    private modalRoot(): Node {
        this.clearModal();
        const n = new Node('Modal');
        n.layer = UI_LAYER;
        n.setParent(this.canvas);
        n.addComponent(UITransform).setContentSize(this.w, this.h);
        // dim background
        const dim = new Node('Dim');
        dim.layer = UI_LAYER;
        dim.setParent(n);
        dim.addComponent(UITransform).setContentSize(this.w, this.h);
        const dg = dim.addComponent(Graphics);
        dg.fillColor = c('#101828', 110);
        dg.rect(-this.w / 2, -this.h / 2, this.w, this.h);
        dg.fill();
        this.modal = n;
        return n;
    }

    button(parent: Node, label: string, w: number, h: number, bg: string, fg: string, onClick: () => void, sub?: string): Node {
        const n = filledPanel(parent, w, h, c(bg), 16, c('#FFFFFF', 90), 3);
        const g=n.getComponent(Graphics)!,base=c(bg);
        g.clear();g.fillColor=new Color(base.r*.76,base.g*.76,base.b*.8,255);
        roundRect(g,0,-4,w,h,16);g.fill();
        g.fillColor=base;roundRect(g,0,0,w,h,16);g.fill();
        g.strokeColor=c('#FFFFFF',110);g.lineWidth=2;
        g.moveTo(-w/2+18,h/2-3);g.lineTo(w/2-18,h/2-3);g.stroke();
        const lb = text(n, label, Math.round(h * 0.42), c(fg), true);
        lb.node.setPosition(0, sub ? h * 0.12 : 0, 0);
        if (sub) {
            const s = text(n, sub, Math.round(h * 0.19), c(fg, 225));
            s.node.setPosition(0, -h * 0.24, 0);
        }
        n.on(Node.EventType.TOUCH_START,()=>n.setScale(.97,.97,1));
        n.on(Node.EventType.TOUCH_CANCEL,()=>n.setScale(1,1,1));
        n.on(Node.EventType.TOUCH_END, (e) => { n.setScale(1,1,1);e.propagationStopped = true; onClick(); });
        return n;
    }

    showMenu(save: SaveData, handlers: UiHandlers) {
        if (this.w < 600) { this.showPortraitMenu(save, handlers); return; }
        const root = this.modalRoot();
        this.mainMenuOpen=true;this.rerenderMenu=()=>this.showMenu(save,handlers);
        const panelW = 760;
        const panelH = 640;
        const p = filledPanel(root, panelW, panelH, c('#F8FCFF', 250), 28, c('#BED8EB'), 3);
        p.setPosition(0, 0, 0);
        this.fitModal();

        const title = text(p, T.title, 58, c('#244263'), true);
        title.node.setPosition(0, 258, 0);
        const sub = text(p, T.subtitle, 20, c('#617D96'));
        sub.node.setPosition(0, 210, 0);

        // coin + level row
        const coinRow = filledPanel(p, 220, 46, c('#FFF6DA'), 23, c('#FFD66B'), 3);
        coinRow.setPosition(-116, 160, 0);
        coinIcon(coinRow, 30).setPosition(-72, 0, 0);
        const coinLb = text(coinRow, fmt(save.coins), 24, c('#8A5A00'), true);
        coinLb.node.setPosition(10, 0, 0);

        const lvRow = filledPanel(p, 220, 46, c('#E8F3FF'), 23, c('#9CCBF5'), 3);
        lvRow.setPosition(116, 160, 0);
        const lvLb = text(lvRow, T.level(save.level), 24, c('#14568F'), true);

        // play button
        const play = this.button(p, T.play, 300, 70, '#347DDE', '#FFFFFF', handlers.onPlay);
        play.setPosition(0, -198, 0);
        const saved = text(p, '通关自动保存 · 可在存档管理中备份', 17, c('#617D96'));
        saved.node.setPosition(0, -246, 0);

        // upgrades
        const rowY = [92, 14];
        for (let ui = 0; ui < UPGRADES.length; ui++) {
            const def = UPGRADES[ui];
            const lvl = save[def.key];
            const maxed = lvl >= def.max;
            const price = upgradePrice(def, lvl);
            const row = filledPanel(p, panelW - 100, 72, c('#EDF4FA'), 14, c('#D6E4F0'), 2);
            row.setPosition(0, rowY[ui] ?? 0, 0);
            const name = text(row, def.name, 24, c('#244263'), true);
            name.node.setPosition(-(panelW - 100) / 2 + 90, 12, 0);
            const info = text(row, `${T.lvlShort(lvl)}${maxed ? '  ' + T.max : ''}`, 18, c('#70889D'));
            info.node.setPosition(-(panelW - 100) / 2 + 90, -18, 0);

            if (!maxed) {
                const btn = this.button(row, fmt(price), 140, 52, '#FFB300', '#4A3200', () => handlers.onBuyUpgrade(def.key));
                btn.setPosition((panelW - 100) / 2 - 86, 0, 0);
                coinIcon(btn, 22).setPosition(-48, 0, 0);
                const bl = btn.getChildByName('Text')?.getComponent(Label);
                if (bl) bl.node.setPosition(10, 0, 0);
            } else {
                const done = text(row, T.max, 22, c('#9AA7BC'), true);
                done.node.setPosition((panelW - 100) / 2 - 86, 0, 0);
            }
        }

        // skins
        const skinTitle = text(p, T.skins, 21, c('#617D96'), true);
        skinTitle.node.setPosition(-panelW / 2 + 80, -39, 0);
        const skinRowY = -92;
        for (let i = 0; i < 3; i++) {
            const owned = save.ownedSkins.includes(i);
            const sel = save.skin === i;
            const card = filledPanel(p, 190, 74, sel ? c('#E1F2FF') : c('#E9F1F4'), 14, sel ? c('#53ACEB') : c('#C4D4DB'), sel ? 4 : 2);
            card.setPosition(-200 + i * 200, skinRowY, 0);
            const sw = new Node('Swatch');
            sw.layer = UI_LAYER;
            sw.setParent(card);
            sw.addComponent(UITransform).setContentSize(30, 30);
            const sg = sw.addComponent(Graphics);
            sg.fillColor = c(SKIN_COLORS[i]);
            sg.circle(0, 0, 15);
            sg.fill();
            sw.setPosition(-66, 0, 0);
            const nm = text(card, T.skinNames[i], 20, c('#28324A'), true);
            nm.node.setPosition(10, 8, 0);
            const st = text(card, sel ? T.equipped : (owned ? T.owned : fmt(SKIN_PRICES[i])), 16, c('#7A869D'));
            st.node.setPosition(10, -18, 0);
            card.on(Node.EventType.TOUCH_END, (e) => { e.propagationStopped = true; handlers.onSelectSkin(i); });
        }

        // settings toggle bottom-right
        const snd = this.button(p, `${T.sound}: ${save.muted ? T.off : T.on}`, 190, 44, '#E9EEF6', '#46506A', handlers.onToggleSound);
        snd.setPosition(210, -284, 0);
        this.button(p,'存档管理',190,44,'#35536B','#FFFFFF',handlers.onArchives).setPosition(-210,-284,0);
        this.button(p,'制作人介绍',190,44,'#E9EEF6','#46506A',handlers.onCredits).setPosition(0,-284,0);
    }

    private showPortraitMenu(save: SaveData, handlers: UiHandlers) {
        const root = this.modalRoot();
        this.mainMenuOpen=true;this.rerenderMenu=()=>this.showMenu(save,handlers);
        const panelW = Math.min(390, this.w - 24), panelH = 640;
        const p = filledPanel(root, panelW, panelH, c('#F8FCFF', 250), 22, c('#BED8EB'), 3);
        this.fitModal();
        const title = text(p, T.title, 42, c('#244263'), true);
        title.node.setPosition(0, 265, 0);
        const sub = text(p, '选择数字门，带领小兵冲向终点', 17, c('#617D96'));
        sub.node.setPosition(0, 225, 0);
        const info = filledPanel(p, panelW - 40, 42, c('#FFF6DA'), 18, c('#FFD66B'), 2);
        info.setPosition(0, 177, 0);
        const infoLabel = text(info, `${T.coins} ${fmt(save.coins)}     ${T.level(save.level)}`, 20, c('#66501A'), true);
        infoLabel.node.setPosition(0, 0, 0);
        for (let i = 0; i < UPGRADES.length; i++) {
            const def = UPGRADES[i], lvl = save[def.key];
            const row = filledPanel(p, panelW - 40, 64, c('#EDF4FA'), 14, c('#D6E4F0'), 2);
            row.setPosition(0, 113 - i * 72, 0);
            const name = text(row, def.name, 21, c('#244263'), true);
            name.node.setPosition(-(panelW - 40) / 2 + 64, 10, 0);
            const lv = text(row, T.lvlShort(lvl), 16, c('#70889D'));
            lv.node.setPosition(-(panelW - 40) / 2 + 64, -16, 0);
            const maxed = lvl >= def.max;
            const buy = this.button(row, maxed ? T.max : fmt(upgradePrice(def, lvl)), 94, 48,
                maxed ? '#DCE3ED' : '#FFB300', '#4A3200', () => handlers.onBuyUpgrade(def.key));
            buy.setPosition((panelW - 40) / 2 - 55, 0, 0);
        }
        const skins = text(p, T.skins, 20, c('#617D96'), true);
        skins.node.setPosition(-panelW / 2 + 45, -18, 0);
        const cardW = (panelW - 48) / 3;
        for (let i = 0; i < SKIN_PRICES.length; i++) {
            const selected = save.skin === i, owned = save.ownedSkins.includes(i);
            const card = filledPanel(p, cardW - 5, 74, selected ? c('#E6F6FF') : c('#F7F9FC'), 12,
                selected ? c('#4BB9F5') : c('#E0E8F4'), selected ? 3 : 2);
            card.setPosition((i - 1) * cardW, -70, 0);
            const swatch = card.getComponent(Graphics)!;
            swatch.fillColor = c(SKIN_COLORS[i]); swatch.circle(0, 18, 10); swatch.fill();
            const name = text(card, T.skinNames[i], 14, c('#28324A'), true); name.node.setPosition(0, -2, 0);
            const status = text(card, selected ? T.equipped : (owned ? T.owned : fmt(SKIN_PRICES[i])), 13, c('#7A869D'));
            status.node.setPosition(0, -22, 0);
            card.on(Node.EventType.TOUCH_END, (e) => { e.propagationStopped = true; handlers.onSelectSkin(i); });
        }
        const play = this.button(p, T.play, Math.min(260, panelW - 60), 62, '#347DDE', '#FFFFFF', handlers.onPlay);
        play.setPosition(0, -161, 0);
        const secondaryW=(panelW-52)/2;
        this.button(p,'存档管理',secondaryW,46,'#35536B','#FFFFFF',handlers.onArchives).setPosition(-(secondaryW+12)/2,-227,0);
        this.button(p,'制作人介绍',secondaryW,46,'#E9EEF6','#46506A',handlers.onCredits).setPosition((secondaryW+12)/2,-227,0);
        this.button(p,`${T.sound}: ${save.muted ? T.off : T.on}`,140,40,'#E9EEF6','#46506A',handlers.onToggleSound).setPosition(0,-283,0);
    }

    private pageText(parent:Node,str:string,size:number,width:number,y:number,color='#617D96',bold=false) {
        const label=text(parent,str,size,c(color),bold);
        label.overflow=Label.Overflow.CLAMP;label.enableWrapText=true;
        label.node.getComponent(UITransform)!.setContentSize(width,Math.ceil(str.split('\n').length*size*1.45));
        label.node.setPosition(0,y,0);return label;
    }

    showArchives(save:SaveData,handlers:UiHandlers) {
        const root=this.modalRoot();this.rerenderMenu=()=>this.showArchives(save,handlers);
        const width=this.w<600?Math.min(390,this.w-24):640;
        const p=filledPanel(root,width,688,c('#F8FCFF'),24,c('#BED8EB'),3);this.fitModal();
        this.pageText(p,'存档管理',32,width-32,303,'#244263',true);
        this.pageText(p,'自动保存 + 3 个独立手动存档',16,width-32,271);
        const cardWidth=width-40,current=filledPanel(p,cardWidth,72,c('#E8F3FF'),14,c('#BED8EB'),2);
        current.setPosition(0,219,0);
        const currentLine=this.pageText(current,`第 ${save.level} 关\n金币 ${fmt(save.coins)}`,18,cardWidth-130,0,'#244263',true);
        currentLine.horizontalAlign=Label.HorizontalAlign.LEFT;currentLine.node.setPosition(-49,0,0);
        this.button(current,'立即保存',90,44,'#347DDE','#FFFFFF',handlers.onSave).setPosition(cardWidth/2-58,0,0);
        const slots=manualSlots(save);
        slots.forEach((slot,index)=>{
            const card=filledPanel(p,cardWidth,114,c('#FFFFFF'),14,c('#D6E4F0'),2);card.setPosition(0,119-index*126,0);
            this.pageText(card,`存档 ${index+1} · ${slot?`第 ${slot.progress.level} 关`:'空'}`,20,cardWidth-24,35,'#244263',true);
            const date=slot?new Date(slot.savedAt):null;
            const stamp=date?`${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`:'';
            this.pageText(card,slot?`${fmt(slot.progress.coins)} 金币 · ${stamp}`:'尚未保存进度',16,cardWidth-24,10);
            const buttonW=(cardWidth-48)/2;
            const commit=()=>handlers.onSaveSlot(index),back=()=>this.showArchives(save,handlers);
            this.button(card,'保存',buttonW,42,'#35536B','#FFFFFF',()=>{
                if(slot)this.showConfirm(`覆盖存档 ${index+1}？`,'此槽位原有进度将被替换。\n其他槽位和当前进度不受影响。','确认覆盖',commit,back);
                else commit();
            }).setPosition(-(buttonW+12)/2,-30,0);
            this.button(card,'读取',buttonW,42,slot?'#347DDE':'#E3EAF1',slot?'#FFFFFF':'#8A9BAD',()=>{
                if(slot)this.showConfirm(`读取存档 ${index+1}？`,`将从第 ${slot.progress.level} 关起点继续。\n当前进度会保留为恢复备份。`,'确认读取',()=>handlers.onLoadSlot(index),back);
            }).setPosition((buttonW+12)/2,-30,0);
        });
        this.button(p,'恢复读取前的进度',width-64,44,save.recoverySave?'#E8F3FF':'#E3EAF1','#35536B',()=>{
            if(save.recoverySave)this.showConfirm('恢复读取前的进度？','恢复上一次读取前的关卡、金币与升级。\n当前进度仍会留作恢复备份。','确认恢复',handlers.onRecover,()=>this.showArchives(save,handlers));
        }).setPosition(0,-224,0);
        this.button(p,T.backMenu,Math.min(260,width-64),46,'#347DDE','#FFFFFF',handlers.onMenu).setPosition(0,-290,0);
    }

    showConfirm(title:string,message:string,action:string,onConfirm:()=>void,onCancel:()=>void) {
        const root=this.modalRoot();this.rerenderMenu=()=>this.showConfirm(title,message,action,onConfirm,onCancel);
        const width=this.w<600?Math.min(390,this.w-24):560;
        const p=filledPanel(root,width,330,c('#FFFFFF'),24,c('#BED8EB'),3);this.fitModal();
        this.pageText(p,title,27,width-32,108,'#244263',true);
        this.pageText(p,message,18,width-36,35);
        this.button(p,action,width-64,48,'#347DDE','#FFFFFF',onConfirm).setPosition(0,-50,0);
        this.button(p,'取消',width-64,44,'#E9EEF6','#46506A',onCancel).setPosition(0,-112,0);
    }

    showCredits(handlers:UiHandlers) {
        const root=this.modalRoot();this.rerenderMenu=()=>this.showCredits(handlers);
        const width=this.w<600?Math.min(390,this.w-24):560;
        const p=filledPanel(root,width,500,c('#F8FCFF'),24,c('#BED8EB'),3);this.fitModal();
        this.pageText(p,'制作人介绍',32,width-32,194,'#244263',true);
        const card=filledPanel(p,width-48,130,c('#E8F3FF'),18,c('#BED8EB'),2);card.setPosition(0,65,0);
        this.pageText(card,CREATOR.name,38,width-72,23,'#244263',true);
        this.pageText(card,'GitHub · 游戏制作人',18,width-72,-26);
        this.pageText(p,'感谢游玩，欢迎访问项目主页',18,width-36,-35);
        this.pageText(p,'GitHub · phdsx/minigame\n小兵战争',19,width-32,-80,'#347DDE',true);
        this.button(p,'访问游戏项目主页',width-64,50,'#347DDE','#FFFFFF',handlers.onOpenCreator).setPosition(0,-143,0);
        this.button(p,T.backMenu,width-64,46,'#E9EEF6','#46506A',handlers.onMenu).setPosition(0,-207,0);
    }

    showWin(level: number, coinsEarned: number, totalCoins: number, handlers: UiHandlers, multiplier = 1) {
        const root = this.modalRoot();
        const panelW = 560;
        const panelH = 450;
        const p = filledPanel(root, panelW, panelH, c('#FFFFFF', 250), 28, c('#CFE7FF'), 4);
        this.fitModal();
        const title = text(p, T.win, 52, c('#1F8DE0'), true);
        title.node.setPosition(0, panelH / 2 - 72, 0);
        const lv = text(p, T.level(level), 22, c('#8391AB'));
        lv.node.setPosition(0, panelH / 2 - 114, 0);

        const reward = filledPanel(p, panelW - 120, 84, c('#FFF7E0'), 18, c('#FFD66B'), 3);
        reward.setPosition(0, 40, 0);
        coinIcon(reward, 44).setPosition(-(panelW - 120) / 2 + 52, 0, 0);
        const rl = text(reward, `+${fmt(coinsEarned)}`, 38, c('#8A5A00'), true);
        rl.node.setPosition(4, 0, 0);

        const note = text(p, `冲刺倍率 ×${multiplier} · 奖励已入账`, 18, c('#347DDE'), true);
        note.node.setPosition(0, -22, 0);

        const next = this.button(p, T.nextLevel, 300, 70, '#347DDE', '#FFFFFF', handlers.onNextLevel);
        next.setPosition(0, -104, 0);

        const menu = this.button(p, T.backMenu, 170, 44, '#E9EEF6', '#46506A', handlers.onMenu);
        menu.setPosition(0, -182, 0);
    }

    showLose(level: number, reviveCost: number, canRevive: boolean, handlers: UiHandlers) {
        const root = this.modalRoot();
        const panelW = 560;
        const panelH = 470;
        const p = filledPanel(root, panelW, panelH, c('#FFFFFF', 250), 28, c('#FFD2CE'), 4);
        this.fitModal();
        const title = text(p, T.lose, 52, c('#E04338'), true);
        title.node.setPosition(0, panelH / 2 - 76, 0);
        const lv = text(p, T.level(level), 22, c('#8391AB'));
        lv.node.setPosition(0, panelH / 2 - 120, 0);

        const revive = this.button(p, T.revive, 360, 88, canRevive ? '#347DDE' : '#C9D2DE', '#FFFFFF', () => {
            if (canRevive) handlers.onRevive();
        }, canRevive ? T.reviveCost(reviveCost) : T.notEnough);
        revive.setPosition(0, 34, 0);

        const retry = this.button(p, T.retry, 300, 62, '#FFB300', '#4A3200', handlers.onRetry);
        retry.setPosition(0, -72, 0);

        const menu = this.button(p, T.backMenu, 170, 44, '#E9EEF6', '#46506A', handlers.onMenu);
        menu.setPosition(0, -156, 0);
    }

    showToast(msg: string) {
        const n = new Node('Toast');
        n.layer = UI_LAYER;
        n.setParent(this.canvas);
        n.addComponent(UITransform).setContentSize(400, 60);
        const p = filledPanel(n, 320, 56, c('#1F2A44', 230), 14);
        const lb = text(p, msg, 24, c('#FFFFFF'), true);
        n.setPosition(0, -this.h / 2 + 150, 0);
        n.setScale(0.9, 0.9, 1);
        const start = Date.now();
        const tick = () => {
            if (!n.isValid) return;
            const t = (Date.now() - start) / 1000;
            if (t > 1.4) { n.destroy(); return; }
            n.setScale(0.9 + Math.min(0.1, t * 0.6), 0.9 + Math.min(0.1, t * 0.6), 1);
            setTimeout(tick, 30);
        };
        tick();
    }
}
