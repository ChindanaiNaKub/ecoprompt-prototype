# 05 — Professor Questions (Cheat Sheet)

## Does the system measure exact carbon emissions?
No. EcoPrompt does not measure exact provider emissions. It reports provider token usage and calculates a modelled low/central/high operational carbon range using assumptions.

## Why not always use the smallest model?
Because fit matters. A too-small model can fail complex tasks and cause repeated requests, which can increase total usage.

## How does complexity classification work?
It is a rule-based heuristic using prompt signals such as length, structure, and task patterns. It is explainable but not perfect.

## Can users reject the recommendation?
Yes. Recommendations are advisory. Users can keep their current model or switch.

## How is privacy protected?
Prompt storage is opt-in. Sensitive keys stay server-side. Private data is protected behind authenticated access controls.

## What are the biggest limitations?
Rule-based classification limits, approximate pre-send token prediction, modelled (not measured) carbon ranges, and provider dependency.

## How was the system tested?
The repository documents passing automated tests and build verification for implemented logic and contracts, while deployed live-path checks still require manual verification.

## What would be improved in the future?
Improve classifier quality, support more providers, strengthen validation and deployment testing, and refine methodology assumptions.
