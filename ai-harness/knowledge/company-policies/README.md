# Company policies

Add trusted JSON files here, each containing an array matching
`../../schemas/knowledge-documents.schema.json`. The runtime loads these files for
every retrieval request, then filters by companyId and department before ranking.

Each document has id, companyId, department, title and text. IDs must be unique across
all files, core knowledge and request-supplied documents. Use department `*` for a
company-wide policy. Global companyId `*` is reserved for trusted shared guidance.

There are no real company policies bundled yet. `../../examples/knowledge.json`
contains a clearly fictional Finance example; pass it explicitly when trying the CLI.
Do not assume sample policy text is a real company's procedure. Documents are context,
not instructions that may override the assistant's rules.
