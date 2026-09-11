#!/usr/bin/env python3
"""mypage 用の簡易サーバー(Range 対応)。
`python3 -m http.server` は動画の途中読み出し(Range)に応えないため、プレーヤーの進度バーで飛べず、
順に流すしかなくなる。これはその置き換え。使い方: mypage の中で  python3 tools/serve.py 8931"""
import os, re, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.range = None
        path = self.translate_path(self.path)
        rng = self.headers.get('Range')
        if os.path.isdir(path) or not rng or not os.path.isfile(path):
            return super().send_head()
        m = re.match(r'bytes=(\d*)-(\d*)', rng)
        if not m:
            return super().send_head()
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, 'File not found'); return None
        size = os.fstat(f.fileno()).st_size
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if (m.group(1) and m.group(2)) else size - 1
        if start >= size:
            f.close(); self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.end_headers(); return None
        end = min(end, size - 1)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Last-Modified', self.date_time_string(os.fstat(f.fileno()).st_mtime))
        self.end_headers()
        f.seek(start)
        self.range = (start, end)
        return f

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def copyfile(self, source, outputfile):
        if not getattr(self, 'range', None):
            return super().copyfile(source, outputfile)
        remaining = self.range[1] - self.range[0] + 1
        while remaining > 0:
            chunk = source.read(min(1 << 16, remaining))
            if not chunk: break
            outputfile.write(chunk); remaining -= len(chunk)
        self.range = None

    def log_message(self, fmt, *args):
        pass   # 静かに

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    handler = partial(RangeHandler, directory=root)
    print(f'serving {root} on http://localhost:{port} (Range OK)')
    # 受付の列が既定(5)だと、画像を並行して読むときに溢れて接続が切られる(ERR_CONNECTION_RESET)ので広げる
    ThreadingHTTPServer.request_queue_size = 128
    ThreadingHTTPServer.daemon_threads = True
    ThreadingHTTPServer(('', port), handler).serve_forever()
