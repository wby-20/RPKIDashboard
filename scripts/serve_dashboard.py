#!/usr/bin/env python3
"""Serve the built dashboard and a narrowly scoped, cached CAIDA AS Rank proxy."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DIST_ROOT = PROJECT_ROOT / "dist"
CACHE_ROOT = PROJECT_ROOT / ".cache" / "asrank-proxy"
AS_RANK_ENDPOINT = "https://api.asrank.caida.org/v2/graphql"
MAX_REQUEST_BYTES = 64 * 1024


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "RPKIObservatory/0.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def send_json(self, status: int, payload: object, cache_status: str | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cache_status:
            self.send_header("X-ASRank-Cache", cache_status)
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802 - inherited API name
        if urlparse(self.path).path != "/api/asrank":
            self.send_json(404, {"error": "not found"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            self.send_json(413, {"error": "request body must be between 1 and 65536 bytes"})
            return

        try:
            request_body = self.rfile.read(content_length)
            payload = json.loads(request_body)
            if not isinstance(payload, dict) or not isinstance(payload.get("query"), str):
                raise ValueError("query must be a string")
            if len(payload["query"]) > 48 * 1024 or not isinstance(payload.get("variables", {}), dict):
                raise ValueError("invalid query or variables")
        except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
            return

        normalized = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        cache_key = hashlib.sha256(normalized).hexdigest()
        cache_path = CACHE_ROOT / f"{cache_key}.json"
        cache_ttl = int(os.environ.get("ASRANK_PROXY_CACHE_HOURS", "8")) * 60 * 60

        stale_payload = None
        try:
            if cache_path.exists():
                stale_payload = json.loads(cache_path.read_text(encoding="utf-8"))
                if time.time() - cache_path.stat().st_mtime < cache_ttl:
                    self.send_json(200, stale_payload, "HIT")
                    return
        except (OSError, json.JSONDecodeError):
            stale_payload = None

        upstream_request = urllib.request.Request(
            AS_RANK_ENDPOINT,
            data=normalized,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "RPKI-Global-Observatory/0.1",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(upstream_request, timeout=60) as response:
                upstream_payload = json.loads(response.read())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if stale_payload is not None:
                self.send_json(200, stale_payload, "STALE")
                return
            self.send_json(502, {"error": "CAIDA AS Rank upstream unavailable", "detail": str(error)})
            return

        try:
            CACHE_ROOT.mkdir(parents=True, exist_ok=True)
            temporary_path = cache_path.with_suffix(".json.tmp")
            temporary_path.write_text(json.dumps(upstream_payload, separators=(",", ":")), encoding="utf-8")
            temporary_path.replace(cache_path)
        except OSError:
            pass
        self.send_json(200, upstream_payload, "MISS")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the built RPKI Dashboard with a cached AS Rank proxy")
    parser.add_argument("--host", default=os.environ.get("DASHBOARD_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("DASHBOARD_PORT", "8000")))
    args = parser.parse_args()
    if not (DIST_ROOT / "index.html").exists():
        parser.error("dist/index.html does not exist; run npm run build first")
    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Serving {DIST_ROOT} at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
