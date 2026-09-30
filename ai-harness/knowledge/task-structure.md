# Task and email JSON contracts

The initial supported task type is email. Each generation request creates a draft.

1. The full user.json describes the learner. The runtime derives internal context
   using user-profile.md and separately supplied organization details.
2. The runtime selects a knowledge objective. For option 3, one model response
   contains both a proposal and an email. The proposal has scenarioBrief, behavior
   and indicators, with all intensities explicit. The runtime derives the decision
   from email.threat to keep the one-call output consistent.
3. The runtime creates taskSpec (the planned task corresponding to taskGeneration.json),
   adding schemaVersion, id, type, audience, phase, objective, phishingScore,
   scoreBand and scoringVersion. These values are immutable during email generation.
4. The runtime validates the proposal, computes PS, and checks that the email
   matches the task ID, decision and supplied recipient email. It returns the email
   object directly. A separately supplied task skips proposal generation.

The audience contains userCode, companyId, companyName, department, position and rank.
The phases are easy, normal, hard and master. Phase describes learning difficulty;
PS is a separate weighted scenario index. Neither replaces the explicit decision.

## Email draft fields

- id: exact ID of the planned task; never a new email ID.
- senderName, senderEmail: displayed sender identity.
- recipientEmail: supplied user email, or a fictional address when unavailable.
- subject: displayed subject.
- body: complete plain-text email, with newlines escaped as \n in serialized JSON.
- timestamp: displayed email timestamp as a string.
- links: array of objects containing exactly text and url; empty when absent.
- attachments: array of objects containing exactly fileName, fileType and description;
  empty when absent.
- threat: one of phishing, legitimate, malware, credential_harvesting,
  business_email_compromise, spam or scam. Must agree with the planned decision.
- clues: object containing six analysis strings: profileAnalysis, linkAnalysis,
  fileAnalysis, languageAnalysis, contextAnalysis and requestAnalysis.

All fields are required. Extra fields and wrappers are rejected. The worked example
is examples/email-content.json; schemas/email-content.schema.json is the machine
contract. Threat and clues are answer/feedback data: a learner-facing integration
must control when to reveal them.

Clues describe only evidence in the generated email. If there is no link or attachment,
state that absence instead of inventing one. Company-policy claims must come from
supplied sources. Use simulated .example destinations. Structural validation does
not prove semantic correctness; draft content still needs review. No automatic
approval or assignment occurs.
