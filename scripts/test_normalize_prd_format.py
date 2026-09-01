#!/usr/bin/env python3

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import unittest


SCRIPT = Path(__file__).with_name("normalize-prd-format.py")
SPEC = spec_from_file_location("normalize_prd_format", SCRIPT)
assert SPEC and SPEC.loader
NORMALIZER = module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


PREFIX = """# Example

- **Status:** To do
- **Product ideas:** [Idea entry](../docs/PRODUCT_IDEAS.md#idea-example)
- **Planning process:** [Product planning and execution](../docs/PRODUCT_PLANNING.md)
- **Approval:** Not approved
"""


class NormalizePrdFormatTests(unittest.TestCase):
    def test_normalizes_sections_and_preserves_content(self) -> None:
        source = PREFIX + """
## Problem

Keep this problem statement.

## User story

- As a user, I can test this.

## Acceptance criteria and traceability

- The behavior works.

## Deployment and rollback

Keep this deployment note.
"""
        normalized = NORMALIZER.normalize_prd(source)
        _, sections = NORMALIZER.parse_prd(normalized)
        self.assertEqual([heading for heading, _ in sections], list(NORMALIZER.CANONICAL_SECTIONS))
        self.assertIn("Keep this problem statement.", normalized)
        self.assertIn("Keep this deployment note.", normalized)
        self.assertIn("- [ ] The behavior works.", normalized)

    def test_done_acceptance_bullets_become_checked(self) -> None:
        source = (PREFIX.replace("To do", "Done") + "\n## Acceptance criteria\n\n- Shipped.\n")
        normalized = NORMALIZER.normalize_prd(source)
        self.assertIn("- [x] Shipped.", normalized)

    def test_moves_story_criteria_into_the_canonical_section(self) -> None:
        source = PREFIX + """
## User stories

### US-001: run the feature

As a user, I can run the feature.

**Acceptance Criteria:**

- [ ] The feature runs.
"""
        normalized = NORMALIZER.normalize_prd(source)
        _, sections = NORMALIZER.parse_prd(normalized)
        bodies = dict(sections)
        self.assertNotRegex(bodies["User stories"], r"(?i)\*\*Acceptance criteria:\*\*")
        self.assertIn("As a user, I can run the feature.", bodies["User stories"])
        self.assertIn("### US-001: run the feature", bodies["Acceptance criteria"])
        self.assertIn("- [ ] The feature runs.", bodies["Acceptance criteria"])

    def test_is_idempotent_and_keeps_evidence_as_evidence(self) -> None:
        source = PREFIX + """
## Acceptance criteria

- The feature works.

## Completion evidence

- Commit `abc123` proves the feature shipped.
"""
        once = NORMALIZER.normalize_prd(source)
        twice = NORMALIZER.normalize_prd(once)
        self.assertEqual(once, twice)
        self.assertIn("- [ ] The feature works.", once)
        self.assertIn("- Commit `abc123` proves the feature shipped.", once)
        self.assertNotIn("- [ ] Commit `abc123`", once)


if __name__ == "__main__":
    unittest.main()
