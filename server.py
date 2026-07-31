#!/usr/bin/env python3
"""本地部署服务器：静态文件服务 + 浏览器日志收集

- 所有响应带 Cache-Control: no-store（杜绝浏览器缓存旧版）
- POST /api/log       浏览器上报日志（JSON），追加到 logs/browser.log
- GET  /api/log?m=..  日志上报的 Image beacon 兜底
- GET  /api/logs      读取最近日志（诊断用）
- GET  /api/ping      健康检查
- 所有请求记录到 logs/access.log（含 User-Agent / Referer，可诊断缓存与来源问题）

运行：python3 server.py   （端口可用 PORT 环境变量覆盖，默认 8080）
"""
import json
import os
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.environ.get("GAME_LOG_DIR", os.path.join(BASE_DIR, "logs"))
BROWSER_LOG = os.path.join(LOG_DIR, "browser.log")
ACCESS_LOG = os.path.join(LOG_DIR, "access.log")
os.makedirs(LOG_DIR, exist_ok=True)


def now():
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())


def append_log(path, line):
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    # ---- 记录所有请求（诊断缓存 / 来源 / UA） ----
    def log_request(self, code="-", size="-"):
        line = (
            f"[{now()}] {self.client_address[0]} {self.command} {self.path} -> {code} "
            f"UA={self.headers.get('User-Agent', '')[:160]} "
            f"Referer={self.headers.get('Referer', '')[:120]}"
        )
        append_log(ACCESS_LOG, line)

    # ---- 禁用缓存 ----
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    # ---- 日志 API ----
    def do_POST(self):
        if self.path.startswith("/api/log"):
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length).decode("utf-8", "replace")
            self._save_log(body)
            self._json(200, {"ok": True})
            return
        self._json(404, {"ok": False, "error": "not found"})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/ping":
            self._json(200, {"ok": True, "time": now()})
            return
        if parsed.path == "/api/log":  # Image beacon 兜底
            q = urllib.parse.parse_qs(parsed.query)
            msg = q.get("m", [""])[0]
            if msg:
                self._save_log(msg)
            self._json(200, {"ok": True})
            return
        if parsed.path == "/api/logs":
            try:
                with open(BROWSER_LOG, "r", encoding="utf-8") as f:
                    data = f.read()
            except Exception:
                data = ""
            self._json(200, {"ok": True, "lines": len(data.splitlines()), "log": data[-20000:]})
            return
        super().do_GET()

    def _save_log(self, body):
        body = (body or "").strip()
        if not body:
            return
        if body.startswith("{"):
            try:
                line = json.dumps(json.loads(body), ensure_ascii=False)
            except Exception:
                line = body
        else:
            line = body
        append_log(BROWSER_LOG, f"[{now()}] {line}")

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[{now()}] 服务器已启动: http://0.0.0.0:{port}  日志目录: {LOG_DIR}")
    srv.serve_forever()
