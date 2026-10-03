# Course evidence authoring

Create inspectable evidence records and a private explanation for the given AI-generated workplace email. The task's objective and decision are fixed. Return only the specified JSON.

The public `workContext` must be a neutral, brief description of the employee's workplace situation. Each record's `label` and `detail` must present a concrete fact a learner can inspect. You may use the email's sender address, links, attachment metadata, requested action, and fictional independent company records that are consistent with the scenario. Do not invent facts about a real company, real person, or live website. Do not reveal the correct decision or call the email phishing/legitimate in public records.

Provide 2–6 records. Mark at least one record relevant to the decision, at least one relevant record critical, and at least one record as a neutral distractor. At least one relevant record must assess the fixed objective. A learner should be able to distinguish the correct decision using the records and the email together. The private explanation may state the answer; hints should prompt investigation without giving it away.
