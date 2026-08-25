#!/usr/bin/env python3

from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TASKS_DIR = ROOT / "tasks"
PRODUCT_IDEAS = ROOT / "docs" / "PRODUCT_IDEAS.md"
PLANNING_LINK = (
    "- **Planning process:** "
    "[Product planning and execution](../docs/PRODUCT_PLANNING.md)"
)
PRODUCT_IDEAS_PATTERN = re.compile(
    r"^- \*\*Product ideas:\*\* \[Idea entry\]"
    r"\(\.\./docs/PRODUCT_IDEAS\.md#(idea-[a-z0-9-]+)\)$"
)


def relative_markdown_links(text: str) -> list[str]:
    return re.findall(r"\[[^\]]*\]\(([^)]+)\)", text)


def main() -> int:
    errors: list[str] = []
    task_files = sorted(TASKS_DIR.glob("*.md"))
    product_ideas = PRODUCT_IDEAS.read_text()

    if "## Task index" in product_ideas or "## Backlog" in product_ideas:
        errors.append(
            "docs/PRODUCT_IDEAS.md: use one lifecycle table, not separate backlog or task-index sections"
        )

    required_table_header = "| Idea | Status | Planning document | Summary |"
    if required_table_header not in product_ideas:
        errors.append("docs/PRODUCT_IDEAS.md: missing the product-ideas table header")

    idea_anchors = re.findall(r'<a id="(idea-[a-z0-9-]+)"></a>', product_ideas)
    duplicate_anchors = sorted(
        anchor for anchor in set(idea_anchors) if idea_anchors.count(anchor) > 1
    )
    for anchor in duplicate_anchors:
        errors.append(f"docs/PRODUCT_IDEAS.md: duplicate idea anchor: {anchor}")

    prd_files = {task_file.name for task_file in task_files if task_file.name.startswith("prd-")}
    linked_prd_files = set(
        re.findall(r"\(\.\./tasks/(prd-[^)]+\.md)\)", product_ideas)
    )
    for task_name in sorted(linked_prd_files - prd_files):
        errors.append(f"docs/PRODUCT_IDEAS.md: linked PRD does not exist: {task_name}")
    for task_name in sorted(prd_files - linked_prd_files):
        errors.append(f"docs/PRODUCT_IDEAS.md: PRD has no product-idea row: {task_name}")

    for task_file in task_files:
        lines = task_file.read_text().splitlines()
        task_name = task_file.name

        if len(lines) < 5:
            errors.append(f"{task_name}: expected at least five lines")
            continue
        if not lines[0].startswith("# "):
            errors.append(f"{task_name}: line 1 must be one H1 heading")
        if lines[1] != "":
            errors.append(f"{task_name}: line 2 must be blank")
        if not lines[2].startswith("- **Status:** "):
            errors.append(f"{task_name}: line 3 must contain the status metadata")

        product_ideas_match = PRODUCT_IDEAS_PATTERN.fullmatch(lines[3])
        if not product_ideas_match:
            errors.append(f"{task_name}: line 4 must link to one product-idea row")
        else:
            anchor = product_ideas_match.group(1)
            if product_ideas.count(f'<a id="{anchor}"></a>') != 1:
                errors.append(
                    f"{task_name}: product-idea anchor must exist exactly once: {anchor}"
                )

        if lines[4] != PLANNING_LINK:
            errors.append(f"{task_name}: line 5 must link to the planning process")

    files_to_check = [
        ROOT / "docs" / "PRODUCT_IDEAS.md",
        ROOT / "docs" / "PRODUCT_PLANNING.md",
        *task_files,
    ]
    for markdown_file in files_to_check:
        for destination in relative_markdown_links(markdown_file.read_text()):
            if "://" in destination or destination.startswith("#"):
                continue
            path_part = destination.split("#", 1)[0]
            if path_part and not (markdown_file.parent / path_part).resolve().exists():
                relative_file = markdown_file.relative_to(ROOT)
                errors.append(f"{relative_file}: broken link: {destination}")

    if errors:
        print("Task documentation check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        "Task documentation check passed for "
        f"{len(task_files)} files and {len(idea_anchors)} product ideas."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
