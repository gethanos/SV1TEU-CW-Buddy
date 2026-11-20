#!/usr/bin/env python3
# Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU
# MIT License, see LICENSE.
"""
Serve SV1TEU CW Buddy from this repository, fully offline (e.g. on a Raspberry Pi).

  python3 scripts/serve.py                 # http://localhost:8000 (browser on the same machine)
  python3 scripts/serve.py --https         # https://<this-ip>:8443 (phones/tablets on the LAN)

Browsers only allow the microphone and AudioWorklet on https:// or on localhost.
--https creates a self-signed certificate in .certs/ on first run (needs the
openssl command); each device must accept the browser's certificate warning once.

Standard library only. MIME types are set explicitly, because the AI decoder
needs text/javascript for .mjs and application/wasm for .wasm.
"""
import argparse
import http.server
import os
import socket
import ssl
import subprocess
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CERT_DIR = ROOT / ".certs"

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".onnx": "application/octet-stream",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".md": "text/markdown; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME}

    def end_headers(self):
        path = self.path.split("?", 1)[0]
        if path.endswith("/") or path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()

    def log_message(self, fmt, *args):
        if not self.server.quiet:
            super().log_message(fmt, *args)


def lan_addresses():
    addrs = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("192.0.2.1", 9))  # no packet is sent; picks the default interface
        addrs.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            addrs.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in addrs if not a.startswith("127."))


def make_cert(cert, key, ips, hostnames):
    CERT_DIR.mkdir(exist_ok=True)
    san = ",".join([f"IP:{ip}" for ip in ["127.0.0.1", *ips]] +
                   [f"DNS:{h}" for h in ["localhost", *hostnames]])
    cmd = ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825",
           "-keyout", str(key), "-out", str(cert), "-subj", "/CN=SV1TEU CW Buddy",
           "-addext", f"subjectAltName={san}"]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except FileNotFoundError:
        sys.exit("openssl not found: install it (sudo apt install openssl) or pass --cert/--key")
    except subprocess.CalledProcessError as e:
        sys.exit("openssl failed:\n" + e.stderr.decode(errors="replace"))
    os.chmod(key, 0o600)
    print(f"Created self-signed certificate for: {san}")


def main():
    ap = argparse.ArgumentParser(description="Serve SV1TEU CW Buddy offline.")
    ap.add_argument("--https", action="store_true", help="serve over HTTPS (needed for phones on the LAN)")
    ap.add_argument("--port", type=int, help="port (default 8000, or 8443 with --https)")
    ap.add_argument("--bind", default="0.0.0.0", help="address to listen on (default 0.0.0.0)")
    ap.add_argument("--cert", help="certificate file (default .certs/cert.pem, created if missing)")
    ap.add_argument("--key", help="private key file (default .certs/key.pem, created if missing)")
    ap.add_argument("--hostname", action="append", default=[],
                    help="extra hostname for the certificate, e.g. cwbuddy.local (repeatable)")
    ap.add_argument("--new-cert", action="store_true", help="recreate the self-signed certificate")
    ap.add_argument("--quiet", action="store_true", help="don't log requests")
    args = ap.parse_args()

    port = args.port or (8443 if args.https else 8000)
    handler = partial(Handler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((args.bind, port), handler)
    httpd.quiet = args.quiet
    ips = lan_addresses()

    scheme = "http"
    if args.https:
        scheme = "https"
        cert = Path(args.cert) if args.cert else CERT_DIR / "cert.pem"
        key = Path(args.key) if args.key else CERT_DIR / "key.pem"
        if not args.cert and (args.new_cert or not cert.exists() or not key.exists()):
            make_cert(cert, key, ips, [socket.gethostname(), f"{socket.gethostname()}.local", *args.hostname])
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

    print(f"Serving {ROOT}")
    print(f"  {scheme}://localhost:{port}/")
    for ip in ips:
        note = "" if scheme == "https" else "   (no microphone: use --https for other devices)"
        print(f"  {scheme}://{ip}:{port}/{note}")
    if scheme == "https":
        print("  Self-signed certificate: accept the browser warning once per device.")
        print("  If the Pi's IP changes, rerun with --new-cert.")
    print("Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
