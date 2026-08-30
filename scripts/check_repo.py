from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "README.md",
    "AGENTS.md",
    "ARCHITECTURE.md",
    "ORCHESTRATION.md",
    "services/MEMORY.md",
    "services/KNOWLEDGE.md",
    "services/WORKER.md",
    "services/RENDERER.md",
    "services/STEWARDSHIP.md",
    "specs/LEARNING_DESIGN_SCHEMA.md",
    "dsh-presets/pts-companion/agent.cordis.yml",
    "dsh-presets/pts-companion/preset.yml",
    "dsh-presets/pts-companion/companion-tool-boundary.mjs",
    "dsh-plugins/pts-background-steward/lib/index.js",
]

FORBIDDEN_PATHS = [
    "AGENTS_MINIMAL.md",
    ".hermes.md",
    "harness",
    "hermes-profiles",
    "capabilities/registry.yml",
    "dsh-plugins/pts-background-steward/lib/capability-builder.js",
    "dsh-plugins/pts-background-steward/lib/capability-lifecycle.js",
    "dsh-plugins/pts-background-steward/lib/registry.js",
    "dsh-plugins/pts-background-steward/lib/research-job.js",
    "dsh-plugins/pts-background-steward/lib/service-coordinator.js",
    "dsh-plugins/pts-background-steward/lib/service-request.js",
]

MUST_CONTAIN = {
    "AGENTS.md": ["Native DSH delegation", "pts_research", "pts_material", "Architecture guard"],
    "ARCHITECTURE.md": ["PTS is a pedagogical metaharness", "DSH owns", "Deliberately absent"],
    "dsh-presets/pts-companion/agent.cordis.yml": [
        "toolName: pts_research",
        "toolName: pts_material",
        "toolName: pts_review",
        "toolName: pts_renderer",
        "pts-companion-tool-boundary",
        "pts-worker-skill-scope",
    ],
    "dsh-plugins/pts-workspaces/lib/client.js": [
        'agentPreset: "pts-companion"',
    ],
}

LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def local_target(target: str) -> bool:
    return "://" not in target and not target.startswith(("#", "mailto:", "data:", "/"))


def main() -> int:
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        if not (ROOT / rel).exists():
            errors.append(f"Missing required file: {rel}")

    for rel in FORBIDDEN_PATHS:
        if (ROOT / rel).exists():
            errors.append(f"Forbidden competing runtime path: {rel}")

    agents = ROOT / "AGENTS.md"
    if agents.exists() and agents.stat().st_size > 8192:
        errors.append(f"AGENTS.md exceeds 8192-byte prototype budget: {agents.stat().st_size}")

    markdown_files = sorted(path for path in ROOT.rglob("*.md") if "node_modules" not in path.parts)
    for path in markdown_files:
        rel = path.relative_to(ROOT).as_posix()
        content = read_text(path)
        if re.search(r"(?<![\w/])core/", content):
            errors.append(f"{rel}: contains old reference 'core/'")
        for match in LINK_PATTERN.finditer(content):
            target = match.group(1).split("#", 1)[0].strip()
            if not target or not local_target(target) or "<" in target or "*" in target or target.endswith("/"):
                continue
            resolved = (path.parent / target).resolve()
            if target.endswith((".md", ".yml", ".yaml")) and not resolved.exists():
                errors.append(f"{rel}: links to missing path {target}")

    for rel, phrases in MUST_CONTAIN.items():
        path = ROOT / rel
        if not path.exists():
            continue
        content = read_text(path)
        for phrase in phrases:
            if phrase not in content:
                errors.append(f"{rel}: missing required phrase '{phrase}'")

    if errors:
        print("FAIL")
        for err in errors:
            print(f"- {err}")
        return 1

    print("PASS")
    print(f"Checked {len(markdown_files)} Markdown files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
