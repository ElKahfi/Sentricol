import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("SENTRI_HARNESS_ROOT", Path(__file__).resolve().parents[1]))
KNOWLEDGE = {
    "task-planner": ["user-profile", "task-structure", "personalization", "phishing-score", "behavior-tags", "knowledge-tags"],
    "email-generator": ["task-structure", "phishing-score", "behavior-tags", "knowledge-tags"],
    "one-pass-generator": ["user-profile", "task-structure", "personalization", "behavior-tags", "knowledge-tags"],
    "chatbot": ["user-profile", "task-structure"],
    "email-detector": [],
}

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=lambda x: (_ for _ in ()).throw(ValueError("Non-finite JSON number")))

def schema(name):
    if name == "one-pass":
        proposal = schema("task-proposal")
        # In the combined call, the email threat is the single classification.
        # The runtime derives the task decision from it after generation.
        del proposal["properties"]["decision"]
        proposal["required"].remove("decision")
        properties = {"taskProposal": proposal, "email": schema("email-content")}
        return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}
    return read_json(ROOT / "schemas" / (name + ".schema.json"))

def instructions(operation):
    if operation == "email-detector":
        return (ROOT / "instructions/email-detector.md").read_text(encoding="utf-8")
    files = ["instructions/sentri-identity.md", "instructions/" + operation + ".md"]
    files += ["knowledge/" + name + ".md" for name in KNOWLEDGE[operation]]
    return "\n\n".join((ROOT / file).read_text(encoding="utf-8") for file in files)

def documents():
    files = [ROOT / "knowledge/cybersecurity.json", *sorted((ROOT / "knowledge/company-policies").glob("*.json"))]
    result = []
    for file in files:
        group = read_json(file)
        if not isinstance(group, list):
            raise ValueError("Knowledge files must contain arrays")
        result.extend(group)
    return result
