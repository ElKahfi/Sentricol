# User profile contract

The public input is the user's full `user.json`, validated against
`schemas/user-context.schema.json`. `examples/user.json` preserves the supplied
profile and its original field names. Do not require the learner to flatten it.

| Field | Meaning |
| --- | --- |
| userId | Stable learner identifier, e.g. usr_0001. |
| employeeId | Employee reference, e.g. EMP-001245. |
| name, email | Employee identity supplied in the profile. |
| companyId | Company lookup and policy scope, not the company name. |
| department, position | Department and job title used for scenario relevance. |
| joinedAt | Profile joining timestamp. |
| progression | level, experience and nextLevelExp. Zero is valid; do not divide by nextLevelExp when zero. |
| knowledge | Per-skill scores on a 0–100 scale, preserved as provided. |
| behavior | Original behavior scores on a 0–100 scale. Their direction is not yet specified; do not assume higher means either vulnerability or mastery. |
| skillStatistics | Optional observations per supported profile tag. |
| statistics | Aggregate task counts, rates, timing and lastPlayed. |

Each skillStatistics entry has attempts, correct, wrong, accuracy (0–100),
averageDecisionTime, averageInvestigationTime, investigationRate and verificationRate
(0–1), perfectAttempts, currentStreak, bestStreak, recentHistory (booleans),
lastPracticed and lastUpdated. Timing is interpreted provisionally as seconds.
A missing entry or zero attempts indicates insufficient measured history.
A knowledge score of zero with recorded attempts is a real supplied score, not missing data.
Knowledge and accuracy are distinct values and must not overwrite each other.

The model should read each `skillStatistics` value as an ordinary JSON object. For
example, the supplied profile's `attachmentSafety` entry looks like this:

```json
{
  "attempts": 12,
  "correct": 9,
  "wrong": 3,
  "accuracy": 75.0,
  "averageDecisionTime": 16.8,
  "averageInvestigationTime": 13.2,
  "investigationRate": 0.94,
  "verificationRate": 0.81,
  "perfectAttempts": 5,
  "currentStreak": 2,
  "bestStreak": 6,
  "recentHistory": [
    true,
    false,
    true,
    true,
    true,
    false,
    true,
    false,
    true,
    true
  ],
  "lastPracticed": "2026-07-08T13:20:00Z",
  "lastUpdated": "2026-07-08T13:20:00Z"
}
```

`accuracy: 75.0` is a percentage. `investigationRate: 0.94` and
`verificationRate: 0.81` are fractions. `recentHistory` records outcomes as
booleans. The model receives values like these, never the schema's `type`,
`minimum`, or `maximum` descriptors as user data.

Aggregate statistics include tasksCompleted, correct, wrong, emailsCompleted,
passwordCompleted, classificationCompleted, avgDecisionTime, avgInvestigationTime,
investigationRate, verificationRate, falsePositiveRate, falseNegativeRate,
perfectTasks, streak and lastPlayed. Keep rates distinct from percentages.

## Related organization context

The provided profile contains no companyName, rank or course phase. A trusted caller
can supply these separately (`--context ai-harness/examples/organization-context.json` in the CLI).
When unavailable, company name and rank are marked `Not provided`. The starter uses
phase easy, explicitly marked as a default, without converting progression.level.
Do not use `Not provided` as a fictional company name in generated content.
Do not infer organization rank from position or from progression.level.

## Internal adapter

The runtime preserves the complete profile for task planning and builds a compact
internal context for selection/retrieval. This is not a replacement public user JSON.
userId maps to internal userCode. Company ID and job information are copied exactly.

| Course objective | Profile knowledge sources |
| --- | --- |
| senderIdentity | senderVerification, spoofing |
| linkDestination | urlInspection, domainAwareness |
| attachmentSafety | attachmentSafety |
| credentialProtection | credentialProtection |
| mfaSafety | mfa |
| sensitiveDataHandling | dataHandling |

For multiple sources, use the lowest knowledge score with recorded attempts and
keep that source's attempt count; do not add overlapping observations. requestContext
and authorizationChecks have no exact profile equivalents and remain unobserved.
password and classification remain in the original profile for future task types.

Behavior mappings are authority→authority, urgency→urgency, fear→fear,
curiosity→curiosity, greed→rewardIncentive, helpfulness→helpfulness and
trust→familiarityImpersonation. These mappings are provisional relationships, not
claims that the concepts are identical. Internal behavior ability uses measured
skillStatistics.accuracy because raw behavior score direction is unspecified.
carelessness, overconfidence and fatigue remain available in the full profile but
are not added to the seven scenario-weight tags. No profile score enters PS directly.

The profile has recentHistory per skill, but no ordered task-objective history.
Do not invent recentObjectives from boolean results. Related context may supply it;
otherwise the runtime applies no recent-objective penalty. The planner can inspect
accuracy, timing, history and timestamps as supporting context; the deterministic
selection rule remains the documented provisional rule in personalization.md.

The supplied example has some recentHistory arrays longer than the corresponding
attempt count (for example spoofing). The harness preserves those arrays and does
not recompute totals or accuracy from them. They are independent supplied context;
resolving their aggregation window requires a later data-model decision.
