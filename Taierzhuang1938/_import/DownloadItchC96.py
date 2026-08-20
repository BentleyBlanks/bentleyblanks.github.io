# One-shot: fetch itch.io CC0 Mauser C96 uploads.
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

here = Path(__file__).resolve().parent / "Source"
here.mkdir(parents=True, exist_ok=True)
ua_page = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
)
req_page = urllib.request.Request(
    "https://plewr.itch.io/mauser-c96-low-poly",
    headers={"User-Agent": ua_page},
)
with urllib.request.urlopen(req_page, timeout=30) as response:
    html = response.read().decode("utf-8", "replace")
(here / "itch_c96.html").write_text(html, encoding="utf-8")
match = re.search(r'name="csrf_token" value="([^"]+)"', html)
if not match:
    match = re.search(r"csrf_token&quot;:&quot;([^&]+)&quot;", html)
if not match:
    match = re.search(r"csrf_token\\\":\\\"([^\\]+)\\\"", html)
if not match:
    raise SystemExit("csrf not found")
csrf = match.group(1)
print("csrf", csrf[:16], "len", len(csrf))

ua = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
)


def post(upload_id):
    data = urllib.parse.urlencode({"csrf_token": csrf}).encode()
    req = urllib.request.Request(
        f"https://plewr.itch.io/mauser-c96-low-poly/file/{upload_id}",
        data=data,
        method="POST",
        headers={
            "User-Agent": ua,
            "Referer": "https://plewr.itch.io/mauser-c96-low-poly",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read())["url"]


for upload_id, name in (("11863267", "mauserc96.glb"), ("11863266", "mauserc96.blend")):
    url = post(upload_id)
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = response.read()
    (here / name).write_bytes(payload)
    print("saved", name, len(payload))
