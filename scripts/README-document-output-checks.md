# Format-aware content assertions for production document downloads

Helper for `document-files-production-acceptance` (referenced from
`tasks/prd-document-generation.md`). Run from the repository root after the eval
writes `.eve/document-files-production-proof.json`:

```sh
/opt/data/bin/bun scripts/verify-document-outputs.ts
```

Asserts, against real downloaded bytes:

- PDF: text layer contains "MiniScira production proof" (via unpdf).
- DOCX: `word/document.xml` contains the fixture phrase (zip + regex strip).
- PPTX: a slide XML contains "MiniScira production proof".
- XLSX: shared strings or sheet XML contain "MiniScira production proof".
- Edited DOCX: contains "Edited by MiniScira production" and not the original phrase.

Exit code 1 with a message on any failure.
