import sys, json, zstandard, io, os

def load(path):
    with open(path, 'rb') as f:
        data = f.read()
    dctx = zstandard.ZstdDecompressor()
    try:
        raw = dctx.decompress(data)
    except zstandard.ZstdError:
        # streaming / unknown size
        raw = dctx.stream_reader(io.BytesIO(data)).read()
    lines = raw.decode('utf-8', 'replace').splitlines()
    out = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        try:
            out.append(json.loads(ln))
        except Exception:
            pass
    return out

def summarize(path, label):
    ev = load(path)
    print(f"===== {label} :: {os.path.basename(os.path.dirname(path))} =====")
    print(f"total events: {len(ev)}")
    # collect event type/kind keys
    from collections import Counter
    kinds = Counter()
    toolcalls = Counter()
    subagent_events = []
    report_events = []
    for e in ev:
        t = e.get('type') or e.get('kind') or e.get('event') or ''
        # nested
        payload = e
        # find a 'type'-like discriminator anywhere shallow
        keyname = None
        for k in ('type','kind','event','op','name'):
            if k in e and isinstance(e[k], str):
                keyname = e[k]
                break
        kinds[keyname or '<none>'] += 1
        blob = json.dumps(e, ensure_ascii=False).lower()
        if 'subagent/start' in blob or 'subagent/end' in blob or '"subagent"' in blob:
            subagent_events.append(e)
        if 'subagent-report' in blob or 'subagent-settled' in blob or '"report"' in blob:
            report_events.append(e)
        # tool calls
        if keyname and ('tool' in keyname.lower()):
            toolcalls[keyname] += 1
    print("event discriminators:", dict(kinds))
    return ev

if __name__ == '__main__':
    for p in sys.argv[1:]:
        summarize(p, p)
