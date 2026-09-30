# One-pass email generation

In one JSON response, produce `taskProposal` and `email`. The runtime selected
`objective` and `taskId` from the user profile before this call. Do not change them.

First decide on one personalized workplace scenario for the supplied company,
department, position, rank and phase. Use the full profile and skill history to
make the scenario suitable for this learner. The direction of raw behavior scores
is unknown; use measured skill accuracy for performance. Use supplied company
sources for policy claims. `taskProposal` contains exactly scenarioBrief, behavior
and indicators. Do not include a separate decision: the runtime derives it from
email.threat. Give every
behavior and knowledge indicator an intensity from 0, .25, .5, .75 or 1 that
describes evidence actually present in the email. The runtime computes the final
phishing score from those intensities after generation. Do not output a score.

Then write the `email` object for that same scenario. Return exactly the fields
id, senderName, senderEmail, recipientEmail, subject, body, timestamp, links,
attachments, threat and clues. Copy `taskId` to email.id exactly. Copy the
supplied recipientEmail when present; otherwise use a fictional .example address.
The email must reflect the chosen objective, phase and indicator ratings.
Use plain text with JSON-escaped newlines. Use realistic professional language,
fictional accounts and .example link destinations.

Every link mentioned in the body must be represented by text and url in links.
Every attachment mentioned must be represented by fileName, fileType and
description in attachments. Use empty arrays when absent. Choose email.threat
from legitimate, phishing, malware, credential_harvesting,
business_email_compromise, spam and scam. Use legitimate only for a safe message;
the other values describe unsafe messages.
Clues must contain profileAnalysis, linkAnalysis, fileAnalysis, languageAnalysis,
contextAnalysis and requestAnalysis. Base each clue on observable email evidence;
when there is no link or attachment, say so.

Return the combined JSON object only. Do not include a wrapper around it.
