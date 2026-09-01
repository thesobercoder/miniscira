#!/usr/bin/env python3

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys
import unittest


SCRIPT = Path(__file__).with_name("check-task-docs.py")
sys.path.insert(0, str(SCRIPT.parent))
SPEC = spec_from_file_location("check_task_docs", SCRIPT)
assert SPEC and SPEC.loader
CHECKER = module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


def prd(*, status: str = "To do", sections: tuple[str, ...] | None = None, task: str = "- [ ] Ship it") -> str:
    headings = sections or CHECKER.CANONICAL_PRD_SECTIONS
    bodies = []
    for heading in headings:
        body = task if heading == "Acceptance criteria" else "Content."
        bodies.append(f"## {heading}\n\n{body}")
    return f"- **Status:** {status}\n\n" + "\n\n".join(bodies) + "\n"


class PrdStructureTests(unittest.TestCase):
    def test_documented_sections_match_the_shared_definition(self) -> None:
        planning = (SCRIPT.parents[1] / "docs" / "PRODUCT_PLANNING.md").read_text()
        self.assertEqual(
            CHECKER.documented_prd_sections(planning),
            list(CHECKER.CANONICAL_PRD_SECTIONS),
        )

    def test_accepts_canonical_todo_prd(self) -> None:
        self.assertEqual(CHECKER.prd_structure_errors(prd(), "To do"), [])

    def test_rejects_reordered_sections(self) -> None:
        sections = list(CHECKER.CANONICAL_PRD_SECTIONS)
        sections[0], sections[1] = sections[1], sections[0]
        errors = CHECKER.prd_structure_errors(prd(sections=tuple(sections)), "To do")
        self.assertTrue(any("canonical PRD order" in error for error in errors))

    def test_rejects_extra_sections(self) -> None:
        sections = (*CHECKER.CANONICAL_PRD_SECTIONS, "Evidence")
        errors = CHECKER.prd_structure_errors(prd(sections=sections), "To do")
        self.assertTrue(any("canonical PRD order" in error for error in errors))

    def test_rejects_missing_and_duplicate_sections(self) -> None:
        missing = CHECKER.CANONICAL_PRD_SECTIONS[:-1]
        duplicate = (*CHECKER.CANONICAL_PRD_SECTIONS, "Open questions")
        for sections in (missing, duplicate):
            with self.subTest(sections=sections):
                errors = CHECKER.prd_structure_errors(prd(sections=sections), "To do")
                self.assertTrue(any("canonical PRD order" in error for error in errors))

    def test_rejects_plain_acceptance_bullets(self) -> None:
        errors = CHECKER.prd_structure_errors(prd(task="- Ship it"), "To do")
        self.assertTrue(any("task-list item" in error for error in errors))

    def test_done_requires_checked_criteria(self) -> None:
        errors = CHECKER.prd_structure_errors(prd(status="Done"), "Done")
        self.assertTrue(any("must all be checked" in error for error in errors))
        self.assertEqual(
            CHECKER.prd_structure_errors(prd(status="Done", task="- [x] Shipped"), "Done"),
            [],
        )

    def test_rejects_acceptance_labels_outside_the_section(self) -> None:
        source = prd().replace(
            "## User stories\n\nContent.",
            "## User stories\n\n**Acceptance criteria:**\n\n- [ ] Wrong place.",
        )
        errors = CHECKER.prd_structure_errors(source, "To do")
        self.assertTrue(any("labels must appear only" in error for error in errors))


if __name__ == "__main__":
    unittest.main()