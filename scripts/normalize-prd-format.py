#!/usr/bin/env python3

from argparse import ArgumentParser
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "tasks"
CANONICAL_SECTIONS = (
    "Goal",
    "User stories",
    "Scope",
    "Non-goals",
    "Functional requirements",
    "Technical requirements",
    "Acceptance criteria",
    "Deployment",
    "Observability",
    "Rollback",
    "Open questions",
)
EMPTY_TEXT = {
    "Goal": "No separate goal was recorded.",
    "User stories": "No separate user stories were recorded.",
    "Scope": "No separate scope notes were recorded.",
    "Non-goals": "No separate non-goals were recorded.",
    "Functional requirements": "No separate functional requirements were recorded.",
    "Technical requirements": "No separate technical requirements were recorded.",
    "Acceptance criteria": "- [ ] Define acceptance criteria.",
    "Deployment": "No separate deployment requirements were recorded.",
    "Observability": "No separate observability requirements were recorded.",
    "Rollback": "No separate rollback requirements were recorded.",
    "Open questions": "None recorded.",
}


def clean_heading(heading: str) -> str:
    return re.sub(r"^\d+\.\s*", "", heading).strip()


def classify_heading(heading: str) -> str:
    name = clean_heading(heading)
    lower = name.lower()
    canonical = {section.lower(): section for section in CANONICAL_SECTIONS}
    if lower in canonical:
        return canonical[lower]
    if "acceptance criteria" in lower or "remaining completion work" in lower or "completion evidence" in lower:
        return "Acceptance criteria"
    if "non-goal" in lower:
        return "Non-goals"
    if any(term in lower for term in ("user stor", "persona", "journey", "users and main use cases")):
        return "User stories"
    if "rollback" in lower and not any(term in lower for term in ("deploy", "migration")):
        return "Rollback"
    if any(term in lower for term in ("deploy", "migration", "backfill", "production acceptance")):
        return "Deployment"
    if any(term in lower for term in ("observability", "success metric", "performance target", "cost and performance budget")):
        return "Observability"
    if "open question" in lower or "approval gate" in lower:
        return "Open questions"
    if any(term in lower for term in ("scope", "decision", "accepted risk", "definition", "product principle", "locked phase")):
        return "Scope"
    if any(term in lower for term in ("goal", "problem", "summary", "purpose", "overview", "introduction", "context", "evidence", "diagnosis", "user outcome", "source", "product priority")):
        return "Goal"
    if any(term in lower for term in ("functional", "product behavior", "ux", "user experience", "phase 1 behavior", "eligible users", "what may and may not", "review mode")):
        return "Functional requirements"
    return "Technical requirements"


def taskify_acceptance_body(body: str, status: str) -> str:
    marker = "x" if status == "Done" else " "
    converted: list[str] = []
    inside_subsection = False
    for line in body.splitlines():
        if line.startswith("### "):
            inside_subsection = True
        if inside_subsection or re.match(r"^- \[[ xX]\] ", line):
            converted.append(line)
        elif line.startswith("- "):
            converted.append(f"- [{marker}] {line[2:]}")
        elif re.match(r"^\d+\. ", line):
            converted.append(re.sub(r"^\d+\. ", f"- [{marker}] ", line))
        else:
            converted.append(line)
    return "\n".join(converted).strip()


def extract_nested_acceptance(body: str) -> tuple[str, list[str]]:
    def split_label(text: str) -> tuple[str, str] | None:
        match = re.search(r"\*\*Acceptance criteria:\*\*", text, re.IGNORECASE)
        if not match:
            return None
        return text[: match.start()], text[match.end():]

    matches = list(re.finditer(r"^### (.+)$", body, re.MULTILINE))
    if not matches:
        split = split_label(body)
        if not split:
            return body, []
        before, criteria = split
        return before.strip(), [f"### Additional criteria\n\n{criteria.strip()}"]

    prefix = body[: matches[0].start()].strip()
    retained = [prefix] if prefix else []
    extracted: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        title = match.group(1).strip()
        section_body = body[match.end():end].strip()
        split = split_label(section_body)
        if not split:
            retained.append(f"### {title}\n\n{section_body}".strip())
            continue
        description, criteria = split
        retained.append(f"### {title}\n\n{description.strip()}".strip())
        extracted.append(f"### {title}\n\n{criteria.strip()}".strip())
    return "\n\n".join(retained).strip(), extracted


def parse_prd(text: str) -> tuple[str, list[tuple[str, str]]]:
    matches = list(re.finditer(r"^## (?!#)(.+)$", text, re.MULTILINE))
    if not matches:
        return text.rstrip(), []
    prefix = text[: matches[0].start()].rstrip()
    sections: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        body_start = match.end()
        body_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections.append((match.group(1).strip(), text[body_start:body_end].strip()))
    return prefix, sections


def normalize_prd(text: str) -> str:
    prefix, source_sections = parse_prd(text)
    status_match = re.search(r"^- \*\*Status:\*\* (.+)$", prefix, re.MULTILINE)
    if not status_match:
        raise ValueError("missing status metadata")
    status = status_match.group(1).strip()
    buckets: dict[str, list[str]] = {section: [] for section in CANONICAL_SECTIONS}

    for heading, body in source_sections:
        target = classify_heading(heading)
        clean = clean_heading(heading)
        canonical_heading = clean.lower() == target.lower()
        if target != "Acceptance criteria":
            body, extracted = extract_nested_acceptance(body)
            buckets["Acceptance criteria"].extend(extracted)
        if target == "Acceptance criteria" and "acceptance" in clean.lower():
            body = taskify_acceptance_body(body, status)
        block = body if canonical_heading else f"### {clean}\n\n{body}"
        buckets[target].append(block.strip())

    rendered = [prefix]
    for section in CANONICAL_SECTIONS:
        body = "\n\n".join(block for block in buckets[section] if block).strip()
        if not body:
            body = EMPTY_TEXT[section]
        rendered.append(f"## {section}\n\n{body}")
    return "\n\n".join(rendered).rstrip() + "\n"


def main() -> int:
    parser = ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed: list[Path] = []

    for path in sorted(TASKS_DIR.glob("prd-*.md")):
        original = path.read_text()
        normalized = normalize_prd(original)
        if normalized == original:
            continue
        changed.append(path)
        if not args.check:
            path.write_text(normalized)

    if args.check and changed:
        for path in changed:
            print(path.relative_to(ROOT))
        return 1

    action = "would normalize" if args.check else "normalized"
    print(f"{action} {len(changed)} PRD files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
