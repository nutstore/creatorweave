#!/usr/bin/env python3
"""
简单的 HTTP 服务器，用于测试 WebContainer
提供必要的 COOP/COEP 头
"""

import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class WebContainerHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 添加 WebContainer 需要的头
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), WebContainerHandler) as httpd:
        print(f"🚀 WebContainer 测试服务器启动成功！")
        print(f"📍 目录: {DIRECTORY}")
        print(f"🔗 URL: http://localhost:{PORT}/")
        print(f"\n按 Ctrl+C 停止服务器\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n👋 服务器已停止")
