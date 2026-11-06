# 小兵战争

《小兵战争》是一款 3D 小兵集结跑酷游戏。带领蓝色队伍沿跑道前进，选择数字门壮大兵力，躲避机关，击败红色敌军与 BOSS，最后用剩余小兵搭起人塔、挑战终点阶梯。

[游戏项目主页](https://github.com/phdsx/minigame/tree/main/%E5%B0%8F%E5%85%B5%E6%88%98%E4%BA%89) · [返回游戏合集](../README.md)

## 玩法

- **选择路线**：数字门会增加、减少、倍增或分割队伍人数，提前选择更有利的一侧。
- **突破防线**：避开尖刺和旋转机关，保留足够兵力与敌军交战。
- **终点登阶**：到达终点后，小兵集合成人塔，逐层留下队员并向上攀登；剩余人数越多，越有机会获得最高 ×5 倍率并开启宝箱。
- **升级与装扮**：收集金币，提高起始兵力和金币收益，解锁不同小兵皮肤。

## 操作

| 操作 | 方式 |
| --- | --- |
| 左右移动 | 鼠标按住拖动、触屏拖动、A / D 或左右方向键 |
| 开始游戏 | 点击主菜单“开始游戏”，或在主菜单按空格 |
| 升级、皮肤、音效与存档 | 点击主菜单中的对应按钮 |

队伍会自动前进和交战。横屏、竖屏均可游玩。

## 运行

工程使用 **Cocos Creator 3.8.8**，游戏代码为 TypeScript。

1. 安装对应版本的 Cocos Creator，在编辑器中打开 `cocos-game/`。
2. 打开 `assets/Game.scene`，使用编辑器预览；也可在构建发布面板选择 **Web Mobile**，将输出目录设为 `cocos-game/build/`。
3. 构建完成后，双击本目录的 `启动游戏.bat`。启动器需要 Node.js 或 Python，会打开本地游戏页面；游玩期间保留启动器窗口。

也可在本目录的终端启动：

```powershell
node tools/serve.mjs 8099 cocos-game/build/web-mobile
```

使用 Python 时：

```powershell
python tools/serve.py 8099 cocos-game/build/web-mobile
```

默认地址为 `http://127.0.0.1:8099/`。端口被其他程序占用时，启动器会尝试附近的空闲端口，以终端实际显示的地址为准。请通过 HTTP 访问游戏。

## 构建

除编辑器构建外，Windows 下可指定 Cocos Creator 可执行文件，运行 Web 构建脚本：

```powershell
pwsh -File ./build-web.ps1 -CreatorPath "<Cocos Creator 3.8.8 可执行文件路径>"
```

也可将可执行文件路径设置到环境变量 `COCOS_CREATOR_PATH`，再运行 `pwsh -File ./build-web.ps1`。构建完成后按上述方式启动游戏。

工程支持 Cocos Creator 的 Android 构建目标。安卓开发需在本机配置 SDK、NDK、JDK 及签名；网页和安卓的存档各自独立。

## 存档

通关、购买升级或皮肤、切换音效时自动保存。主菜单“存档管理”提供立即保存、3 个独立手动槽位，以及恢复读取前进度的功能；覆盖和读取已有槽位前会确认。

存档记录关卡、金币、升级、皮肤和音效设置。退出后从当前关卡起点继续。通过本地启动器运行时，进度同时备份到本目录的 `小兵战争存档.json`；迁移本地游戏时可自行保留这份存档。部署为静态网站时，进度保存在当前浏览器中，清理浏览器数据可能导致进度丢失。

## 工程结构

| 路径 | 用途 |
| --- | --- |
| `cocos-game/assets/Game.scene` | 游戏入口场景 |
| `cocos-game/assets/scripts/` | 关卡、战斗、队伍、界面、存档与绘制代码 |
| `cocos-game/assets/resources/` | 人群动画着色器与音效资源 |
| `cocos-game/package.json` | Cocos Creator 工程信息 |
| `build-web.ps1` | Web 构建脚本 |
| `tools/serve.mjs`、`tools/serve.py` | 本地运行服务与存档备份 |
| `启动游戏.bat` | Windows 游戏启动入口 |
