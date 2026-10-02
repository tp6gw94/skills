---
name: gsap-explainer
description: Turn an article, paper, transcript, or complex answer into a lightweight browser-playable visual explainer using a single HTML file, inline SVG, and GSAP. Use for animated article summaries, diagram-led explanations, or custom explainer videos without React or a bundler.
---

# GSAP explainer

Create a custom visual explanation that helps the viewer understand the source. Treat the source as evidence, not as a script to display verbatim.

## Interpret the source

Identify the central claim, the supporting ideas, and the relationship between them. Resolve missing context before building when it would change the explanation. Keep factual claims traceable to the supplied source or cited research.

Choose the shortest useful form:

- Use clear prose when motion adds no meaning.
- Use a diagram when position, sequence, hierarchy, or causality matters.
- Use interaction when the viewer benefits from controlling pace or comparing states.
- Use a timed explainer when motion reveals the reasoning step by step.

The result is complete when every scene advances one coherent mental model and no scene exists only for decoration.

## Write for narration and screens

Use an approachable version of ASD-STE100: short sentences, concrete verbs, stable terminology, and one idea per sentence. Preserve necessary technical terms and define them at first use.

Separate narration from on-screen text. Narration may explain. On-screen text should label, orient, or state the current conclusion. Keep paragraphs out of the stage.

Build a scene outline before coding. For each scene, specify:

1. The point the viewer should understand.
2. The visual change that makes that point visible.
3. The narration or caption.
4. The exit condition that leads to the next scene.

## Build the artifact

Reuse mechanics; design the explanation from the source. [assets/player.js](assets/player.js) owns playback, navigation, progress, keyboard controls, reduced motion, and static fallback. [assets/animation-helpers.js](assets/animation-helpers.js) offers optional reveal and path-drawing helpers. Author each scene's DOM and GSAP timeline freely; choose its geometry, theme, pacing, and visual metaphor. Direct SVG and GSAP remain valid when a helper does not fit.

[assets/explainer-template.html](assets/explainer-template.html) is an editable shell with sample scenes, not a prescribed diagram layout or story. Read [references/runtime.md](references/runtime.md) when integrating the utilities. Use the packaged source instead of regenerating player code.

Produce one `index.html` with inline CSS, inline SVG, and inline JavaScript. Assemble a draft with `node <skill-dir>/scripts/assemble.mjs <draft.html> <output/index.html>` to inline the marked utilities; the viewer needs no Node, npm, or build step. Load GSAP 3 from a pinned CDN URL. If the user requires offline playback, inline a user-supplied or locally available `gsap.min.js` instead of the CDN script.

Use semantic HTML for controls and SVG for diagrams. Use GSAP timelines for scene order, entrances, exits, emphasis, and transforms. Prefer transforms and opacity for smooth playback. Keep visual state in the DOM so text remains selectable and accessible.

The artifact must:

- Open directly in a current desktop browser without React, npm, or a build step.
- Fit a 16:9 stage and scale down without clipping.
- Include play or pause, restart, previous scene, next scene, and a progress indicator.
- Support keyboard controls: Space for play or pause, Left and Right for scene navigation, and R for restart.
- Pause when the viewer requests reduced motion and allow manual scene navigation.
- Show a useful error message if GSAP fails to load.
- Credit the source in a compact end card when attribution is available.

Keep animation tied to meaning. Draw connections when explaining relationships. Move objects when explaining change. Highlight only the element discussed at that moment. Decorative motion must not compete with the explanation.

## Verify in the browser

Use a quick pass by default:

- Inspect every scene's completed frame for readable text, meaningful connections, and safe-area fit.
- Sample representative or unfamiliar animations at their start, midpoint, and end.
- Exercise play/pause, scene navigation, restart, and keyboard controls; check one narrow viewport and the console.

Use a full pass when shared playback utilities or the GSAP version change, a quick failure points to shared mechanics, or the user requests thorough QA. Include scene timing, backward navigation, completion/replay, keyboard focus, reduced motion, and GSAP-load failure. Run the focused assembly tests with `node --test <skill-dir>/tests/assemble.test.mjs` when changing assembly behavior.

Batch browser checks in one session. After a fix, recheck the affected behavior instead of restarting unrelated checks. Reuse validation evidence only for unchanged utility versions; each new explanation still needs its content and layout checked. Distinguish automation/environment effects from artifact failures before changing code.

Fix observed artifact failures before delivery. If the environment cannot load the GSAP CDN, report that limitation and verify the static layout and manual navigation.

Deliver the HTML and state whether playback, controls, responsive layout, and console output were verified.
