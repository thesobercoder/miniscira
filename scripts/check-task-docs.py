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


def relative_markdown_links(text: str) -> list[str]:
    return re.findall(r"\[[^\]]*\]\(([^)]+)\)", text)


def main() -> int:
    errors: list[str] = []
    task_files = sorted(TASKS_DIR.glob("*.md"))
    product_ideas = PRODUCT_IDEAS.read_text()
    task_index_marker = "## Task index\n"
    if task_index_marker not in product_ideas:
        print("Task documentation check failed:")
        print("- docs/PRODUCT_IDEAS.md: missing Task index section")
        return 1
    task_index = product_ideas.split(task_index_marker, 1)[1]

    for task_file in task_files:
        lines = task_file.read_text().splitlines()
        slug = task_file.stem
        task_name = task_file.name
        product_ideas_link = (
            "- **Product ideas:** [Task index entry]"
            f"(../docs/PRODUCT_IDEAS.md#task-{slug})"
        )

        if len(lines) < 5:
            errors.append(f"{task_name}: expected at least five lines")
            continue
        if not lines[0].startswith("# "):
            errors.append(f"{task_name}: line 1 must be one H1 heading")
        if lines[1] != "":
            errors.append(f"{task_name}: line 2 must be blank")
        if not lines[2].startswith("- **Status:** "):
            errors.append(f"{task_name}: line 3 must contain the status metadata")
        if lines[3] != product_ideas_link:
            errors.append(f"{task_name}: line 4 must link to its task-index entry")
        if lines[4] != PLANNING_LINK:
            errors.append(f"{task_name}: line 5 must link to the planning process")

        anchor = f'<a id="task-{slug}"></a>'
        task_link = f"(../tasks/{task_name})"
        if task_index.count(anchor) != 1:
            errors.append(f"{task_name}: task index must contain one unique anchor")
        if task_index.count(task_link) != 1:
            errors.append(f"{task_name}: task index must contain one link to the file")

    indexed_task_links = re.findall(r"\(\.\./tasks/([^)]+\.md)\)", task_index)
    expected_task_names = {task_file.name for task_file in task_files}
    indexed_task_names = set(indexed_task_links)
    for task_name in sorted(indexed_task_names - expected_task_names):
        errors.append(f"docs/PRODUCT_IDEAS.md: indexed task does not exist: {task_name}")
    for task_name in sorted(expected_task_names - indexed_task_names):
        errors.append(f"docs/PRODUCT_IDEAS.md: task is not indexed: {task_name}")

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

    print(f"Task documentation check passed for {len(task_files)} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
