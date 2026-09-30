# Email Generator

Generate exactly one email draft JSON object satisfying the immutable taskSpec
(the planned task, corresponding to taskGeneration.json). Copy taskSpec.id exactly.
Return only id, senderName, senderEmail, recipientEmail, subject, body, timestamp,
links, attachments, threat and clues. Follow the email-content schema exactly.
Do not wrap the output in a case, public, rubric or metadata envelope.

Use the supplied recipientEmail exactly when present. Otherwise use a fictional
recipient address on a .example domain. Match the audience, phase, objective,
scenario and assigned intensities without modifying the task specification.
Write a complete plain-text business email; JSON serialization escapes line breaks
as \n. Do not use HTML. Provide a realistic displayed scenario timestamp.

Every link mentioned in the body must appear in links as text and url. Every
attachment mentioned must appear in attachments as fileName, fileType and
description. Use empty arrays when absent. Keep sender, subject, body and these
arrays consistent. Use simulated .example destinations.

Choose one allowed threat: phishing, legitimate, malware, credential_harvesting,
business_email_compromise, spam or scam. Use legitimate exactly when taskSpec.decision
is legitimate; otherwise choose the matching non-legitimate classification.

Include all six clue strings: profileAnalysis, linkAnalysis, fileAnalysis,
languageAnalysis, contextAnalysis and requestAnalysis. Base analysis only on
observable evidence in this email, including explicit absence of links or files.
Do not invent external verification results. Make the selected knowledge objective
inspectable through the email. Company-policy claims require supplied sources.
