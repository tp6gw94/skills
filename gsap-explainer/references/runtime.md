# Explainer runtime

The starter loads two classic-script utilities and a pinned GSAP build. `scripts/assemble.mjs` inlines the utilities into a single file for delivery. The viewer needs no build step, npm, or local utility files.

## Player API

`window.ExplainerPlayer.create(options)` returns a player instance.

`options`:

- `scenes` (required): array of scene entries. Each entry is `{ element, createTimeline?, title? }`.
  - `element`: the scene DOM node.
  - `createTimeline(context)`: optional factory, called only when GSAP loaded. `context` is `{ gsap, element, index, animation }`, where `animation` is `window.ExplainerAnimations` or `null`. Return a `gsap.timeline`. Return nothing for a static scene, which advances on the next playback tick. Add a hold tween to an authored timeline when a still scene needs reading time.
  - `title`: optional label passed to `onSceneChange`.
- `controls` (optional): `{ previous, next, restart, toggle, progress, counter, status, jump }`. `progress` is the element the player fills with width. `jump` is a list of buttons; each uses its `data-jump` value or its position. Missing controls are ignored.
- `labels` (optional): partial override of the English defaults. Keys: `play`, `pause`, `replay`, `previous`, `next`, `restart`, `jump`, `playing`, `paused`, `previewText`, `completed`, `missingGsap`, `reducedMotion`. The `playing`, `paused`, and `previewText` formatters receive `(sceneNumber, sceneCount, title)`; `jump` receives the target scene number. `previous`, `next`, and `restart` provide missing accessible names; their visible text or icons remain author-owned.
- `onSceneChange(state)` (optional): called whenever observable state changes. It runs after scene, play/pause, preview, and completion changes, not on each animation frame. Use it to synchronize authored captions.

Methods: `play()`, `pause()`, `toggle()`, `previous()`, `next()`, `restart()`, `goTo(index)`, `seek(index, fraction)`, `getState()`, `destroy()`.

`getState()` returns `{ sceneIndex, sceneCount, title, playing, preview, completed, fraction, reducedMotion, gsapAvailable, duration, sceneDuration, elapsed, percent }`.

Behavior:

- Starts paused with scene 0 shown in its completed state.
- Previous, next, jump, and restart show a completed scene while paused; restart returns to scene 0.
- Play from a static preview replays that scene. Pause and resume keep the current frame.
- Completion holds the final scene. Replay after completion starts at scene 0.
- `prefers-reduced-motion` stops active playback, shows the complete current scene, and keeps manual navigation. It never auto-plays when the preference returns.
- A missing GSAP leaves the static diagrams readable, disables playback, and keeps previous/next/restart/jump working.
- `destroy()` releases only this instance's listeners and timelines.

## Animation helpers

`window.ExplainerAnimations`:

- `reveal(timeline, targets, { at, duration, stagger, dy, dx, scale, transformOrigin, ease })`
- `draw(timeline, targets, { at, duration, stagger, opacity, ease })`

Both add `fromTo` tweens with `immediateRender: true`, so future targets stay hidden until their scheduled entrance, including after backward seeking. Use direct GSAP tweens for effects these helpers cannot express. They are conveniences, not a diagram language.

## Minimal custom scene

```js
window.explainer = window.ExplainerPlayer.create({
  scenes: [{
    element: document.querySelector("#scene"),
    title: "My scene",
    createTimeline: function (context) {
      var timeline = context.gsap.timeline({ paused: true });
      if (context.animation) {
        context.animation.reveal(timeline, context.element.querySelectorAll("[data-enter]"), { at: 0.2 });
      } else {
        timeline.fromTo(context.element.querySelectorAll("[data-enter]"),
          { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: true }, 0.2);
      }
      timeline.to({}, { duration: 3 });
      return timeline;
    }
  }],
  controls: { toggle: document.querySelector("#toggle"), status: document.querySelector("#status") },
  onSceneChange: function (state) { document.title = state.title; }
});
```

## Assembly

```sh
node /absolute/skill/path/scripts/assemble.mjs /path/to/draft.html /path/to/index.html
```

In the draft, mark packaged utilities with empty script tags:

```html
<script data-explainer-util="player" src="./player.js"></script>
<script data-explainer-util="animations" src="./animation-helpers.js"></script>
```

Known markers are `player` and `animations`. The `animations` marker is optional. The script replaces each marker with an inline `<script>`, preserves everything else including the pinned GSAP URL, creates the output directory, and resolves the packaged utilities relative to its own location, so the caller's working directory does not matter. An unknown marker fails with an error.

## Utility regression checks

Run assembly checks when the assembler changes:

```sh
node --test /absolute/skill/path/tests/assemble.test.mjs
```

When shared playback changes, assemble the packaged starter, then run its browser checks through Ego:

```sh
node /absolute/skill/path/scripts/assemble.mjs /absolute/skill/path/assets/explainer-template.html /tmp/explainer-check.html
ego-browser nodejs <<'EOF'
const { checkPlayer } = await import("/absolute/skill/path/tests/player.browser.mjs");
await checkPlayer({ taskSpace, url: "file:///tmp/explainer-check.html" });
EOF
```

Pass `spaceId` when reusing this goal's existing Ego TaskSpace; its owner finishes that space. Otherwise the check creates and finishes one space. Optional `reportDirectory` saves results and two screenshots. These checks target the packaged player/starter, not each new explanation.

## Limitations

- The player is a mechanism, not a layout. It does not build diagram DOM, choose scene meaning, style typography or colors, or animate children it was not asked to animate.
- The utilities are classic scripts for `file://` compatibility, not ES modules.
- Browser automation may run with the page hidden, which throttles animation frames. Check visibility and ticker state before treating a slow or stalled automated run as a player defect.
