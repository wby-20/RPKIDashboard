#!/usr/bin/env python3
"""Check direct, proxy-free access to every external API used by the dashboard."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def load_dotenv() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def checks() -> list[dict[str, object]]:
    cloudflare_headers = {}
    cloudflare_token = os.environ.get("CLOUDFLARE_API_TOKEN")
    if cloudflare_token:
        cloudflare_headers["Authorization"] = f"Bearer {cloudflare_token}"
    return [
        {"name": "RIPE public Routinator", "scope": "fast sync", "url": "https://rpki-validator.ripe.net/api/v1/status"},
        {"name": "RIPE trust-anchor history", "scope": "daily sync", "url": "https://lirportal.ripe.net/certification/content/static/statistics/afrinic.tal.txt"},
        {"name": "RouteViews API", "scope": "daily sync", "url": "https://api.routeviews.org/rib/collectors"},
        {"name": "RIPEstat API", "scope": "medium sync + browser ASN lookup", "url": "https://stat.ripe.net/data/as-overview/data.json?resource=AS3333"},
        {"name": "NIST RPKI Monitor", "scope": "medium sync", "url": "https://rpki-monitor.antd.nist.gov/ROV/All/4"},
        {"name": "Cloudflare Radar API", "scope": "medium sync", "url": "https://api.cloudflare.com/client/v4/user/tokens/verify", "headers": cloudflare_headers, "auth": bool(cloudflare_token)},
        {
            "name": "CAIDA AS Rank GraphQL",
            "scope": "daily sync + /api/asrank runtime proxy",
            "url": "https://api.asrank.caida.org/v2/graphql",
            "method": "POST",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"query": "{ asn(asn: \"13335\") { asn rank } }"}).encode("utf-8"),
        },
    ]


def run_check(item: dict[str, object], timeout: float) -> dict[str, object]:
    url = str(item["url"])
    hostname = urlparse(url).hostname
    started = time.monotonic()
    result = {"name": item["name"], "scope": item["scope"], "hostname": hostname, "ok": False}
    try:
        addresses = sorted({entry[4][0] for entry in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)})
        result["addresses"] = addresses[:4]
    except OSError as error:
        result["error"] = f"DNS: {error}"
        result["seconds"] = round(time.monotonic() - started, 3)
        return result

    request = urllib.request.Request(
        url,
        data=item.get("body"),
        headers={"User-Agent": "RPKI-Global-Observatory-Network-Check/0.1", **item.get("headers", {})},
        method=str(item.get("method", "GET")),
    )
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            sample = response.read(2048)
            result.update({"ok": 200 <= response.status < 400, "http": response.status, "sampleBytes": len(sample)})
    except urllib.error.HTTPError as error:
        # 401/403 still proves DNS, TCP and TLS reachability. Cloudflare without a token is expected to land here.
        result.update({"ok": error.code in (400, 401, 403), "http": error.code, "note": "reachable; authentication or request policy rejected the probe"})
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        result["error"] = str(error)
    result["seconds"] = round(time.monotonic() - started, 3)
    if item.get("name") == "Cloudflare Radar API" and not item.get("auth"):
        result["note"] = "host reachable; CLOUDFLARE_API_TOKEN was not configured for an authenticated check"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Check proxy-free access to dashboard data sources")
    parser.add_argument("--timeout", type=float, default=20.0, help="per-endpoint timeout in seconds")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args()
    load_dotenv()
    items = checks()
    with ThreadPoolExecutor(max_workers=len(items)) as executor:
        results = list(executor.map(lambda item: run_check(item, args.timeout), items))
    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        print(f"{'SOURCE':30} {'RESULT':8} {'HTTP':6} {'SECONDS':8} SCOPE")
        for result in results:
            print(f"{str(result['name']):30} {('PASS' if result['ok'] else 'FAIL'):8} {str(result.get('http', '-')):6} {str(result['seconds']):8} {result['scope']}")
            if result.get("error"):
                print(f"  {result['hostname']}: {result['error']}")
            elif result.get("note"):
                print(f"  {result['hostname']}: {result['note']}")
    return 0 if all(result["ok"] for result in results) else 2


if __name__ == "__main__":
    raise SystemExit(main())
