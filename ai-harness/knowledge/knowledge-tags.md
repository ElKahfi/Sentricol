# Knowledge risk indicators and learning objectives

These eight provisional weights reuse SENTRI's existing course defaults. They can
be replaced when the final design is supplied. They total 70, not the old 83.

| JSON tag | Weight | What to teach and inspect |
| --- | ---: | --- |
| senderIdentity | 10 | Compare claimed identity with actual sender and known contacts. |
| linkDestination | 10 | Inspect destination domains and independently known services. |
| attachmentSafety | 8 | Evaluate unexpected files, their type and requested actions. |
| requestContext | 8 | Compare a request with established work events and expectations. |
| credentialProtection | 10 | Recognize requests for passwords or other authentication secrets. |
| mfaSafety | 8 | Recognize code requests and unexpected authentication approvals. |
| sensitiveDataHandling | 8 | Check requests to disclose or transfer sensitive information. |
| authorizationChecks | 8 | Verify whether an action or request has appropriate authorization. |

In the derived internal context `skills`, these tags measure learner ability
(0–100, higher is better). The full public profile keeps its original `knowledge`
fields; mappings are documented in user-profile.md.
In `taskSpec.indicators`, they rate risk indicators actually present in the scenario
(0, .25, .5, .75, 1). A zero indicator can still be a learning objective: recognizing
a corroborated legitimate destination can teach linkDestination. Do not conflate
learner weakness, learning relevance and scenario risk intensity.

The course has additional learning tags, but this email harness initially selects
only these eight objectives. Do not invent aliases or extra schema fields.
