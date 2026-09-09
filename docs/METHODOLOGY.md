# EcoPrompt methodology and limitations

## What EcoPrompt reports

EcoPrompt reports two different things:

1. **Provider-reported tokens** after a Groq response. These are usage values returned by the provider.
2. **Modelled operational carbon range**. This is a sensitivity calculation, not a measurement of Groq's hardware, data centre, electricity procurement, or actual emissions.

The displayed formula is:

`modelled gCO₂e = (reported or predicted tokens / 1,000) × scenario Wh per 1,000 tokens × grid factor`

The app shows low, central, and high scenarios. The current scenario coefficients are deliberately versioned in code and must be replaced only after the research owner records the source, assumptions, and review date. They are not claimed to be Groq measurements.

## Why the range is necessary

Per-request inference impact depends on serving hardware, batching, model architecture, utilisation, data-centre overhead, and electricity location. These are not disclosed for the Groq requests used by EcoPrompt. The range communicates uncertainty instead of implying false precision.

## Validation protocol

- Compare predicted and provider-reported token counts after each live request; report the difference separately from carbon modelling.
- Verify formulas and units with fixed test cases before release.
- Triangulate scenario assumptions against at least two sources; document disagreements rather than averaging them without explanation.
- Do not compare this modelled range to a measured Groq footprint, and do not use real-world equivalences such as phone charges.

## Sources informing the method

- Jegham et al., [*How Hungry is AI?*](https://arxiv.org/abs/2505.09598), 2025 — infrastructure-aware inference benchmarking and variability across deployments.
- Google, [*Measuring the environmental impact of AI inference*](https://cloud.google.com/blog/products/infrastructure/measuring-the-environmental-impact-of-ai-inference), 2025 — explains why comprehensive inference accounting includes serving utilisation, idle capacity, CPU/RAM, and data-centre overhead.

These sources inform methodology, not a direct measurement of Groq-hosted model emissions.
