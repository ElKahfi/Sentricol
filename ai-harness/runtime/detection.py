"""Email analysis shares the harness model client and validation loop, not training scores."""
from .harness import Harness
from .model import ollama

LIMITS = {"sender": 320, "replyTo": 320, "subject": 500, "body": 20000}


def prepare_email(value):
    if not isinstance(value, dict) or set(value) - set(LIMITS):
        raise ValueError("Invalid email fields")
    email = {}
    for key, limit in LIMITS.items():
        text = value.get(key, "")
        if not isinstance(text, str) or len(text) > limit:
            raise ValueError("Invalid email field: " + key)
        email[key] = text.strip()
    if not email["body"]:
        raise ValueError("Email body is required")
    return email


def analyze_email(value, harness=None):
    email = prepare_email(value)
    if harness is None:
        def detector_model(system, payload, schema, timeout):
            result = ollama(system, payload, schema, timeout, max_tokens=1200)
            # The compact generation grammar omits minItems; add a safe default
            # when this model produces an empty recommendations array.
            if isinstance(result, dict) and result.get("recommendations") == []:
                result["recommendations"] = ["Verify unexpected requests through a known, independent channel."]
            return result
        harness = Harness(model=detector_model, attempts=2, timeout=120)
    harness.start()

    def check_evidence(result):
        if result["verdict"] in ("suspicious", "high-risk") and not result["findings"]:
            raise ValueError("A suspicious or high-risk verdict requires evidence")
        for finding in result["findings"]:
            if finding["quote"] not in email[finding["field"]]:
                raise ValueError("Each evidence quote must occur exactly in its email field")

    return harness.checked("email-detector", {"email": email}, "email-analysis", check_evidence)
