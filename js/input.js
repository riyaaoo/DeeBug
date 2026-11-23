/**
 * DeeBug — Unified Input Controller (Mouse, Keyboard, Touch Virtual Joystick)
 * Produces a clean, network-serializable `InputIntent { targetAngle, throttle, boost }`.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});

  class InputController {
    constructor(canvas, renderer) {
      this.canvas = canvas;
      this.renderer = renderer;

      this.mode = 'mouse'; // mouse | keys | touch
      this.keys = new Set();
      this.mouseX = 0;
      this.mouseY = 0;
      this.mouseActive = false;
      this.mouseDown = false;
      this.uiBoostHeld = false;

      this.touch = {
        active: false,
        id: null,
        originX: 0,
        originY: 0,
        knobX: 0,
        knobY: 0,
        maxRadius: 56,
        angle: 0,
        throttle: 0,
      };

      this._bindEvents();
    }

    _bindEvents() {
      const c = this.canvas;

      // Mouse movement & click-to-boost
      c.addEventListener('mousemove', (e) => {
        const rect = c.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        this.mouseActive = true;
        if (!this.touch.active && !this._hasMovementKey()) {
          this.mode = 'mouse';
        }
      });

      c.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
          this.mouseDown = true;
          this.mouseActive = true;
          this.mode = 'mouse';
        }
      });

      global.addEventListener('mouseup', () => {
        this.mouseDown = false;
      });

      // Touch floating joystick for iPad / tablets / phones
      c.addEventListener(
        'touchstart',
        (e) => {
          if (e.changedTouches.length === 0) return;
          e.preventDefault();
          const t = e.changedTouches[0];
          const rect = c.getBoundingClientRect();
          const x = t.clientX - rect.left;
          const y = t.clientY - rect.top;

          this.touch.active = true;
          this.touch.id = t.identifier;
          this.touch.originX = x;
          this.touch.originY = y;
          this.touch.knobX = x;
          this.touch.knobY = y;
          this.touch.throttle = 0;
          this.mode = 'touch';
        },
        { passive: false }
      );

      c.addEventListener(
        'touchmove',
        (e) => {
          if (!this.touch.active) return;
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier !== this.touch.id) continue;
            e.preventDefault();
            const rect = c.getBoundingClientRect();
            const x = t.clientX - rect.left;
            const y = t.clientY - rect.top;
            const dx = x - this.touch.originX;
            const dy = y - this.touch.originY;
            const dist = Math.hypot(dx, dy);
            const maxR = this.touch.maxRadius;

            if (dist > 4) {
              this.touch.angle = Math.atan2(dy, dx);
            }
            const clamped = Math.min(dist, maxR);
            this.touch.knobX = this.touch.originX + (dist > 0 ? (dx / dist) * clamped : 0);
            this.touch.knobY = this.touch.originY + (dist > 0 ? (dy / dist) * clamped : 0);
            this.touch.throttle = Math.min(1, dist / (maxR * 0.72));
          }
        },
        { passive: false }
      );

      const endTouch = (e) => {
        if (!this.touch.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.touch.id) {
            this.touch.active = false;
            this.touch.id = null;
            this.touch.throttle = 0;
          }
        }
      };

      c.addEventListener('touchend', endTouch, { passive: true });
      c.addEventListener('touchcancel', endTouch, { passive: true });

      // Keyboard WASD / Arrows + Space/Shift boost
      global.addEventListener('keydown', (e) => {
        // Ignore when typing name in input field
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        const code = e.code;
        if (
          code === 'ArrowUp' ||
          code === 'ArrowDown' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight' ||
          code === 'Space'
        ) {
          e.preventDefault();
        }
        this.keys.add(code);
        if (this._hasMovementKey()) {
          this.mode = 'keys';
        }
      });

      global.addEventListener('keyup', (e) => {
        this.keys.delete(e.code);
      });

      global.addEventListener('blur', () => {
        this.keys.clear();
        this.mouseDown = false;
        this.uiBoostHeld = false;
        this.touch.active = false;
        this.touch.throttle = 0;
      });
    }

    setUiBoost(held) {
      this.uiBoostHeld = !!held;
    }

    _hasMovementKey() {
      return (
        this.keys.has('KeyW') ||
        this.keys.has('KeyS') ||
        this.keys.has('KeyA') ||
        this.keys.has('KeyD') ||
        this.keys.has('ArrowUp') ||
        this.keys.has('ArrowDown') ||
        this.keys.has('ArrowLeft') ||
        this.keys.has('ArrowRight')
      );
    }

    getIntent(player) {
      if (!player) {
        return { targetAngle: 0, throttle: 0, boost: false };
      }

      const keyBoost = this.keys.has('Space') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
      const boost = keyBoost || this.mouseDown || this.uiBoostHeld;

      // 1. Touch virtual joystick
      if (this.touch.active) {
        return {
          targetAngle: this.touch.angle,
          throttle: this.touch.throttle,
          boost,
        };
      }

      // 2. Keyboard directional steering
      if (this._hasMovementKey()) {
        let vx = 0;
        let vy = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) vy -= 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) vy += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) vx -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) vx += 1;

        if (vx !== 0 || vy !== 0) {
          return {
            targetAngle: Math.atan2(vy, vx),
            throttle: 1,
            boost,
          };
        }
      }

      // 3. Mouse cursor steering (classic snake.io feel)
      if (this.mode === 'mouse' && this.mouseActive) {
        const worldPos = this.renderer.screenToWorld(this.mouseX, this.mouseY);
        const dx = worldPos.x - player.x;
        const dy = worldPos.y - player.y;
        const dist = Math.hypot(dx, dy);
        const deadzone = Math.max(18, player.visualRadius * 0.45);
        if (dist <= deadzone) {
          return {
            targetAngle: player.angle,
            throttle: 0.12,
            boost: false,
          };
        }
        return {
          targetAngle: Math.atan2(dy, dx),
          throttle: Math.min(1, (dist - deadzone) / 95 + 0.3),
          boost,
        };
      }

      return { targetAngle: player.angle, throttle: 0, boost: false };
    }

    getDebugState() {
      return {
        mode: this.mode,
        touch: this.touch,
      };
    }
  }

  DeeBug.InputController = InputController;
})(window);
