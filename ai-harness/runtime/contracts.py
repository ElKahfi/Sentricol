import math
from datetime import datetime
from .assets import schema


def validate(value, rule, path="$"):
    """Validate the JSON Schema subset used by the bundled contracts."""
    kind = rule["type"]
    def fail():
        raise ValueError("Invalid value at " + path)
    if kind == "object":
        if not isinstance(value, dict): fail()
        props = rule.get("properties", {})
        if set(value) - set(props) or set(rule.get("required", [])) - set(value): fail()
        for key in value: validate(value[key], props[key], path + "." + key)
    elif kind == "array":
        if not isinstance(value, list) or not rule.get("minItems", 0) <= len(value) <= rule.get("maxItems", math.inf): fail()
        for i, item in enumerate(value): validate(item, rule["items"], f"{path}[{i}]")
    elif kind in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value): fail()
        if kind == "integer" and value != int(value): fail()
        if not rule.get("minimum", -math.inf) <= value <= rule.get("maximum", math.inf): fail()
    elif kind == "string":
        if not isinstance(value, str) or len(value.strip()) < rule.get("minLength", 0) or len(value) > rule.get("maxLength", math.inf): fail()
    elif kind == "boolean":
        if not isinstance(value, bool): fail()
    else:
        raise ValueError("Unsupported schema type: " + kind)
    if "enum" in rule and value not in rule["enum"]: fail()


def validate_context(user):
    validate(user, schema("internal-user-context"))
    tags = [s["tag"] for s in user["skills"]]
    if len(set(tags)) != len(tags) or any(s["attempts"] != int(s["attempts"]) for s in user["skills"]):
        raise ValueError("Duplicate skills or non-integer attempts")


def validate_profile(user):
    validate(user, schema("user-context"))
    dates = [user["joinedAt"], user["statistics"]["lastPlayed"]]
    for tag, stats in user["skillStatistics"].items():
        if stats["correct"] + stats["wrong"] > stats["attempts"] or stats["perfectAttempts"] > stats["correct"] or stats["currentStreak"] > stats["bestStreak"]:
            raise ValueError("Inconsistent skill statistics: " + tag)
        dates.extend([stats["lastPracticed"], stats["lastUpdated"]])
    stats = user["statistics"]
    if stats["correct"] + stats["wrong"] > stats["tasksCompleted"] or stats["perfectTasks"] > stats["correct"]:
        raise ValueError("Inconsistent user statistics")
    for date in dates:
        if "T" not in date: raise ValueError("Invalid profile timestamp")
        datetime.fromisoformat(date.replace("Z", "+00:00"))


def validate_email(content, task, recipient_email=None):
    validate(content, schema("email-content"))
    if content["id"] != task["id"]:
        raise ValueError("Email id must match task id")
    if (content["threat"] == "legitimate") != (task["decision"] == "legitimate"):
        raise ValueError("Email threat differs from task decision")
    if recipient_email is not None and content["recipientEmail"] != recipient_email:
        raise ValueError("Email recipient must match user profile email")
