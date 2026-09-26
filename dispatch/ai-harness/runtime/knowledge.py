import re
from .assets import documents, schema
from .contracts import validate


def retrieve(query, user, supplied=None):
    supplied = [] if supplied is None else supplied
    validate(supplied, schema("knowledge-documents"))
    bundled = documents()
    validate(bundled, schema("knowledge-documents"))
    all_docs = bundled + supplied
    if len({d["id"] for d in all_docs}) != len(all_docs): raise ValueError("Knowledge document IDs must be unique")
    def tokens(text): return set(re.findall(r"[a-z0-9]{3,}", text.lower()))
    words = tokens(query)
    candidates = []
    for doc in all_docs:
        if doc["companyId"] not in ("*", user["companyId"]) or doc["department"] not in ("*", user["department"]): continue
        score = len(words & tokens(doc["title"] + " " + doc["text"]))
        if score: candidates.append((score, doc))
    candidates.sort(key=lambda pair: (-pair[0], pair[1]["id"]))
    return [{**doc, "text": doc["text"][:6000]} for _, doc in candidates[:4]]
