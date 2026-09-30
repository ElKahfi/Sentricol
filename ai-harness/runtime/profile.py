from .contracts import validate_context, validate_profile

SKILL_MAP = {"senderIdentity": ["senderVerification", "spoofing"], "linkDestination": ["urlInspection", "domainAwareness"], "attachmentSafety": ["attachmentSafety"], "credentialProtection": ["credentialProtection"], "mfaSafety": ["mfa"], "sensitiveDataHandling": ["dataHandling"]}
BEHAVIOR_MAP = {"authority": "authority", "urgency": "urgency", "fear": "fear", "curiosity": "curiosity", "rewardIncentive": "greed", "helpfulness": "helpfulness", "familiarityImpersonation": "trust"}


def prepare_profile(profile, organization=None):
    organization = {} if organization is None else organization
    if not isinstance(organization, dict) or set(organization) - {"companyName", "rank", "phase", "recentObjectives"}:
        raise ValueError("Invalid organization context")
    if not isinstance(profile, dict) or "userId" not in profile:
        validate_context(profile)
        return {"user": profile, "profile": None, "contextNotes": {"phaseSource": "internal-context"}}
    validate_profile(profile)
    stats = profile["skillStatistics"]
    skills = []
    for target, sources in SKILL_MAP.items():
        observed = [tag for tag in sources if stats.get(tag, {}).get("attempts", 0) > 0]
        if observed:
            tag = min(observed, key=lambda name: profile["knowledge"][name])
            skills.append({"tag": target, "ability": profile["knowledge"][tag], "attempts": stats[tag]["attempts"]})
    for target, source in BEHAVIOR_MAP.items():
        if stats.get(source, {}).get("attempts", 0) > 0:
            skills.append({"tag": target, "ability": stats[source]["accuracy"], "attempts": stats[source]["attempts"]})
    user = {"userCode": profile["userId"], "companyId": profile["companyId"], "department": profile["department"], "position": profile["position"],
            "companyName": organization.get("companyName", "Not provided"), "rank": organization.get("rank", "Not provided"),
            "phase": organization.get("phase", "easy"), "recentObjectives": organization.get("recentObjectives", []), "skills": skills}
    validate_context(user)
    return {"user": user, "profile": profile, "contextNotes": {
        "companyNameProvided": "companyName" in organization, "rankProvided": "rank" in organization,
        "phaseSource": "organization-context" if "phase" in organization else "starter-default",
        "behaviorScoreMeaning": "Unspecified; raw behavior values are preserved. Internal ability uses skill accuracy."}}
