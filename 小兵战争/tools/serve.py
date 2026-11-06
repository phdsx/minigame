"""本地游戏服务器：静态文件与进度备份。"""
import http.server
import http.client
import json
import os
from pathlib import Path
import sys
import threading
import webbrowser
import hashlib
import errno
import urllib.request
import socket

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
root = Path(sys.argv[2] if len(sys.argv) > 2 else 'cocos-game/build/web-mobile').resolve()
save_file = root.parents[2] / '小兵战争存档.json'
identity = {'app': 'xiaobing-local', 'version': 1,
            'rootToken': hashlib.sha256(str(root).lower().encode()).hexdigest()}

class LocalServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def do_GET(self):
        if self.path == '/__health':
            data = json.dumps(identity).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.path != '/__save':
            return super().do_GET()
        try:
            data = save_file.read_bytes()
            json.loads(data)
        except (OSError, ValueError):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != '/__save':
            self.send_error(404)
            return
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{port}', f'http://localhost:{port}'):
            self.send_error(403)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 16384:
                raise ValueError('invalid length')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict) or not isinstance(data.get('savedAt'), (int, float)):
                raise ValueError('invalid save')
            try:
                old = json.loads(save_file.read_text(encoding='utf-8'))
                if old.get('savedAt', 0) > data['savedAt']:
                    self.send_error(409)
                    return
            except (OSError, ValueError, AttributeError):
                pass
            temp = save_file.with_suffix('.json.tmp')
            temp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            os.replace(temp, save_file)
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            self.send_error(400)
            return
        self.send_response(204)
        self.end_headers()

if not (root / 'index.html').is_file():
    raise SystemExit('找不到游戏构建，请先构建项目。')

def open_game(url):
    if os.environ.get('XIAOBING_NO_OPEN') != '1':
        webbrowser.open(url)

first_port = port
while True:
    try:
        server = LocalServer(('127.0.0.1', port), Handler)
        break
    except OSError as error:
        if error.errno not in (errno.EADDRINUSE, errno.EACCES, 10048, 10013) and getattr(error, 'winerror', None) not in (10048, 10013):
            raise SystemExit(f'本地服务器启动失败: {error}')
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/__health', timeout=0.8) as response:
                existing = json.loads(response.read(4096))
            if existing == identity:
                url = f'http://127.0.0.1:{port}/'
                print('游戏服务已在运行，直接打开:', url, flush=True)
                open_game(url)
                raise SystemExit(0)
        except (OSError, ValueError, http.client.HTTPException):
            pass
        if port >= min(65535, first_port + 20):
            raise SystemExit('附近端口均被占用，请关闭不需要的本地服务后重试。')
        print(f'端口 {port} 已被其他服务占用，尝试 {port + 1}。', flush=True)
        port += 1

with server:
    url = f'http://127.0.0.1:{port}/'
    print('小兵战争 · 本地服务已启动\n地址:', url, '\n按 Ctrl+C 停止', flush=True)
    threading.Timer(0.5, lambda: open_game(url)).start()
    server.serve_forever()
