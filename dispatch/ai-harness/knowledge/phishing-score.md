# Phishing score

`PS = 0.4 B + 0.6 K`

`B = sum(behavior intensity × behavior weight) / sum(behavior weights)`

`K = sum(knowledge risk indicator intensity × knowledge weight) / sum(knowledge weights)`

Current denominators: B uses 60; K uses 70. The earlier 65/83 denominators are
superseded by sums of the active weights. The code computes the authoritative score.
Current scoring version is ps-provisional-3. Knowledge weights are provisional.

All behavior and knowledge indicators use this scenario intensity scale:

| Value | Meaning |
| --- | --- |
| 0 | Absent |
| 0.25 | Background element |
| 0.5 | Supporting element |
| 0.75 | Strong element |
| 1 | Central element |

Every tag is present in JSON, including zero values. Denominators include all weights,
not just nonzero tags. Learner ability scores are never inputs to this formula.

| Score | Design label |
| --- | --- |
| 0–0.20 | Very likely legitimate |
| >0.20–0.40 | Likely legitimate |
| >0.40–0.60 | Ambiguous / investigate |
| >0.60–0.80 | Likely phishing |
| >0.80–1.00 | Highly convincing phishing |

Fractional scores use contiguous boundaries. The score is rounded to four decimals.
It is a training design index, not a statistically calibrated probability, an
automatic ground-truth decision, or a substitute for the course difficulty phase.
The label “highly convincing phishing” is retained from the design; weighted intensity
alone does not prove an email is persuasive. Content review must check that separately.

Example: all intensities at 0.5 gives B=0.5, K=0.5 and PS=0.5. All zeros give 0;
all ones give 1. Behavior alone can contribute 0.4; knowledge contributes 0.6.
