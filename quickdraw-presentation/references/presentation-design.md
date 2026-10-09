# Narrative design and provenance

Plan pages before native records. Useful storyboard fields are `file`, `purpose`, `idea`, `visual`, `example`, `takeaway`, `transition`, and `sources`. Sources belong in this sidecar and, when they qualify a visible claim, in concise board text. Keep verified evidence distinct from illustrative examples.

A technical explanation can show the whole mechanism, then a worked flow, then a limitation. A nontechnical story can introduce a person's situation, compare choices, and close with an experiment. Choose enough pages to support the requested duration rather than prescribing a universal arc. Give each page one dominant visual and sufficient space for readable labels. A comparison needs aligned alternatives; a process needs explicit connector direction; a timeline needs a clear reading order. Whiteboard composition and editable relationships take priority over decorative illustration.

## Sources used in authoring this skill

- Actual template: [tp6gw94/skills draw-explainer](https://github.com/tp6gw94/skills/tree/baf586ae378e3741a8b23c2259d9368d521d9935/draw-explainer). Builder, validator, packager, PNG codec, toolbar adapter, native viewer and regression tests copied within the user's repository, with only this skill's viewer/navigation and tests extended. The source repo has no root license at that revision; no new license is asserted for its code. Original draw-explainer stays unchanged.
- Narrative reference: [HubertHua/Presentation-Slides](https://github.com/HubertHua/Presentation-Slides/tree/d45939172e3aa27c3c9bdfdc0d681e10fddc17da), `SKILL.md`, `references/visual-design.md`, `references/content-richness.md`. Adapted concepts: purpose-driven story sequence, per-page idea and evidence, storyboard before composition, content density by purpose, navigation-safe space, and every-page visual review. No React template, runtime, assets or scripts copied. Its MIT notice is retained in [presentation-slides-LICENSE.txt](presentation-slides-LICENSE.txt).
- Runtime: [quickdrawjs/quickdraw](https://github.com/quickdrawjs/quickdraw/tree/dd653639aec1212c9ec5704e2eafd2a75560a0af), pinned exactly as draw-explainer. Refer to [contract.md](contract.md) for API and PNG provenance. CDN runtime remains external; retain upstream license if vendoring it later.

The environment's skill-creator and presentation guidance informed review practices only. No Anthropic proprietary pptx skill text, code or assets are included. Other suggested public presentation candidates were not incorporated.
