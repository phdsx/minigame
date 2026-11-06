import { _decorator, Component } from 'cc';
import { Game } from './Game';
import { loadCrowdMotion } from './Art';
const { ccclass } = _decorator;

/** Scene entry point: boots the game on the Canvas node. */
@ccclass('GameMain')
export class GameMain extends Component {
    private game: Game | null = null;

    async start() {
        await loadCrowdMotion();
        if(!this.isValid)return;
        this.game = new Game(this.node);
        this.game.init();
    }

    update(dt: number) {
        this.game?.update(dt);
    }

    onDestroy() {
        this.game?.dispose();
    }
}
