# Personalization policy, provisional version 1

Read the full user profile before planning. The adapter and tag mappings are defined in user-profile.md. Use company name, department, position and
rank to choose plausible workplace requests. Preserve these supplied facts exactly.

The runtime ranks the eight eligible knowledge objectives with:

`priority = 100 - ability - recentPenalty`

Use ability 50 for missing or unobserved skills. recentPenalty is 15 if the objective
appears in recentObjectives, otherwise 0. Ties use alphabetical tag order. The highest
priority is selected before the model runs. This simple provisional rule can be
replaced later; it is not the full recency/trend algorithm in the original design.

Measured behavior accuracy can guide the scenario's persuasion technique. It does not
change the fixed behavior weights. Scenario intensities describe the generated
email, not the learner's performance. Do not copy an ability score into an intensity.

Respect the supplied phase. Easy scenarios can use more direct, readily inspectable
evidence. Later phases may require comparing several facts or independent verification.
Both legitimate and phishing scenarios are useful; do not assume every generated
email must be phishing or that a high-rank employee must receive a harder phase.
