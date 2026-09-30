# Matching worked example

All records here are authored fictional examples, not outputs verified against a
live model. They show the contracts in one coherent Finance scenario.

1. `internal-user-context.json`: original compact Finance demonstration, weakest in linkDestination.
2. `knowledge.json`: example Finance policy, supplied explicitly to the CLI.
3. `task-proposal.json`: planner output; only premise, decision and ratings.
4. `task-spec.json`: runtime adds the audience, fixed objective, phase and computed PS.
5. `email-content.json`: the exact email draft object returned by the generator.
6. `generated-draft.json`: the final output, identical in structure to email-content.json, with the task ID.
7. `chat-request.json` and `chat-response.json`: a question and a policy-grounded answer.

The draft's phishing score is derived from its ratings, not manually selected to
force a band. The explicit threat classification remains the answer key even when the aggregate
band is ambiguous. Current weights are provisional. These files are documentation
fixtures and are not automatically included in prompts or published into training.

## Full user profile input

`user.json` is now the exact full profile provided for SENTRI, including progression,
knowledge, behavior, skillStatistics and statistics. `organization-context.json`
is separately supplied illustrative organization information, not facts inferred from
that profile. `profile-task-spec.json` demonstrates its planned task with default
unknown company/rank and easy phase; senderIdentity is selected from the observed
senderVerification score of zero. The original worked email above uses
`internal-user-context.json`, which is retained for compatibility demonstrations.
