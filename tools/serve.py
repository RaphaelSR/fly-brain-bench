#!/usr/bin/env python3
"""Dev server for web/, with caching switched off.

Python's http.server sends no Cache-Control, so browsers fall back to heuristic
caching and happily keep a stale ES module or data file. That has cost this
project real debugging time more than once: an edited module simply does not
load, and the page fails in a way that looks like a logic bug rather than a
stale file. Everything here is served no-store.

    python3 tools/serve.py [port]
"""

import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):          # one line per request, no noise
        sys.stderr.write("%s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    handler = functools.partial(Handler, directory=ROOT)
    try:
        with Server(("127.0.0.1", PORT), handler) as httpd:
            print(f"serving {os.path.normpath(ROOT)} at http://127.0.0.1:{PORT}  (no-store)")
            httpd.serve_forever()
    except OSError as e:
        print(f"could not bind port {PORT}: {e}\ntry another: python3 tools/serve.py {PORT + 1}")
        sys.exit(1)
