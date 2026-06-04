import base64, json, urllib.request

with open("./1000007271.jpg", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

body = json.dumps({"content": b64, "mime_type": "image/jpeg"}).encode()
req = urllib.request.Request(
    "http://localhost:8001/process",
    data=body,
    headers={"Content-Type": "application/json"}
)
res = urllib.request.urlopen(req)
print(json.dumps(json.loads(res.read()), indent=2, ensure_ascii=False))