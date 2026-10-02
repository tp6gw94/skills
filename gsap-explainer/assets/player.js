(function (global) {
  "use strict";

  var DEFAULT_LABELS = {
    play: "Play",
    pause: "Pause",
    replay: "Replay",
    previous: "Previous scene",
    next: "Next scene",
    restart: "Restart",
    jump: function (index) { return "Go to scene " + index; },
    playing: function (index, total, title) {
      return "Playing scene " + index + " of " + total + (title ? ": " + title : "") + ".";
    },
    paused: function (index, total) {
      return "Paused at scene " + index + " of " + total + ". Press Play to continue.";
    },
    previewText: function (index, total) {
      return "Scene " + index + " of " + total + " is shown complete. Press Play to start this scene.";
    },
    completed: "Finished. The final scene is held. Press Replay to start again.",
    missingGsap: "GSAP did not load. Playback is unavailable; use the scene navigation to read the complete diagrams.",
    reducedMotion: "Reduced motion is active. Playback is paused; use the scene navigation."
  };

  function normalizeScenes(scenes) {
    var list = scenes ? Array.prototype.slice.call(scenes) : [];
    var normalized = [];
    list.forEach(function (entry) {
      var scene = entry && entry.nodeType === 1 ? { element: entry } : entry;
      if (scene && scene.element && scene.element.nodeType === 1) normalized.push(scene);
    });
    return normalized;
  }

  function mergeLabels(overrides) {
    var labels = {};
    Object.keys(DEFAULT_LABELS).forEach(function (key) { labels[key] = DEFAULT_LABELS[key]; });
    if (overrides) {
      Object.keys(overrides).forEach(function (key) {
        if (overrides[key] != null) labels[key] = overrides[key];
      });
    }
    return labels;
  }

  function labelText(value, args) {
    return typeof value === "function" ? value.apply(null, args) : value;
  }

  function isInteractive(target) {
    if (!target || target.nodeType !== 1) return false;
    if (target.isContentEditable) return true;
    if (typeof target.closest !== "function") return false;
    return Boolean(target.closest(
      'a, button, input, textarea, select, summary, [contenteditable], [role="button"], [role="link"], [role="slider"]'
    ));
  }

  function jumpIndex(button, position) {
    var declared = button && button.dataset ? button.dataset.jump : null;
    var numeric = Number(declared);
    return declared != null && Number.isFinite(numeric) ? Math.floor(numeric) : position;
  }

  function ExplainerPlayer(options) {
    var config = options || {};
    this.scenes = normalizeScenes(config.scenes);
    this.controls = config.controls || {};
    this.labels = mergeLabels(config.labels);
    this.onSceneChange = typeof config.onSceneChange === "function" ? config.onSceneChange : null;
    this.gsap = global.gsap || null;
    this.gsapAvailable = Boolean(this.gsap);
    this.motionQuery = typeof global.matchMedia === "function"
      ? global.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    this.reducedMotion = this.motionQuery ? this.motionQuery.matches : false;
    this.timelines = [];
    this.cleanups = [];
    this.tick = null;
    this.destroyed = false;
    this.timelineError = null;
    this.state = {
      sceneIndex: 0,
      fraction: 1,
      playing: false,
      preview: true,
      completed: false,
      rendering: false
    };

    this.buildTimelines();
    this.wireControls();
    this.wireKeyboard();
    this.wireMotion();
    this.wireTicker();

    if (this.scenes.length > 0) this.goTo(0);
    else this.update();
  }

  ExplainerPlayer.create = function (options) {
    return new ExplainerPlayer(options || {});
  };

  ExplainerPlayer.prototype.buildTimelines = function () {
    var self = this;
    this.scenes.forEach(function (scene, index) {
      var timeline = null;
      if (self.gsapAvailable && typeof scene.createTimeline === "function") {
        try {
          timeline = scene.createTimeline({
            gsap: self.gsap,
            element: scene.element,
            index: index,
            animation: global.ExplainerAnimations || null
          });
        } catch (error) {
          self.timelineError = error;
          if (global.console && global.console.error) {
            global.console.error("[ExplainerPlayer] scene timeline factory failed", error);
          }
        }
      }
      if (timeline && typeof timeline.progress === "function") {
        timeline.pause();
        self.timelines[index] = timeline;
      } else {
        self.timelines[index] = null;
      }
    });
  };

  ExplainerPlayer.prototype.bind = function (target, type, handler) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, handler);
    this.cleanups.push(function () { target.removeEventListener(type, handler); });
  };

  ExplainerPlayer.prototype.wireControls = function () {
    var self = this;
    var controls = this.controls;
    ["previous", "next", "restart"].forEach(function (name) {
      var control = controls[name];
      if (control && !control.hasAttribute("aria-label")) {
        control.setAttribute("aria-label", labelText(self.labels[name], [1, self.scenes.length]));
      }
    });
    this.bind(controls.previous, "click", function () { self.previous(); });
    this.bind(controls.next, "click", function () { self.next(); });
    this.bind(controls.restart, "click", function () { self.restart(); });
    this.bind(controls.toggle, "click", function () { self.toggle(); });
    if (controls.jump) {
      Array.prototype.forEach.call(controls.jump, function (button, position) {
        var index = jumpIndex(button, position);
        self.bind(button, "click", function () { self.goTo(index); });
      });
    }
  };

  ExplainerPlayer.prototype.wireKeyboard = function () {
    var self = this;
    this.bind(global, "keydown", function (event) { self.handleKeydown(event); });
  };

  ExplainerPlayer.prototype.handleKeydown = function (event) {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isInteractive(event.target)) return;
    if (event.code === "Space") {
      event.preventDefault();
      this.toggle();
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      this.previous();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      this.next();
    } else if (typeof event.key === "string" && event.key.toLowerCase() === "r") {
      event.preventDefault();
      this.restart();
    }
  };

  ExplainerPlayer.prototype.wireMotion = function () {
    var self = this;
    var query = this.motionQuery;
    if (!query) return;
    this.motionHandler = function (event) { self.handleMotionChange(event.matches); };
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", this.motionHandler);
      this.cleanups.push(function () { query.removeEventListener("change", self.motionHandler); });
    } else if (typeof query.addListener === "function") {
      query.addListener(this.motionHandler);
      this.cleanups.push(function () { query.removeListener(self.motionHandler); });
    }
  };

  ExplainerPlayer.prototype.handleMotionChange = function (matches) {
    this.reducedMotion = Boolean(matches);
    if (this.reducedMotion) {
      this.state.playing = false;
      this.timelines.forEach(function (timeline) { if (timeline) timeline.pause(); });
      this.activateScene(this.state.sceneIndex, 1, true);
    } else {
      this.update();
    }
  };

  ExplainerPlayer.prototype.wireTicker = function () {
    var self = this;
    if (!this.gsapAvailable) return;
    this.tick = function () { self.onTick(); };
    this.gsap.ticker.add(this.tick);
    this.cleanups.push(function () { self.gsap.ticker.remove(self.tick); });
  };

  ExplainerPlayer.prototype.onTick = function () {
    var state = this.state;
    if (this.destroyed || state.rendering || !state.playing) return;
    var timeline = this.timelines[state.sceneIndex];
    if (!timeline || timeline.duration() === 0) {
      state.fraction = 1;
      this.updateProgress();
      this.advance();
      return;
    }
    var progress = timeline.progress();
    state.fraction = progress;
    this.updateProgress();
    if (progress >= 1 - 1e-6) this.advance();
  };

  ExplainerPlayer.prototype.playActive = function () {
    var timeline = this.timelines[this.state.sceneIndex];
    if (timeline) timeline.play();
  };

  ExplainerPlayer.prototype.advance = function () {
    var state = this.state;
    if (this.destroyed) return;
    if (state.sceneIndex < this.scenes.length - 1) {
      this.activateScene(state.sceneIndex + 1, 0, false);
      this.playActive();
    } else {
      state.playing = false;
      state.completed = true;
      state.fraction = 1;
      this.update();
    }
  };

  ExplainerPlayer.prototype.clampIndex = function (index) {
    var last = this.scenes.length - 1;
    var numeric = Number(index);
    if (!Number.isFinite(numeric)) return Math.max(0, Math.min(this.state.sceneIndex, last));
    return Math.max(0, Math.min(last, Math.floor(numeric)));
  };

  ExplainerPlayer.prototype.activateScene = function (index, fraction, previewRequested) {
    var state = this.state;
    if (this.scenes.length === 0) return;
    state.rendering = true;
    this.timelines.forEach(function (timeline) { if (timeline) timeline.pause(); });

    var target = this.clampIndex(index);
    state.sceneIndex = target;
    var canAnimate = this.gsapAvailable && !this.reducedMotion;
    var numeric = Number(fraction);
    state.fraction = canAnimate && Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : 1;
    state.preview = Boolean(previewRequested) || !canAnimate;
    state.completed = !state.preview && target === this.scenes.length - 1 && state.fraction >= 1;

    this.scenes.forEach(function (scene, position) {
      var active = position === target;
      if (active) scene.element.removeAttribute("hidden");
      else scene.element.setAttribute("hidden", "");
      scene.element.setAttribute("aria-hidden", active ? "false" : "true");
    });

    if (this.gsapAvailable) {
      var timeline = this.timelines[target];
      if (timeline) {
        timeline.pause();
        timeline.progress(state.fraction, true);
      }
    }

    state.rendering = false;
    this.update();
  };

  ExplainerPlayer.prototype.play = function () {
    var state = this.state;
    if (!this.gsapAvailable || this.reducedMotion || state.playing) return;
    if (this.scenes.length === 0) return;
    if (state.completed) {
      this.activateScene(0, 0, false);
    } else if (state.preview || state.fraction >= 1) {
      this.activateScene(state.sceneIndex, 0, false);
    }
    state.playing = true;
    state.preview = false;
    state.completed = false;
    this.playActive();
    this.update();
  };

  ExplainerPlayer.prototype.pause = function () {
    if (!this.state.playing) return;
    this.state.playing = false;
    this.timelines.forEach(function (timeline) { if (timeline) timeline.pause(); });
    this.update();
  };

  ExplainerPlayer.prototype.toggle = function () {
    if (this.state.playing) this.pause();
    else this.play();
  };

  ExplainerPlayer.prototype.navigate = function (index) {
    if (this.scenes.length === 0) return;
    this.state.playing = false;
    this.activateScene(this.clampIndex(index), 1, true);
  };

  ExplainerPlayer.prototype.previous = function () { this.navigate(this.state.sceneIndex - 1); };

  ExplainerPlayer.prototype.next = function () { this.navigate(this.state.sceneIndex + 1); };

  ExplainerPlayer.prototype.restart = function () { this.navigate(0); };

  ExplainerPlayer.prototype.goTo = function (index) { this.navigate(index); };

  ExplainerPlayer.prototype.seek = function (index, fraction) {
    if (this.scenes.length === 0) return this.getState();
    this.state.playing = false;
    this.activateScene(index, fraction == null ? 1 : fraction, false);
    return this.getState();
  };

  ExplainerPlayer.prototype.sceneDuration = function (index) {
    var timeline = this.timelines[index];
    return timeline && typeof timeline.duration === "function" ? timeline.duration() : 0;
  };

  ExplainerPlayer.prototype.totalDuration = function () {
    var total = 0;
    for (var i = 0; i < this.scenes.length; i += 1) total += this.sceneDuration(i);
    return total;
  };

  ExplainerPlayer.prototype.elapsed = function () {
    var elapsed = 0;
    for (var i = 0; i < this.state.sceneIndex; i += 1) elapsed += this.sceneDuration(i);
    var fraction = this.state.preview ? 1 : Math.max(0, Math.min(1, this.state.fraction));
    return elapsed + this.sceneDuration(this.state.sceneIndex) * fraction;
  };

  ExplainerPlayer.prototype.overallPercent = function () {
    var count = this.scenes.length;
    if (count === 0) return 0;
    var total = this.totalDuration();
    if (total <= 0) {
      var position = this.state.sceneIndex + (this.state.preview ? 1 : Math.max(0, Math.min(1, this.state.fraction)));
      return Math.max(0, Math.min(100, (position / count) * 100));
    }
    return Math.max(0, Math.min(100, (this.elapsed() / total) * 100));
  };

  ExplainerPlayer.prototype.updateProgress = function () {
    var progress = this.overallPercent();
    var bar = this.controls.progress;
    if (!bar || !bar.style) return;
    bar.style.width = progress + "%";
    var track = bar.parentElement;
    if (track && typeof track.setAttribute === "function") {
      track.setAttribute("aria-valuenow", progress.toFixed(1));
    }
  };

  ExplainerPlayer.prototype.statusText = function () {
    var state = this.state;
    var total = this.scenes.length;
    var index = state.sceneIndex + 1;
    var scene = this.scenes[state.sceneIndex];
    var title = scene && scene.title ? scene.title : "";
    if (!this.gsapAvailable) return this.labels.missingGsap;
    if (this.reducedMotion) return this.labels.reducedMotion;
    if (state.playing) return labelText(this.labels.playing, [index, total, title]);
    if (state.completed) return labelText(this.labels.completed, [index, total]);
    if (state.preview) return labelText(this.labels.previewText, [index, total, title]);
    return labelText(this.labels.paused, [index, total, title]);
  };

  ExplainerPlayer.prototype.updateControls = function () {
    var controls = this.controls;
    var state = this.state;
    var total = this.scenes.length;
    var canPlay = this.gsapAvailable && !this.reducedMotion;

    if (controls.previous) controls.previous.disabled = state.sceneIndex === 0;
    if (controls.next) controls.next.disabled = state.sceneIndex === total - 1;
    if (controls.toggle) {
      var key = state.playing ? "pause" : state.completed ? "replay" : "play";
      var text = labelText(this.labels[key], [state.sceneIndex + 1, total]);
      controls.toggle.disabled = !canPlay;
      controls.toggle.textContent = text;
      controls.toggle.setAttribute("aria-label", text);
      controls.toggle.setAttribute("aria-pressed", String(state.playing));
    }
    if (controls.jump) {
      Array.prototype.forEach.call(controls.jump, function (button, position) {
        var target = this.clampIndex(jumpIndex(button, position));
        if (target === state.sceneIndex) button.setAttribute("aria-current", "step");
        else button.removeAttribute("aria-current");
        if (!button.hasAttribute("aria-label")) {
          button.setAttribute("aria-label", labelText(this.labels.jump, [target + 1]));
        }
      }, this);
    }
    if (controls.counter) controls.counter.textContent = total ? (state.sceneIndex + 1) + " / " + total : "";
    if (controls.status) controls.status.textContent = this.statusText();
  };

  ExplainerPlayer.prototype.update = function () {
    this.updateControls();
    this.updateProgress();
    this.emitChange();
  };

  ExplainerPlayer.prototype.emitChange = function () {
    if (!this.onSceneChange) return;
    try {
      this.onSceneChange(this.getState());
    } catch (error) {
      if (global.console && global.console.error) {
        global.console.error("[ExplainerPlayer] onSceneChange threw", error);
      }
    }
  };

  ExplainerPlayer.prototype.getState = function () {
    var state = this.state;
    var scene = this.scenes[state.sceneIndex];
    return {
      sceneIndex: state.sceneIndex,
      sceneCount: this.scenes.length,
      title: scene && scene.title ? scene.title : "",
      playing: state.playing,
      preview: state.preview,
      completed: state.completed,
      fraction: state.preview ? 1 : state.fraction,
      reducedMotion: this.reducedMotion,
      gsapAvailable: this.gsapAvailable,
      duration: this.totalDuration(),
      sceneDuration: this.sceneDuration(state.sceneIndex),
      elapsed: this.elapsed(),
      percent: this.overallPercent()
    };
  };

  ExplainerPlayer.prototype.destroy = function () {
    this.cleanups.forEach(function (cleanup) { cleanup(); });
    this.cleanups = [];
    this.timelines.forEach(function (timeline) {
      if (timeline && typeof timeline.kill === "function") timeline.kill();
    });
    this.timelines = [];
    this.onSceneChange = null;
    this.destroyed = true;
  };

  global.ExplainerPlayer = ExplainerPlayer;
})(typeof window !== "undefined" ? window : globalThis);
