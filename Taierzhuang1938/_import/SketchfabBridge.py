# -*- coding: utf-8 -*-
"""Standalone client for the BlenderMCP addon's Sketchfab integration.

The running Blender instance hosts the BlenderMCP addon (socket 127.0.0.1:9876)
which holds the user's Sketchfab API key and performs downloads inside Blender's
Python environment.  This script is a thin JSON-over-TCP client for the same
commands the blender-mcp MCP server uses, so the asset pipeline can fetch models
without an MCP client.

Usage:
    python SketchfabBridge.py status
    python SketchfabBridge.py search "type 38 arisaka" [--count 20]
    python SketchfabBridge.py download <uid>            # via addon (imports into Blender)
    python SketchfabBridge.py runpy <file.py>           # exec file inside Blender
"""

import argparse
import json
import os
import socket
import sys

HOST = "127.0.0.1"
PORT = 9876


def Call(cmd, timeout=900):
    s = socket.create_connection((HOST, PORT), timeout=10)
    s.settimeout(timeout)
    s.sendall(json.dumps(cmd).encode("utf-8"))
    buf = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
        try:
            return json.loads(buf.decode("utf-8"))
        except Exception:
            continue
    s.close()
    return {"status": "error", "message": "no response from BlenderMCP addon"}


def CompactSearch(results):
    out = []
    for r in results:
        out.append({
            "uid": r.get("uid"),
            "name": r.get("name"),
            "user": (r.get("user") or {}).get("username"),
            "license": (r.get("license") or {}).get("label"),
            "faceCount": r.get("faceCount"),
            "vertexCount": r.get("vertexCount"),
            "downloadable": r.get("isDownloadable"),
            "categories": [c.get("name") for c in (r.get("categories") or [])],
        })
    return out


def Main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("status")
    p = sub.add_parser("search")
    p.add_argument("query")
    p.add_argument("--count", type=int, default=20)
    p.add_argument("--categories", default=None)
    p.add_argument("--any-downloadable", action="store_true")

    p = sub.add_parser("download")
    p.add_argument("uid")
    p.add_argument("--normalize", action="store_true")
    p.add_argument("--size", type=float, default=1.0)

    p = sub.add_parser("runpy")
    p.add_argument("file")

    args = ap.parse_args()

    if args.cmd == "status":
        reply = Call({"type": "get_sketchfab_status", "params": {}})
        print(json.dumps(reply, ensure_ascii=False, indent=1))
        return 0 if reply.get("status") == "success" else 1

    if args.cmd == "search":
        reply = Call({"type": "search_sketchfab_models", "params": {
            "query": args.query,
            "count": args.count,
            "downloadable": not args.any_downloadable,
            **({"categories": args.categories} if args.categories else {}),
        }})
        if reply.get("status") != "success":
            print(json.dumps(reply, ensure_ascii=False, indent=1))
            return 1
        data = reply["result"]
        print(json.dumps({
            "query": args.query,
            "total": data.get("pagination", {}).get("total"),
            "results": CompactSearch(data.get("results", [])),
        }, ensure_ascii=False, indent=1))
        return 0

    if args.cmd == "runpy":
        with open(args.file, "r", encoding="utf-8") as fh:
            code = fh.read()
        reply = Call({"type": "execute_code", "params": {"code": code}})
        if reply.get("status") != "success":
            print(json.dumps(reply, ensure_ascii=False, indent=1))
            return 1
        print(reply["result"].get("result", ""))
        return 0

    if args.cmd == "download":
        reply = Call({"type": "download_sketchfab_model", "params": {
            "uid": args.uid,
            "normalize_size": args.normalize,
            "target_size": args.size,
        }})
        print(json.dumps(reply, ensure_ascii=False, indent=1))
        return 0 if reply.get("status") == "success" else 1

    return 2


if __name__ == "__main__":
    sys.exit(Main())
