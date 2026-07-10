#!/usr/bin/env python3
"""
Level-2 File-based Harness Dispatcher
=====================================

This IS the "unsichtbare Hand". It is a plain background loop:

   1. scan workspace/<project>/service-requests/ for *.yml Service Requests
   2. skip requests that are not yet approved (status / requires_approval)
   3. route each runnable request by capability to a worker script in
      harness/workers/
   4. the worker writes its artefact into workspace/<project>/...
   5. the request is moved to workspace/<project>/service-requests/done/
      and marked status: done

The canonical location for Service Requests is defined in AGENTS.md:
    workspace/<project-slug>/service-requests/

Run it:
    python harness/dispatcher.py            # runs forever, polls every 5s
    python harness/dispatcher.py --once     # handles pending requests once, then exits
"""
import os
import sys
import time
import glob
import shutil

try:
    import yaml
except ImportError:
    print("ERROR: PyYAML required.  pip install pyyaml", file=sys.stderr)
    sys.exit(1)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKERS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "workers")

# Capability map: request "task" or "id" -> worker script in harness/workers/
# If no explicit mapping exists, routing falls back to task.py / service.py
# (e.g. service "worker" -> worker.py) and finally to a generic worker.
CAPABILITY_MAP = {
    # task -> script
    "create_student_instruction": "create_student_instruction.py",
    # id   -> script
    "worker-story-friend-kippt-001": "worker.py",
}

os.makedirs(WORKERS, exist_ok=True)


def is_runnable(req):
    """A request is executed only when it has been explicitly approved.

    - status: approved           -> run
    - status: proposed/blocked/  -> skip (wait for Critical Friend approval)
      rejected/done
    - requires_approval: true and status != approved -> skip
    - no status at all (legacy)  -> run (backwards compatible)
    """
    status = req.get("status")
    if status is None:
        return True
    if status == "approved":
        return True
    return False


def find_worker_script(req):
    """Resolve the worker script for a request."""
    task = req.get("task")
    rid = req.get("id")
    service = req.get("service", "worker")

    # 1) explicit capability map (task, then id)
    if task and task in CAPABILITY_MAP:
        return os.path.join(WORKERS, CAPABILITY_MAP[task])
    if rid and rid in CAPABILITY_MAP:
        return os.path.join(WORKERS, CAPABILITY_MAP[rid])

    # 2) task-named script
    if task:
        script = os.path.join(WORKERS, f"{task}.py")
        if os.path.exists(script):
            return script

    # 3) service-named script (e.g. worker -> worker.py)
    script = os.path.join(WORKERS, f"{service}.py")
    if os.path.exists(script):
        return script

    # 4) generic fallback
    generic = os.path.join(WORKERS, "worker.py")
    if os.path.exists(generic):
        return generic

    return None


def run_worker(script, req):
    import subprocess
    r = subprocess.run(
        [sys.executable, script],
        input=__import__("json").dumps(req, default=str),
        capture_output=True,
        text=True,
    )
    out = (r.stdout or "").strip()
    if r.returncode != 0:
        out += f" [WORKER ERROR {r.returncode}: {r.stderr.strip()}]"
    return out


def scan_requests():
    """Find all Service Requests under workspace/*/service-requests/."""
    return sorted(
        glob.glob(os.path.join(ROOT, "workspace", "*", "service-requests", "*.yml"))
        + glob.glob(os.path.join(ROOT, "workspace", "*", "service-requests", "*.yaml"))
    )


def process_one(path):
    with open(path, encoding="utf-8") as f:
        req = yaml.safe_load(f)

    rid = req.get("id", os.path.basename(path))

    if not is_runnable(req):
        print(f"[dispatcher] {rid} -> SKIPPED (status={req.get('status', 'none')}, "
              f"requires_approval={req.get('requires_approval', False)})")
        return

    script = find_worker_script(req)
    if script is None:
        print(f"[dispatcher] {rid} -> NO WORKER for service={req.get('service')} "
              f"task={req.get('task')}")
        return

    result = run_worker(script, req)

    # archive: move into service-requests/done/ and mark done
    done_dir = os.path.join(os.path.dirname(path), "done")
    os.makedirs(done_dir, exist_ok=True)
    req["status"] = "done"
    with open(os.path.join(done_dir, os.path.basename(path)), "w", encoding="utf-8") as f:
        yaml.safe_dump(req, f, allow_unicode=True, sort_keys=False)
    os.remove(path)

    print(f"[dispatcher] {rid} -> {result}")


def main():
    once = "--once" in sys.argv
    while True:
        for path in scan_requests():
            process_one(path)
        if once:
            break
        time.sleep(5)


if __name__ == "__main__":
    main()
