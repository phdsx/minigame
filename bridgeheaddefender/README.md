# 桥头防线 · Bridgehead Defender

一款竖屏 3D 自动射击闯关游戏。指挥蓝方小队沿桥面推进，左右移动瞄准数字牌、争取增援、击破补给桶，并躲避步兵和坦克的火力，逐步突破桥头防线。

当前 Web 版本为 **0.9.0**，使用 **Cocos Creator 3.8.8 + TypeScript** 开发。

[项目主页](https://github.com/phdsx/minigame/tree/main/bridgeheaddefender)

## 游戏内容

- **5 章 30 关**：从登陆战线到决战桥头，逐步增加侧翼敌军、交叉火力和坦克攻击。
- **射击扩军**：每颗实际命中数字牌的子弹使数值增加 1；通过绿色门补充士兵，通过红色门损失士兵，也可以选择绕开。
- **三种武器**：步枪持续连射，霰弹枪多发散射，重型狙击枪针对装甲；霰弹枪在解锁第 3 关后可用，重型狙击枪在解锁第 7 关后可用。
- **营地成长**：使用战斗获得的金币升级火力和初始兵力，编队最多容纳 48 名士兵。
- **进度保存**：自动保存金币、升级、解锁和武器选择；存档管理支持手动保存、JSON 导出与导入，以及撤销恢复。

## 操作

| 操作 | 鼠标 / 键盘 | 触屏 |
| --- | --- | --- |
| 左右移动 | 按住鼠标左右拖动，或 A / D、← / → | 左右拖动 |
| 射击 | 自动开火 | 自动开火 |
| 切换武器 | 点击底部武器按钮，或按 1 / 2 / 3 | 点击底部武器按钮 |
| 暂停 / 继续 | 空格，或点击暂停按钮 | 点击暂停按钮 |
| 重试 | R，或点击结算页面的重试按钮 | 点击重试按钮 |

留意红色瞄准提示，及时换边躲避炮弹。补给桶需要击破才能获得增援；数字牌只有可见靶面接受命中。

## 运行 Web 版

需要安装 Node.js 和 Cocos Creator **3.8.8**。在本目录打开 PowerShell。

1. 首次运行先构建：

   ```powershell
   .\tools\build.ps1 -Target web -Wait
   ```

   脚本默认查找系统 ProgramData 下的 Cocos Creator 3.8.8。安装位置不同，可通过 `-CreatorPath` 参数指定 `CocosCreator.exe`，或设置 `COCOS_CREATOR_PATH` 环境变量。也可以在 Cocos Creator 中打开 `game/`，构建 Web Mobile 平台，将构建输出设为 `game/build/web/`。

2. 双击 **打开网页试玩.cmd**，或执行：

   ```powershell
   node tools/start.cjs
   ```

   默认访问 [http://127.0.0.1:8786](http://127.0.0.1:8786)。如需手动管理服务：

   ```powershell
   node tools/serve.cjs
   ```

网页需要通过 HTTP 服务加载，不能直接双击构建目录中的 `index.html`。修改源代码后，请重新构建再刷新网页。

存档保存在当前浏览器的本地存储中；更换浏览器、端口或清除站点数据会影响存档访问，建议先在游戏内导出备份。

## 工程结构

- `game/assets/Main.scene`：游戏入口场景。
- `game/assets/scripts/Bridgehead.ts`：战斗、菜单、输入和呈现。
- `game/assets/scripts/Rules.ts`：关卡、武器、成长与存档规则。
- `game/assets/scripts/Art.ts`：程序化 3D 模型与动画。
- `game/assets/scripts/SaveFiles.ts`：存档文件导入和导出。
- `game/assets/resources/audio/`：游戏音乐与音效。
- `game/build-web.json`：Web 构建配置。
- `tools/build.ps1`、`tools/start.cjs`、`tools/serve.cjs`：构建与本地运行入口。

模型、动画、音乐与音效为本工程制作；引擎及其组件的版权归各自权利人所有。当前维护和运行说明以 Web 版为准。
