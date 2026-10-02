(function (global) {
  "use strict";

  function toArray(targets) {
    if (!targets) return [];
    if (typeof targets === "string") {
      if (!global.document) return [];
      return Array.prototype.slice.call(global.document.querySelectorAll(targets));
    }
    if (targets.nodeType === 1) return [targets];
    return Array.prototype.slice.call(targets);
  }

  function numberOr(value, fallback) {
    var numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function requireTimeline(timeline) {
    if (!timeline || typeof timeline.fromTo !== "function") {
      throw new Error("[ExplainerAnimations] a GSAP timeline is required as the first argument.");
    }
  }

  function reveal(timeline, targets, options) {
    requireTimeline(timeline);
    var settings = options || {};
    var list = toArray(targets);
    if (!list.length) return timeline;

    var from = {
      autoAlpha: 0,
      y: numberOr(settings.dy, 24),
      x: numberOr(settings.dx, 0)
    };
    var to = {
      autoAlpha: 1,
      y: 0,
      x: 0,
      duration: numberOr(settings.duration, 0.65),
      stagger: numberOr(settings.stagger, 0),
      ease: settings.ease || "power3.out",
      immediateRender: true
    };
    if (settings.scale != null) {
      var origin = settings.transformOrigin || "50% 50%";
      from.scale = numberOr(settings.scale, 0.9);
      from.transformOrigin = origin;
      to.scale = 1;
      to.transformOrigin = origin;
    }
    timeline.fromTo(list, from, to, numberOr(settings.at, 0));
    return timeline;
  }

  function draw(timeline, targets, options) {
    requireTimeline(timeline);
    var settings = options || {};
    var list = toArray(targets);
    var at = numberOr(settings.at, 0);
    var stagger = numberOr(settings.stagger, 0);
    var duration = numberOr(settings.duration, 0.85);
    var ease = settings.ease || "power2.out";
    var finalOpacity = settings.opacity == null ? 1 : numberOr(settings.opacity, 1);

    list.forEach(function (path, index) {
      var length = 0;
      if (typeof path.getTotalLength === "function") {
        try { length = path.getTotalLength(); } catch (error) { length = 0; }
      }
      timeline.fromTo(path, {
        strokeDasharray: length + " " + length,
        strokeDashoffset: length,
        autoAlpha: 0
      }, {
        strokeDashoffset: 0,
        autoAlpha: finalOpacity,
        duration: duration,
        ease: ease,
        immediateRender: true
      }, at + index * stagger);
    });
    return timeline;
  }

  global.ExplainerAnimations = {
    reveal: reveal,
    draw: draw
  };
})(typeof window !== "undefined" ? window : globalThis);
