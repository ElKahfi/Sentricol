# Behavior tags and fixed weights

These tags describe persuasion present in a scenario. Learner skill observations
describe how the learner handled it; they are separate from scenario intensity.

| JSON tag | Weight | Meaning |
| --- | ---: | --- |
| authority | 10 | Pressure based on claimed power, seniority or official status. |
| urgency | 10 | A deadline or demand for immediate action that discourages checking. |
| fear | 9 | Threatened loss, punishment or negative consequences. |
| curiosity | 7 | An intriguing or withheld detail intended to draw engagement. |
| rewardIncentive | 8 | Promised benefit, reward or opportunity; replaces Greed. |
| helpfulness | 7 | An appeal to assist a colleague, customer or organization. |
| familiarityImpersonation | 9 | Borrowed trust through a familiar person, brand or relationship. |
| Total | 60 | Normalization denominator is computed from active weights. |

The intensity scale is defined in phishing-score.md. Do not add Scarcity or
Reciprocity to this seven-tag contract. Familiarity/Impersonation consolidates the
related trust/familiarity concepts for this starter; legacy records need explicit
mapping. Familiar language or urgency can also appear in legitimate messages and
does not independently establish malicious intent.
