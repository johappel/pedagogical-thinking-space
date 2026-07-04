from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_FILES = [
    "README.md",
    "AGENTS.md",
    "CRITICAL_FRIEND.md",
    "LEARNING_DESIGN.md",
    "ORCHESTRATION.md",
    "GET_STARTED.md",
    "services/MEMORY.md",
    "services/KNOWLEDGE.md",
    "services/WORKER.md",
    "services/RENDERER.md",
    "specs/LEARNING_DESIGN_SCHEMA.md",
    "specs/SERVICE_CONTRACTS.md",
    "specs/SERVICE_REQUEST_SCHEMA.md",
    "specs/EXECUTION_PROFILES.md",
    "specs/RENDERING_SPEC_TEMPLATE.md",
    "capabilities/README.md",
    "capabilities/workers/README.md",
    "capabilities/workers/IMAGE_GENERATION.md",
    "capabilities/workers/DIAGRAM.md",
    "capabilities/workers/METRICS.md",
    "knowledge/README.md",
    "knowledge/index.md",
]

MUST_CONTAIN = {
    "AGENTS.md": [
        "Service Request Discipline",
        "Knowledge Capture Gate",
        "Worker Capabilities",
        "Import Export Discipline",
    ],
    "services/KNOWLEDGE.md": [
        "OKF Compatibility",
        "Knowledge Proposals",
    ],
    "specs/SERVICE_REQUEST_SCHEMA.md": [
        "knowledge_output",
        "capability",
    ],
    "capabilities/README.md": [
        "Service Requests may reference a Capability.",
    ],
    "README.md": [
        "Import and Sharing",
        "services/MEMORY.md",
        "GET_STARTED.md",
    ],
    "knowledge/README.md": [
        "knowledge/_incoming/",
    ],
}

CODE_REF_PATTERN = re.compile(
    r"`((?:services|specs|capabilities|knowledge|workspace|chat-only|hermes-profiles|implementation-examples)/[^`]+)`"
)
LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def is_local_doc_target(target: str) -> bool:
    if "://" in target:
        return False
    if target.startswith(("#", "mailto:", "data:")):
        return False
    return not target.startswith("/")


def normalize_target(target: str) -> str:
    return target.split("#", 1)[0].strip()


def is_template_or_glob(target: str) -> bool:
    return ("<" in target and ">" in target) or ("*" in target)


def main() -> int:
    errors: list[str] = []

    for rel in REQUIRED_FILES:
        if not (ROOT / rel).exists():
            errors.append(f"Missing required file: {rel}")

    markdown_files = sorted(ROOT.rglob("*.md"))
    for path in markdown_files:
        rel = path.relative_to(ROOT).as_posix()
        text = read_text(path)

        if "core/" in text:
            errors.append(f"{rel}: contains old reference 'core/'")
        if "workspace//" in text:
            errors.append(f"{rel}: contains broken path 'workspace//'")
        if "rendered//" in text:
            errors.append(f"{rel}: contains broken path 'rendered//'")
        if "Get starded" in text:
            errors.append(f"{rel}: contains typo 'Get starded'")

        for match in CODE_REF_PATTERN.finditer(text):
            target = normalize_target(match.group(1))
            if is_template_or_glob(target):
                continue
            if target.endswith((".md", ".yml", ".yaml")) and not (ROOT / target).exists():
                errors.append(f"{rel}: references missing path `{target}`")

        for match in LINK_PATTERN.finditer(text):
            target = normalize_target(match.group(1))
            if not target or not is_local_doc_target(target):
                continue
            if is_template_or_glob(target) or target.endswith("/"):
                continue
            if target.endswith((".md", ".yml", ".yaml")) and not (ROOT / target).exists():
                errors.append(f"{rel}: links to missing path {target}")

    for rel, phrases in MUST_CONTAIN.items():
        path = ROOT / rel
        if not path.exists():
            continue
        text = read_text(path)
        for phrase in phrases:
            if phrase not in text:
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