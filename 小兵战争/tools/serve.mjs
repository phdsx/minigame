// 本地静态服务器：WebGL 构建需要通过 HTTP 访问（file:// 无法加载 wasm）
// 用法: node tools/serve.mjs [port] [dir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

let port = Number(process.argv[2] || 8099);
const firstPort = port;
const root = path.resolve(process.argv[3] || 'cocos-game/build/web-mobile');
const saveFile = path.resolve(root, '../../..', '小兵战争存档.json');
const rootToken = createHash('sha256').update(root.toLowerCase()).digest('hex');
const identity = { app: 'xiaobing-local', version: 1, rootToken };

function openGame(url) {
    if (process.env.XIAOBING_NO_OPEN === '1') return;
    const child = process.platform === 'win32'
        ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
        : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log('请在浏览器中打开:', url));
    child.unref();
}

function isOurServer(candidate) {
    return new Promise(resolve => {
        const request = http.get(`http://127.0.0.1:${candidate}/__health`, response => {
            let body = '';
            response.on('data', chunk => { body += chunk; if (body.length > 4096) request.destroy(); });
            response.on('end', () => {
                try { const data = JSON.parse(body); resolve(response.statusCode === 200 && data.app === identity.app && data.version === identity.version && data.rootToken === rootToken); }
                catch { resolve(false); }
            });
        });
        request.setTimeout(800, () => request.destroy());
        request.on('error', () => resolve(false));
    });
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.wasm': 'application/wasm',
    '.bin': 'application/octet-stream',
    '.cconb': 'application/octet-stream',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.ico': 'image/x-icon',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('找不到构建产物:', path.join(root, 'index.html'));
    console.error('请先运行 Cocos Creator 构建，或确认目录正确。');
    process.exit(1);
}

const server = http.createServer((req, res) => {
    if (req.url === '/__health') {
        res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(identity));
        return;
    }
    if (req.url === '/__save') {
        const origin = req.headers.origin;
        if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) {
            res.writeHead(403).end(); return;
        }
        if (req.method === 'GET') {
            try { const content = fs.readFileSync(saveFile, 'utf8'); JSON.parse(content); res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}).end(content); }
            catch { res.writeHead(404).end(); }
            return;
        }
        if (req.method === 'POST') {
            let body = ''; req.setEncoding('utf8');
            req.on('data', chunk => { body += chunk; if (body.length > 16384) req.destroy(); });
            req.on('end', () => {
                try {
                    const incoming = JSON.parse(body);
                    if (!incoming || typeof incoming !== 'object' || !Number.isFinite(incoming.savedAt)) throw Error('invalid');
                    try { const old = JSON.parse(fs.readFileSync(saveFile, 'utf8')); if ((old.savedAt || 0) > incoming.savedAt) { res.writeHead(409).end(); return; } } catch {}
                    const temp = saveFile + '.tmp'; fs.writeFileSync(temp, JSON.stringify(incoming), 'utf8'); fs.renameSync(temp, saveFile);
                    res.writeHead(204, {'Cache-Control':'no-store'}).end();
                } catch { res.writeHead(400).end(); }
            });
            return;
        }
        res.writeHead(405).end(); return;
    }
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) {
            // 单页回退
            file = path.join(root, 'index.html');
        }
        fs.readFile(file, (e, buf) => {
            if (e) { res.writeHead(404).end('not found'); return; }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                'Cache-Control': 'no-cache',
            });
            res.end(buf);
        });
    });
});

server.on('error', async error => {
    if (error.code !== 'EADDRINUSE') {
        console.error('本地服务器启动失败:', error.message); process.exitCode = 1; return;
    }
    if (await isOurServer(port)) {
        const url = `http://127.0.0.1:${port}/`;
        console.log('游戏服务已在运行，直接打开:', url);
        openGame(url);
        return;
    }
    if (port >= Math.min(65535, firstPort + 20)) {
        console.error('附近端口均被占用，请关闭不需要的本地服务后重试。'); process.exitCode = 1; return;
    }
    console.log(`端口 ${port} 已被其他服务占用，尝试 ${port + 1}。`);
    port++;
    server.listen(port, '127.0.0.1');
});

server.on('listening', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log('小兵战争 · 本地服务已启动');
    console.log('地址:', url);
    console.log('按 Ctrl+C 停止');
    openGame(url);
});
server.listen(port, '127.0.0.1');
