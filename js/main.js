/**
 * DeeBug — Application Bootstrap & Main Game Loop
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});

  function init() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const ai = new DeeBug.AIController();
    const engine = new DeeBug.GameEngine(ai);
    const renderer = new DeeBug.GameRenderer(canvas);
    const input = new DeeBug.InputController(canvas, renderer);
    const ui = new DeeBug.UIController(engine, renderer, input, DeeBug.Storage, DeeBug.Audio);

    // Expose instance cleanly for future extensions / debugging
    DeeBug.app = { engine, renderer, input, ui };

    let resizeRaf = 0;
    global.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => renderer.resize());
    });

    let lastTimestamp = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      const intent = input.getIntent(engine.player);
      engine.update(dt, intent);
      renderer.render(engine, dt, input.getDebugState());
      ui.update(now / 1000);

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
