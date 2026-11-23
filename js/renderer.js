/**
 * DeeBug — Pastel 2D Canvas Renderer & Animated Bug Skin Artist
 *
 * Renders the cozy pastel garden world, animated bugs with all 8 cute bug skins,
 * sparkles, rank badges, danger/edible indicators, touch joystick hint, and minimap.
 * Exposes `renderSkinPreview(canvas, skinId, time)` so the Skin Shop renders live animations.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const Config = DeeBug.Config;

  class GameRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.width = 0;
      this.height = 0;
      this.dpr = 1;

      // Smooth camera state
      this.camX = Config.WORLD.width * 0.5;
      this.camY = Config.WORLD.height * 0.5;
      this.zoom = 1;
      this.time = 0;

      this.resize();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(2, global.devicePixelRatio || 1);
      this.width = Math.max(1, rect.width || global.innerWidth);
      this.height = Math.max(1, rect.height || global.innerHeight);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
    }

    /**
     * Convert screen (CSS pixel) coordinates to world coordinates for mouse steering.
     */
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.width * 0.5) / this.zoom + this.camX,
        y: (sy - this.height * 0.5) / this.zoom + this.camY,
      };
    }

    render(engine, dt, inputState) {
      this.time += dt;
      const ctx = this.ctx;
      const world = Config.WORLD;
      const player = engine.player;

      // Smooth camera tracking & gentle zoom-out as player grows
      if (player) {
        const targetZoomBase = Math.min(1.06, Math.max(0.48, 1.06 - (player.rank - 1) * 0.029));
        const smallScreenScale = Math.min(1, Math.min(this.width, this.height) / 680);
        const targetZoom = targetZoomBase * (0.82 + 0.18 * smallScreenScale);

        this.camX += (player.x - this.camX) * Math.min(1, dt * 8);
        this.camY += (player.y - this.camY) * Math.min(1, dt * 8);
        this.zoom += (targetZoom - this.zoom) * Math.min(1, dt * 3.5);
      } else {
        // Gentle idle camera drift on start menu
        this.camX = world.width * 0.5 + Math.cos(this.time * 0.18) * 260;
        this.camY = world.height * 0.5 + Math.sin(this.time * 0.14) * 220;
        this.zoom = 0.92;
      }

      ctx.save();
      ctx.scale(this.dpr, this.dpr);

      // Base soft pastel meadow fill
      ctx.fillStyle = '#edf8ec';
      ctx.fillRect(0, 0, this.width, this.height);

      // Camera transform + subtle screen shake
      ctx.save();
      let shakeX = 0;
      let shakeY = 0;
      if (engine.screenShake > 0.1) {
        shakeX = (Math.random() - 0.5) * engine.screenShake * 1.4;
        shakeY = (Math.random() - 0.5) * engine.screenShake * 1.4;
      }
      ctx.translate(this.width * 0.5 + shakeX, this.height * 0.5 + shakeY);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.camX, -this.camY);

      const viewHalfW = this.width / (2 * this.zoom) + 120;
      const viewHalfH = this.height / (2 * this.zoom) + 120;
      const viewLeft = this.camX - viewHalfW;
      const viewRight = this.camX + viewHalfW;
      const viewTop = this.camY - viewHalfH;
      const viewBottom = this.camY + viewHalfH;

      // 1. World floor, pastel grid & garden border
      this._drawWorldBackground(ctx, viewLeft, viewRight, viewTop, viewBottom);

      // 2. Swaying pastel flowers, clovers, and pebbles
      this._drawDecor(ctx, engine.decor, viewLeft, viewRight, viewTop, viewBottom);

      // 3. Fenced Rest / Escape Sanctuaries (cozy ground + picket fences)
      this._drawSanctuaries(ctx, engine.sanctuaries || [], player, viewLeft, viewRight, viewTop, viewBottom);

      // 4. Immovable Ponds, Rocks, and Tree Trunks (ground layer)
      this._drawObstaclesGround(ctx, engine.obstacles || [], viewLeft, viewRight, viewTop, viewBottom);

      // 5. Garden Food (leaves, berries, fruits, mushrooms + power-up auras)
      this._drawFoods(ctx, engine.foods || [], viewLeft, viewRight, viewTop, viewBottom);

      // 6. Particles (behind bugs)
      this._drawParticles(ctx, engine.particles, viewLeft, viewRight, viewTop, viewBottom);

      // 7. Sort bugs by radius so bigger bugs gently layer on top
      const leaderId = this._findLeaderId(engine.bugs);
      const visibleBugs = [];
      for (let i = 0; i < engine.bugs.length; i++) {
        const b = engine.bugs[i];
        if (!b.isAlive) continue;
        if (
          b.x + b.visualRadius * 2.4 < viewLeft ||
          b.x - b.visualRadius * 2.4 > viewRight ||
          b.y + b.visualRadius * 2.4 < viewTop ||
          b.y - b.visualRadius * 2.4 > viewBottom
        ) {
          continue;
        }
        visibleBugs.push(b);
      }
      visibleBugs.sort((a, b) => a.visualRadius - b.visualRadius);

      for (let i = 0; i < visibleBugs.length; i++) {
        const b = visibleBugs[i];
        this._drawBugInWorld(ctx, b, player, b.id === leaderId);
      }

      // 8. Fluffy Pastel Tree Canopies (overhead layer, gently translucent if player is beneath)
      this._drawTreeCanopies(ctx, engine.obstacles || [], player, viewLeft, viewRight, viewTop, viewBottom);

      // 9. Floating texts
      this._drawFloatingTexts(ctx, engine.floatingTexts);

      ctx.restore();

      // 6. Screen-space Touch Virtual Joystick (when dragging on touch screen)
      if (inputState && inputState.touch && inputState.touch.active) {
        this._drawVirtualJoystick(ctx, inputState.touch);
      }

      // 7. Cozy Minimap (when playing)
      if (player && (engine.state === 'playing' || engine.state === 'paused')) {
        this._drawMinimap(ctx, engine, leaderId);
      }

      ctx.restore();
    }

    _findLeaderId(bugs) {
      let best = null;
      for (let i = 0; i < bugs.length; i++) {
        const b = bugs[i];
        if (!b.isAlive || b.rank < 1) continue;
        if (!best || b.rank > best.rank || (b.rank === best.rank && b.points > best.points)) {
          best = b;
        }
      }
      return best ? best.id : null;
    }

    _drawWorldBackground(ctx, viewLeft, viewRight, viewTop, viewBottom) {
      const world = Config.WORLD;
      const pad = world.borderPadding;

      // Outside garden lawn (soft mint-sage)
      ctx.fillStyle = '#d7ecd6';
      ctx.fillRect(viewLeft - 80, viewTop - 80, viewRight - viewLeft + 160, viewBottom - viewTop + 160);

      // Inside playable pastel meadow
      this._roundRect(ctx, pad, pad, world.width - pad * 2, world.height - pad * 2, 56);
      ctx.fillStyle = '#f3fbf0';
      ctx.fill();

      // Subtle pastel polka-grid for clear snake.io spatial motion cues
      const step = world.gridSize;
      const startX = Math.max(pad + step, Math.floor(viewLeft / step) * step);
      const endX = Math.min(world.width - pad - step, Math.ceil(viewRight / step) * step);
      const startY = Math.max(pad + step, Math.floor(viewTop / step) * step);
      const endY = Math.min(world.height - pad - step, Math.ceil(viewBottom / step) * step);

      ctx.strokeStyle = 'rgba(176, 214, 174, 0.32)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = startX; x <= endX; x += step) {
        ctx.moveTo(x, Math.max(pad, viewTop));
        ctx.lineTo(x, Math.min(world.height - pad, viewBottom));
      }
      for (let y = startY; y <= endY; y += step) {
        ctx.moveTo(Math.max(pad, viewLeft), y);
        ctx.lineTo(Math.min(world.width - pad, viewRight), y);
      }
      ctx.stroke();

      // Soft garden hedge border
      this._roundRect(ctx, pad, pad, world.width - pad * 2, world.height - pad * 2, 56);
      ctx.strokeStyle = '#a8d8aa';
      ctx.lineWidth = 16;
      ctx.stroke();

      this._roundRect(ctx, pad - 6, pad - 6, world.width - pad * 2 + 12, world.height - pad * 2 + 12, 62);
      ctx.strokeStyle = '#8ec992';
      ctx.lineWidth = 5;
      ctx.setLineDash([18, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    _drawDecor(ctx, decorList, viewLeft, viewRight, viewTop, viewBottom) {
      for (let i = 0; i < decorList.length; i++) {
        const d = decorList[i];
        if (d.x < viewLeft || d.x > viewRight || d.y < viewTop || d.y > viewBottom) continue;

        ctx.save();
        const sway = Math.sin(this.time * 1.4 + d.swayPhase) * 0.06;
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rotation + sway);
        ctx.scale(d.scale, d.scale);

        if (d.type === 'daisy') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          for (let p = 0; p < 6; p++) {
            const a = (p / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(Math.cos(a) * 8, Math.sin(a) * 8, 5, 3.2, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffe082';
          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.type === 'buttercup') {
          ctx.fillStyle = 'rgba(255, 232, 153, 0.85)';
          for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 4.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffb3c6';
          ctx.beginPath();
          ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (d.type === 'clover') {
          ctx.fillStyle = 'rgba(167, 224, 173, 0.55)';
          for (let p = 0; p < 3; p++) {
            const a = (p / 3) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(Math.cos(a) * 6, Math.sin(a) * 6, 5.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (d.type === 'lavender') {
          ctx.fillStyle = 'rgba(208, 179, 255, 0.65)';
          for (let p = -1; p <= 1; p++) {
            ctx.beginPath();
            ctx.ellipse(p * 6, (p % 2) * 3, 4.5, 3, 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (d.type === 'pebble') {
          ctx.fillStyle = 'rgba(209, 220, 226, 0.5)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 11, 7, 0.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(179, 230, 186, 0.5)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    _drawSanctuaries(ctx, sanctuaries, player, viewLeft, viewRight, viewTop, viewBottom) {
      for (let i = 0; i < sanctuaries.length; i++) {
        const s = sanctuaries[i];
        const left = s.x - s.width * 0.5;
        const top = s.y - s.height * 0.5;
        if (left + s.width + 40 < viewLeft || left - 40 > viewRight || top + s.height + 40 < viewTop || top - 40 > viewBottom) {
          continue;
        }

        const isInside = player && s.containsPoint(player.x, player.y, -12);

        ctx.save();
        // Cozy warm pastel sanctuary meadow pad
        this._roundRect(ctx, left, top, s.width, s.height, 26);
        ctx.fillStyle = isInside ? 'rgba(232, 252, 238, 0.92)' : 'rgba(246, 253, 238, 0.85)';
        ctx.fill();

        // Cute soft pastel picnic/rest mat in center
        this._roundRect(ctx, s.x - 54, s.y - 34, 108, 68, 16);
        ctx.fillStyle = 'rgba(255, 235, 242, 0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 179, 198, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cozy label inside rest zone
        ctx.font = '800 12px "SF Pro Rounded", ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3b7a57';
        ctx.fillText('🏡 SAFE REST', s.x, s.y - 6);
        ctx.font = '700 10px "SF Pro Rounded", ui-rounded, system-ui, sans-serif';
        ctx.fillStyle = '#6e8c78';
        ctx.fillText('No big bugs • Fast heal', s.x, s.y + 11);

        // Welcoming pastel stepping stones in open gates
        const gateColor = 'rgba(255, 224, 153, 0.85)';
        if (s.gates.includes('top')) {
          this._drawGateMat(ctx, s.x, top, s.gateWidth - 20, 14, gateColor);
        }
        if (s.gates.includes('bottom')) {
          this._drawGateMat(ctx, s.x, top + s.height, s.gateWidth - 20, 14, gateColor);
        }
        if (s.gates.includes('left')) {
          this._drawGateMat(ctx, left, s.y, 14, s.gateWidth - 20, gateColor);
        }
        if (s.gates.includes('right')) {
          this._drawGateMat(ctx, left + s.width, s.y, 14, s.gateWidth - 20, gateColor);
        }

        // Wooden pastel picket fence segments
        const segs = s.getWallSegments();
        for (let k = 0; k < segs.length; k++) {
          const seg = segs[k];
          // Soft shadow
          this._roundRect(ctx, seg.x + 2, seg.y + 5, seg.w, seg.h, 6);
          ctx.fillStyle = 'rgba(116, 140, 118, 0.2)';
          ctx.fill();

          // Fence rail
          this._roundRect(ctx, seg.x, seg.y, seg.w, seg.h, 6);
          ctx.fillStyle = '#fff6e5';
          ctx.fill();
          ctx.strokeStyle = '#c2a07a';
          ctx.lineWidth = 2.2;
          ctx.stroke();

          // Cute rounded fence posts along segment
          const horizontal = seg.w >= seg.h;
          const length = horizontal ? seg.w : seg.h;
          const postCount = Math.max(2, Math.floor(length / 26) + 1);
          for (let p = 0; p < postCount; p++) {
            const t = postCount === 1 ? 0.5 : p / (postCount - 1);
            const px = horizontal ? seg.x + 6 + t * Math.max(0, seg.w - 12) : seg.x + seg.w * 0.5;
            const py = horizontal ? seg.y + seg.h * 0.5 : seg.y + 6 + t * Math.max(0, seg.h - 12);
            ctx.fillStyle = '#ffeed2';
            ctx.beginPath();
            ctx.arc(px, py, 6.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
        }

        ctx.restore();
      }
    }

    _drawGateMat(ctx, cx, cy, w, h, color) {
      this._roundRect(ctx, cx - w * 0.5, cy - h * 0.5, w, h, 7);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(194, 160, 122, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    _drawObstaclesGround(ctx, obstacles, viewLeft, viewRight, viewTop, viewBottom) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const bound = Math.max(o.radius, o.ry, o.canopyRadius || 0) + 30;
        if (o.x + bound < viewLeft || o.x - bound > viewRight || o.y + bound < viewTop || o.y - bound > viewBottom) {
          continue;
        }

        ctx.save();
        ctx.translate(o.x, o.y);

        if (o.type === 'pond') {
          // Sandy-pastel bank
          ctx.fillStyle = '#f2e8cf';
          ctx.strokeStyle = '#c8dfb8';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(0, 0, o.radius + 9, o.ry + 9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Sparkling pastel-aqua pond water
          const grad = ctx.createRadialGradient(-o.radius * 0.2, -o.ry * 0.2, 10, 0, 0, Math.max(o.radius, o.ry));
          grad.addColorStop(0, '#c7f3ff');
          grad.addColorStop(0.65, '#9ce4f8');
          grad.addColorStop(1, '#7fd3ec');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, o.radius, o.ry, 0, 0, Math.PI * 2);
          ctx.fill();

          // Gentle animated water ripples
          const ripple = (this.time * 0.35 + o.seed) % 1;
          ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.55 * (1 - ripple)) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, o.radius * (0.35 + ripple * 0.5), o.ry * (0.35 + ripple * 0.5), 0, 0, Math.PI * 2);
          ctx.stroke();

          // Cute floating lily pads + pink lotus flower
          const padX = -o.radius * 0.32;
          const padY = o.ry * 0.14;
          ctx.fillStyle = '#9be5aa';
          ctx.strokeStyle = '#64b878';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(padX, padY);
          ctx.arc(padX, padY, 18, 0.35, Math.PI * 2 - 0.15);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Second smaller lily pad
          const pad2X = o.radius * 0.35;
          const pad2Y = -o.ry * 0.2;
          ctx.beginPath();
          ctx.moveTo(pad2X, pad2Y);
          ctx.arc(pad2X, pad2Y, 13, 2.5, Math.PI * 2 + 2.0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Pink pastel lotus blossom on main lily pad
          ctx.fillStyle = '#ffb3c6';
          for (let p = 0; p < 6; p++) {
            const a = (p / 6) * Math.PI * 2 + Math.sin(this.time + o.seed * 6) * 0.05;
            ctx.beginPath();
            ctx.ellipse(padX + Math.cos(a) * 6, padY + Math.sin(a) * 6, 5.5, 3.2, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffe588';
          ctx.beginPath();
          ctx.arc(padX, padY, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === 'rock') {
          ctx.rotate(o.rotation);
          // Ground shadow
          ctx.fillStyle = 'rgba(110, 140, 118, 0.2)';
          ctx.beginPath();
          ctx.ellipse(3, 7, o.radius * 1.02, o.radius * 0.88, 0, 0, Math.PI * 2);
          ctx.fill();

          // Main smooth pastel pebble-rock
          const rockColors = ['#d8d4e3', '#cfdce3', '#dfd6cf'];
          ctx.fillStyle = rockColors[o.variant % rockColors.length];
          ctx.strokeStyle = '#8b8294';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.ellipse(0, 0, o.radius, o.radius * 0.86, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Soft highlight shine
          ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.beginPath();
          ctx.ellipse(-o.radius * 0.25, -o.radius * 0.26, o.radius * 0.42, o.radius * 0.22, -0.35, 0, Math.PI * 2);
          ctx.fill();

          // Cozy mint moss patch
          ctx.fillStyle = 'rgba(155, 224, 168, 0.72)';
          ctx.beginPath();
          ctx.ellipse(o.radius * 0.26, o.radius * 0.22, o.radius * 0.34, o.radius * 0.2, 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === 'tree') {
          // Soft dappled canopy shadow on grass
          ctx.fillStyle = 'rgba(105, 148, 110, 0.16)';
          ctx.beginPath();
          ctx.ellipse(10, 14, o.canopyRadius * 0.96, o.canopyRadius * 0.88, 0, 0, Math.PI * 2);
          ctx.fill();

          // Immovable warm wooden tree trunk
          ctx.fillStyle = '#c99b77';
          ctx.strokeStyle = '#8a6246';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(0, 0, o.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Cute wood grain ring inside trunk
          ctx.strokeStyle = 'rgba(138, 98, 70, 0.35)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, o.radius * 0.55, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    _drawTreeCanopies(ctx, obstacles, player, viewLeft, viewRight, viewTop, viewBottom) {
      const canopyPalettes = [
        { main: '#a8e6b8', light: '#cef5d7', flower: '#fff4a3' }, // pastel mint tree
        { main: '#ffc8dd', light: '#ffe3ee', flower: '#ffffff' }, // sakura blossom tree
        { main: '#b9ebcc', light: '#dcf7e5', flower: '#ffb3c6' }, // spring meadow tree
      ];

      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.type !== 'tree') continue;
        const cr = o.canopyRadius;
        if (o.x + cr + 20 < viewLeft || o.x - cr - 20 > viewRight || o.y + cr + 20 < viewTop || o.y - cr - 20 > viewBottom) {
          continue;
        }

        const pal = canopyPalettes[o.variant % canopyPalettes.length];
        const swayX = Math.sin(this.time * 1.1 + o.seed * 8) * 2.5;
        const swayY = Math.cos(this.time * 0.9 + o.seed * 8) * 2;

        // Become gently translucent if player is peeking right under the tree canopy!
        let alpha = 0.92;
        if (player && Math.hypot(player.x - o.x, player.y - o.y) < cr + player.visualRadius) {
          alpha = 0.56;
        }

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(o.x + swayX, o.y + swayY);

        // Fluffy scalloped cloud-like foliage puffs
        ctx.fillStyle = pal.main;
        ctx.strokeStyle = 'rgba(104, 136, 112, 0.35)';
        ctx.lineWidth = 2.5;
        const puffs = 6;
        ctx.beginPath();
        ctx.arc(0, 0, cr * 0.72, 0, Math.PI * 2);
        for (let p = 0; p < puffs; p++) {
          const a = (p / puffs) * Math.PI * 2 + o.seed * 4;
          ctx.moveTo(Math.cos(a) * cr * 0.45 + cr * 0.46, Math.sin(a) * cr * 0.45);
          ctx.arc(Math.cos(a) * cr * 0.45, Math.sin(a) * cr * 0.45, cr * 0.46, 0, Math.PI * 2);
        }
        ctx.fill();

        // Soft upper foliage highlight puffs
        ctx.fillStyle = pal.light;
        for (let p = 0; p < 3; p++) {
          const a = -2.2 + p * 0.85;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * cr * 0.32, Math.sin(a) * cr * 0.32, cr * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }

        // Cute tiny blossoms dotted on canopy
        ctx.fillStyle = pal.flower;
        for (let b = 0; b < 5; b++) {
          const a = (b / 5) * Math.PI * 2 + o.seed * 9;
          const dist = cr * (0.25 + (b % 2) * 0.32);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist, 5.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    _drawFoods(ctx, foods, viewLeft, viewRight, viewTop, viewBottom) {
      for (let i = 0; i < foods.length; i++) {
        const f = foods[i];
        if (!f.isAlive) continue;
        if (f.x + 34 < viewLeft || f.x - 34 > viewRight || f.y + 34 < viewTop || f.y - 34 > viewBottom) continue;

        const bob = Math.sin(this.time * 3.2 + f.bobPhase) * 2.5;
        const r = f.radius;
        const effectCfg = f.effectId ? Config.getEffectConfig(f.effectId) : null;

        ctx.save();
        ctx.translate(f.x, f.y + bob);

        // Soft ground shadow
        ctx.fillStyle = 'rgba(110, 145, 115, 0.16)';
        ctx.beginPath();
        ctx.ellipse(0, r * 0.85 - bob * 0.4, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glowing magical aura for special power-up / silly-effect treats!
        if (effectCfg) {
          const pulse = 0.65 + 0.35 * Math.sin(this.time * 5 + f.bobPhase);
          ctx.fillStyle = effectCfg.bg;
          ctx.globalAlpha = 0.55 * pulse;
          ctx.beginPath();
          ctx.arc(0, 0, r * (1.65 + 0.18 * pulse), 0, Math.PI * 2);
          ctx.fill();

          ctx.globalAlpha = 0.85;
          ctx.strokeStyle = effectCfg.color;
          ctx.lineWidth = 2;
          if (effectCfg.kind === 'debuff') {
            ctx.setLineDash([4, 4]);
          }
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.48, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.rotate(f.rotation * 0.4);
        ctx.strokeStyle = '#6c5360';
        ctx.lineWidth = 1.7;

        if (f.kind === 'leaf') {
          // Cute pastel garden leaf
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.moveTo(-r * 0.9, r * 0.25);
          ctx.quadraticCurveTo(-r * 0.2, -r * 1.05, r * 0.95, -r * 0.25);
          ctx.quadraticCurveTo(r * 0.3, r * 0.95, -r * 0.9, r * 0.25);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Center leaf vein + tiny stem
          ctx.strokeStyle = f.accent;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(-r * 1.15, r * 0.42);
          ctx.quadraticCurveTo(0, 0, r * 0.62, -r * 0.15);
          ctx.stroke();
        } else if (f.kind === 'berry') {
          // Plump pastel berry cluster
          const lobes = [
            [-0.36, 0.16, 0.52],
            [0.36, 0.16, 0.52],
            [0, -0.22, 0.56],
          ];
          ctx.fillStyle = f.color;
          lobes.forEach(([lx, ly, lr]) => {
            ctx.beginPath();
            ctx.arc(lx * r, ly * r, lr * r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });

          // Tiny mint leafy berry crown
          ctx.fillStyle = '#8de0a0';
          ctx.beginPath();
          ctx.ellipse(-r * 0.25, -r * 0.78, r * 0.34, r * 0.16, -0.4, 0, Math.PI * 2);
          ctx.ellipse(r * 0.25, -r * 0.78, r * 0.34, r * 0.16, 0.4, 0, Math.PI * 2);
          ctx.fill();

          // Glossy highlights
          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(-r * 0.18, -r * 0.32, r * 0.16, 0, Math.PI * 2);
          ctx.fill();
        } else if (f.kind === 'fruit') {
          // Plump pastel peach / golden apple fruit
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(0, r * 0.08, r * 0.88, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Rosy cheek blush gradient spot
          ctx.fillStyle = f.accent;
          ctx.globalAlpha = 0.38;
          ctx.beginPath();
          ctx.arc(r * 0.26, r * 0.22, r * 0.42, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          // Stem + cute little leaf
          ctx.strokeStyle = '#8a6246';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.7);
          ctx.quadraticCurveTo(r * 0.1, -r * 1.15, r * 0.3, -r * 1.15);
          ctx.stroke();

          ctx.fillStyle = '#8de0a0';
          ctx.beginPath();
          ctx.ellipse(-r * 0.28, -r * 0.9, r * 0.35, r * 0.18, -0.45, 0, Math.PI * 2);
          ctx.fill();

          // Shine dot
          ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.beginPath();
          ctx.ellipse(-r * 0.3, -r * 0.2, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (f.kind === 'mushroom') {
          // Cute chunky mushroom stem
          ctx.fillStyle = '#fff5e4';
          this._roundRect(ctx, -r * 0.36, -r * 0.05, r * 0.72, r * 0.85, r * 0.28);
          ctx.fill();
          ctx.stroke();

          // Plump pastel mushroom cap
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(0, r * 0.05, r * 0.92, Math.PI, 0, false);
          ctx.quadraticCurveTo(r * 0.92, r * 0.28, 0, r * 0.24);
          ctx.quadraticCurveTo(-r * 0.92, r * 0.28, -r * 0.92, r * 0.05);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cute mushroom cap spots
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(-r * 0.4, -r * 0.26, r * 0.18, 0, Math.PI * 2);
          ctx.arc(r * 0.34, -r * 0.22, r * 0.16, 0, Math.PI * 2);
          ctx.arc(0, -r * 0.56, r * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }

        // Tiny icon badge floating right above special effect treats so players recognize powers!
        if (effectCfg) {
          ctx.rotate(-f.rotation * 0.4);
          ctx.font = '12px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(effectCfg.icon, 0, -r - 10);
        }

        ctx.restore();
      }
    }

    _drawBugInWorld(ctx, bug, player, isLeader) {
      const r = bug.visualRadius;
      const playerEffRank = player && player.getEffectiveRank ? player.getEffectiveRank() : player ? player.rank : 1;

      // Danger / Edible ring cues relative to local player's EFFECTIVE rank!
      if (player && player.isAlive && !bug.isPlayer) {
        const dist = Math.hypot(bug.x - player.x, bug.y - player.y);
        if (dist < 420 + r + player.visualRadius) {
          ctx.save();
          ctx.translate(bug.x, bug.y);
          if (bug.rank > playerEffRank) {
            const rankDiff = bug.rank - playerEffRank;
            const pulse = 0.55 + 0.45 * Math.sin(this.time * (rankDiff >= 2 ? 7 : 4.5));
            ctx.strokeStyle =
              rankDiff >= 2
                ? 'rgba(242, 100, 130, ' + (0.45 + 0.3 * pulse) + ')'
                : 'rgba(255, 168, 107, ' + (0.35 + 0.25 * pulse) + ')';
            ctx.lineWidth = rankDiff >= 2 ? 3.5 : 2.5;
            ctx.setLineDash([7, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 9 + pulse * 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (bug.rank <= playerEffRank && dist < 260 + r + player.visualRadius) {
            ctx.strokeStyle = 'rgba(116, 209, 158, 0.42)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Active food effect visual auras around player!
      if (bug.isPlayer && bug.activeEffects) {
        const effKeys = Object.keys(bug.activeEffects);
        if (effKeys.length > 0) {
          ctx.save();
          ctx.translate(bug.x, bug.y);
          if (bug.hasEffect('stronger') || bug.hasEffect('bigger')) {
            ctx.strokeStyle = 'rgba(255, 198, 72, 0.72)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(0, 0, r + 10 + Math.sin(this.time * 8) * 2.5, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (bug.hasEffect('faster')) {
            ctx.strokeStyle = 'rgba(110, 210, 255, 0.7)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([10, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 14, this.time * 5, this.time * 5 + Math.PI * 1.6);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (bug.hasEffect('slower') || bug.hasEffect('weaker') || bug.hasEffect('smaller')) {
            ctx.strokeStyle = 'rgba(168, 108, 212, 0.58)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 9, -this.time * 3, -this.time * 3 + Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
        }
      }

      // Invulnerability blink OR Invisible ghost shimmer!
      ctx.save();
      if (bug.hasEffect && bug.hasEffect('invisible')) {
        ctx.globalAlpha = 0.38 + Math.sin(this.time * 7) * 0.08;
      } else if (bug.invulnTimer > 0 && Math.floor(bug.invulnTimer * 14) % 2 === 0) {
        ctx.globalAlpha = 0.58;
      }

      this.drawCuteBugSprite(ctx, bug, bug.x, bug.y, r, bug.angle, this.time);

      ctx.restore();

      // Draw rank badge, name, optional crown & danger indicator
      this._drawBugLabel(ctx, bug, player, isLeader);
    }

    /**
     * Core procedural artist for a cute animated pastel bug + skin.
     * Used both in the live world AND in the Skin Shop preview canvases!
     */
    drawCuteBugSprite(ctx, bug, x, y, r, angle, time) {
      const skin = Config.getSkinConfig(bug.skinId || 'classic');
      const useCustomTint = !bug.isPlayer && bug.customTint;
      const palette = useCustomTint
        ? {
            body: bug.customTint.body,
            shell: bug.customTint.shell,
            belly: '#ffffff',
            head: bug.customTint.head,
            wing: 'rgba(255, 255, 255, 0.74)',
            accent: '#ffffff',
            sparkle: bug.customTint.body,
          }
        : skin.palette;

      const skinType = bug.isPlayer ? skin.features.type : 'classic';
      const spotStyle = bug.isPlayer ? skin.features.spots : 'dots';

      const walk = bug.walkPhase || time * 6;
      const wingFlutter = Math.sin((bug.wingPhase || time * 14)) * 0.24;
      const sway = Math.max(-0.35, Math.min(0.35, -(bug.angularVel || 0) * 0.08));
      const chompScale = bug.chompTimer > 0 ? 1 + Math.sin((bug.chompTimer / 0.28) * Math.PI) * 0.14 : 1;

      ctx.save();
      ctx.translate(x, y);

      // Soft ground shadow (world-aligned slightly below)
      ctx.fillStyle = 'rgba(110, 145, 115, 0.18)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.22, r * 1.04, r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(angle);
      ctx.scale(chompScale, 2 - chompScale);

      // 1. Wiggling little bug legs (6 cute rounded legs, 3 per side)
      ctx.strokeStyle = '#6e5663';
      ctx.lineWidth = Math.max(2, r * 0.11);
      ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        for (let i = -1; i <= 1; i++) {
          const baseX = i * r * 0.34 - r * 0.08;
          const baseY = side * r * 0.62;
          const wiggle = Math.sin(walk + i * 1.4 + (side > 0 ? 0 : Math.PI)) * r * 0.17;
          const tipX = baseX + wiggle;
          const tipY = side * (r * 0.98 + Math.abs(i) * r * 0.04);
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.quadraticCurveTo(baseX + wiggle * 0.5, side * r * 0.85, tipX, tipY);
          ctx.stroke();
        }
      }

      // 2. Skin-specific cute rear tail (behind bug body)
      this._drawSkinTail(ctx, skinType, r, palette, time, sway);

      // 3. Bug body / abdomen shell (oval)
      ctx.save();
      ctx.fillStyle = bug.hurtFlashTimer > 0 ? '#ff9eb5' : palette.shell;
      ctx.strokeStyle = '#6c5360';
      ctx.lineWidth = Math.max(1.8, r * 0.085);
      ctx.beginPath();
      ctx.ellipse(-r * 0.16, 0, r * 0.88, r * 0.74, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Soft inner body color blend
      ctx.fillStyle = bug.hurtFlashTimer > 0 ? '#ffd0dc' : palette.body;
      ctx.beginPath();
      ctx.ellipse(-r * 0.18, 0, r * 0.76, r * 0.63, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shell pattern (spots / stripes / hearts / honey stripes / stars / gems)
      this._drawShellPattern(ctx, spotStyle, r, palette);

      // Center wing-case seam (makes it unmistakably a cute beetle/bug!)
      ctx.strokeStyle = 'rgba(108, 83, 96, 0.35)';
      ctx.lineWidth = Math.max(1.2, r * 0.055);
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, 0);
      ctx.lineTo(r * 0.38, 0);
      ctx.stroke();

      // Glossy pastel shell shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.32, -r * 0.32, r * 0.36, r * 0.16, -0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 4. Translucent fluttering bug wings
      this._drawWings(ctx, skinType, r, palette, wingFlutter);

      // 5. Cute bug head
      const headX = r * 0.56;
      const headR = r * 0.5;

      // Bobbing antennae (kept on ALL skins so it's always a cute bug!)
      this._drawAntennae(ctx, skinType, headX, headR, r, palette, time, sway);

      // Head base circle
      ctx.fillStyle = bug.hurtFlashTimer > 0 ? '#ffd6e0' : palette.head;
      ctx.strokeStyle = '#6c5360';
      ctx.lineWidth = Math.max(1.8, r * 0.08);
      ctx.beginPath();
      ctx.arc(headX, 0, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 6. Skin-specific head accessories (Kitty ears, Doggy ears, Bunny ears, Bear ears, Axolotl gills, Unicorn horn, Royal crown)
      this._drawSkinHeadTraits(ctx, skinType, headX, headR, r, palette, time, sway);

      // 7. Expressive kawaii face (eyes, blush cheeks, mouth)
      this._drawKawaiiFace(ctx, bug, skinType, headX, headR, r, palette);

      ctx.restore();
    }

    _drawSkinTail(ctx, skinType, r, palette, time, sway) {
      const wag = Math.sin(time * 9) * 0.28 + sway;
      ctx.save();
      ctx.translate(-r * 0.98, 0);

      if (skinType === 'kitty') {
        ctx.rotate(wag);
        ctx.strokeStyle = '#6c5360';
        ctx.lineWidth = r * 0.28;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-r * 0.38, -r * 0.25, -r * 0.55, r * 0.28, -r * 0.82, r * 0.06);
        ctx.stroke();

        ctx.strokeStyle = palette.shell;
        ctx.lineWidth = r * 0.18;
        ctx.stroke();
      } else if (skinType === 'doggy') {
        ctx.rotate(Math.sin(time * 13) * 0.45 + sway);
        ctx.fillStyle = palette.shell;
        ctx.strokeStyle = '#6c5360';
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.beginPath();
        ctx.ellipse(-r * 0.28, 0, r * 0.34, r * 0.16, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (skinType === 'bunny') {
        const bounce = Math.sin(time * 8) * r * 0.04;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#6c5360';
        ctx.lineWidth = Math.max(1.5, r * 0.07);
        ctx.beginPath();
        ctx.arc(-r * 0.16 + bounce, 0, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (skinType === 'axolotl') {
        ctx.rotate(wag * 0.7);
        ctx.fillStyle = 'rgba(255, 166, 193, 0.75)';
        ctx.strokeStyle = '#6c5360';
        ctx.lineWidth = Math.max(1.4, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(r * 0.05, 0);
        ctx.quadraticCurveTo(-r * 0.4, -r * 0.34, -r * 0.72, 0);
        ctx.quadraticCurveTo(-r * 0.4, r * 0.34, r * 0.05, 0);
        ctx.fill();
        ctx.stroke();
      } else if (skinType === 'unicorn' || skinType === 'royal') {
        ctx.rotate(wag * 0.6);
        ctx.fillStyle = skinType === 'unicorn' ? 'rgba(255, 214, 255, 0.8)' : 'rgba(255, 230, 128, 0.8)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.26, -r * 0.08, r * 0.32, r * 0.1, -0.2, 0, Math.PI * 2);
        ctx.ellipse(-r * 0.26, r * 0.08, r * 0.32, r * 0.1, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    _drawShellPattern(ctx, spotStyle, r, palette) {
      ctx.save();
      if (spotStyle === 'dots') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        const spots = [
          [-0.45, -0.32, 0.14],
          [-0.45, 0.32, 0.14],
          [-0.08, -0.34, 0.12],
          [-0.08, 0.34, 0.12],
          [-0.68, 0, 0.11],
        ];
        spots.forEach(([sx, sy, sr]) => {
          ctx.beginPath();
          ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (spotStyle === 'stripes') {
        ctx.fillStyle = 'rgba(155, 102, 204, 0.35)';
        [-0.58, -0.25, 0.06].forEach((sx) => {
          ctx.beginPath();
          ctx.ellipse(sx * r, -r * 0.35, r * 0.09, r * 0.22, 0.2, 0, Math.PI * 2);
          ctx.ellipse(sx * r, r * 0.35, r * 0.09, r * 0.22, -0.2, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (spotStyle === 'patches') {
        ctx.fillStyle = 'rgba(201, 138, 91, 0.38)';
        ctx.beginPath();
        ctx.ellipse(-0.46 * r, -0.28 * r, 0.25 * r, 0.19 * r, 0.4, 0, Math.PI * 2);
        ctx.ellipse(-0.14 * r, 0.32 * r, 0.22 * r, 0.16 * r, -0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (spotStyle === 'hearts') {
        ctx.fillStyle = 'rgba(255, 179, 198, 0.72)';
        this._drawMiniHeart(ctx, -0.36 * r, -0.3 * r, r * 0.14);
        this._drawMiniHeart(ctx, -0.36 * r, 0.3 * r, r * 0.14);
      } else if (spotStyle === 'beeStripes') {
        ctx.fillStyle = 'rgba(148, 96, 56, 0.42)';
        [-0.52, -0.16].forEach((sx) => {
          ctx.beginPath();
          ctx.roundRect
            ? ctx.roundRect(sx * r - r * 0.09, -r * 0.56, r * 0.18, r * 1.12, r * 0.08)
            : ctx.rect(sx * r - r * 0.09, -r * 0.56, r * 0.18, r * 1.12);
          ctx.fill();
        });
      } else if (spotStyle === 'bubbles') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillStyle = 'rgba(204, 249, 255, 0.5)';
        ctx.lineWidth = Math.max(1.2, r * 0.045);
        [
          [-0.48, -0.28, 0.13],
          [-0.22, 0.32, 0.15],
          [-0.64, 0.18, 0.09],
        ].forEach(([sx, sy, sr]) => {
          ctx.beginPath();
          ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      } else if (spotStyle === 'stars') {
        ctx.fillStyle = '#fff3b0';
        this._drawStar(ctx, -0.42 * r, -0.28 * r, 5, r * 0.15, r * 0.07);
        this._drawStar(ctx, -0.42 * r, 0.28 * r, 5, r * 0.15, r * 0.07);
        this._drawStar(ctx, -0.1 * r, 0, 4, r * 0.13, r * 0.06);
      } else if (spotStyle === 'gems') {
        ctx.fillStyle = '#ffdf80';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = Math.max(1, r * 0.04);
        [
          [-0.4, -0.28],
          [-0.4, 0.28],
        ].forEach(([sx, sy]) => {
          ctx.beginPath();
          ctx.moveTo(sx * r, (sy - 0.14) * r);
          ctx.lineTo((sx + 0.12) * r, sy * r);
          ctx.lineTo(sx * r, (sy + 0.14) * r);
          ctx.lineTo((sx - 0.12) * r, sy * r);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    _drawWings(ctx, skinType, r, palette, flutter) {
      const isButterfly = skinType === 'unicorn' || skinType === 'royal';
      ctx.save();
      for (let side = -1; side <= 1; side += 2) {
        ctx.save();
        ctx.translate(r * 0.05, side * r * 0.22);
        ctx.rotate(side * (0.48 + flutter));

        ctx.fillStyle = palette.wing;
        ctx.strokeStyle = 'rgba(130, 108, 125, 0.38)';
        ctx.lineWidth = Math.max(1.2, r * 0.05);

        if (isButterfly) {
          // Big dreamy butterfly / silk-moth double wings!
          ctx.beginPath();
          ctx.ellipse(-r * 0.14, side * r * 0.56, r * 0.58, r * 0.36, side * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle =
            skinType === 'unicorn' ? 'rgba(189, 224, 254, 0.72)' : 'rgba(255, 200, 221, 0.72)';
          ctx.beginPath();
          ctx.ellipse(-r * 0.45, side * r * 0.34, r * 0.38, r * 0.24, side * -0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Cute dainty oval bug wings!
          ctx.beginPath();
          ctx.ellipse(-r * 0.2, side * r * 0.42, r * 0.44, r * 0.22, side * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();
      }
      ctx.restore();
    }

    _drawAntennae(ctx, skinType, headX, headR, r, palette, time, sway) {
      const bob = Math.sin(time * 7) * 0.12 + sway * 0.6;
      ctx.save();
      ctx.strokeStyle = '#6c5360';
      ctx.lineWidth = Math.max(1.6, r * 0.065);
      ctx.lineCap = 'round';

      for (let side = -1; side <= 1; side += 2) {
        const startX = headX + headR * 0.55;
        const startY = side * headR * 0.42;
        const tipX = headX + headR * 1.48;
        const tipY = side * (headR * 0.92 + bob * r * 0.5);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(headX + headR * 1.15, side * headR * 0.35, tipX, tipY);
        ctx.stroke();

        // Cute pastel bulb at tip of antenna
        ctx.fillStyle = palette.accent || '#ffe5ec';
        ctx.beginPath();
        ctx.arc(tipX, tipY, Math.max(2.4, r * 0.11), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawSkinHeadTraits(ctx, skinType, headX, headR, r, palette, time, sway) {
      const twitch = Math.sin(time * 6) * 0.08 + sway * 0.7;
      ctx.save();
      ctx.strokeStyle = '#6c5360';
      ctx.lineWidth = Math.max(1.5, r * 0.065);

      if (skinType === 'kitty') {
        // Perky triangular cat ears on sides of bug head!
        for (let side = -1; side <= 1; side += 2) {
          ctx.save();
          ctx.translate(headX - headR * 0.1, side * headR * 0.75);
          ctx.rotate(side * (0.3 + twitch));
          ctx.fillStyle = palette.shell;
          ctx.beginPath();
          ctx.moveTo(-headR * 0.32, 0);
          ctx.lineTo(headR * 0.12, side * headR * 0.72);
          ctx.lineTo(headR * 0.36, -side * headR * 0.06);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffb3c6';
          ctx.beginPath();
          ctx.moveTo(-headR * 0.14, side * headR * 0.08);
          ctx.lineTo(headR * 0.1, side * headR * 0.48);
          ctx.lineTo(headR * 0.22, side * headR * 0.04);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // Cute kitty whiskers!
        ctx.strokeStyle = '#7d6272';
        ctx.lineWidth = Math.max(1.1, r * 0.04);
        for (let side = -1; side <= 1; side += 2) {
          for (let w = -1; w <= 1; w += 2) {
            ctx.beginPath();
            ctx.moveTo(headX + headR * 0.35, side * headR * 0.65);
            ctx.lineTo(headX + headR * (0.4 + w * 0.18), side * headR * 1.15);
            ctx.stroke();
          }
        }
      } else if (skinType === 'doggy') {
        // Floppy bouncing puppy ears!
        for (let side = -1; side <= 1; side += 2) {
          ctx.save();
          ctx.translate(headX - headR * 0.18, side * headR * 0.76);
          ctx.rotate(side * (-0.35 + twitch * 1.5));
          ctx.fillStyle = palette.accent;
          ctx.beginPath();
          ctx.ellipse(-headR * 0.18, side * headR * 0.38, headR * 0.3, headR * 0.56, side * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      } else if (skinType === 'bunny') {
        // Tall bouncy pastel bunny ears!
        for (let side = -1; side <= 1; side += 2) {
          ctx.save();
          ctx.translate(headX - headR * 0.22, side * headR * 0.6);
          ctx.rotate(side * (-0.42 + twitch * 1.8));
          ctx.fillStyle = palette.head;
          ctx.beginPath();
          ctx.ellipse(-headR * 0.45, side * headR * 0.55, headR * 0.72, headR * 0.28, side * -0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffc4d6';
          ctx.beginPath();
          ctx.ellipse(-headR * 0.45, side * headR * 0.55, headR * 0.46, headR * 0.14, side * -0.55, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (skinType === 'bear') {
        // Round fuzzy honey-bear ears!
        for (let side = -1; side <= 1; side += 2) {
          ctx.fillStyle = palette.shell;
          ctx.beginPath();
          ctx.arc(headX - headR * 0.18, side * headR * 0.85, headR * 0.38, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = palette.accent;
          ctx.beginPath();
          ctx.arc(headX - headR * 0.18, side * headR * 0.85, headR * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (skinType === 'axolotl') {
        // 3 feathery pink axolotl gills on each side!
        for (let side = -1; side <= 1; side += 2) {
          for (let g = -1; g <= 1; g++) {
            ctx.save();
            ctx.translate(headX - headR * 0.15, side * headR * 0.78);
            ctx.rotate(side * (0.25 + g * 0.38 + twitch));
            ctx.fillStyle = palette.accent;
            ctx.beginPath();
            ctx.ellipse(0, side * headR * 0.46, headR * 0.15, headR * 0.44, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        }
      } else if (skinType === 'unicorn') {
        // Golden spiral unicorn horn pointing forward!
        ctx.fillStyle = '#ffe066';
        ctx.beginPath();
        ctx.moveTo(headX + headR * 0.72, -headR * 0.22);
        ctx.lineTo(headX + headR * 1.72, 0);
        ctx.lineTo(headX + headR * 0.72, headR * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (skinType === 'royal') {
        // Tiny golden royal crown perched on head!
        ctx.save();
        ctx.translate(headX - headR * 0.05, 0);
        ctx.fillStyle = '#ffda66';
        ctx.beginPath();
        ctx.moveTo(-headR * 0.34, -headR * 0.44);
        ctx.lineTo(headR * 0.16, -headR * 0.44);
        ctx.lineTo(headR * 0.34, -headR * 0.22);
        ctx.lineTo(headR * 0.05, 0);
        ctx.lineTo(headR * 0.34, headR * 0.22);
        ctx.lineTo(headR * 0.16, headR * 0.44);
        ctx.lineTo(-headR * 0.34, headR * 0.44);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ff7aa2';
        ctx.beginPath();
        ctx.arc(-headR * 0.06, 0, headR * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    _drawKawaiiFace(ctx, bug, skinType, headX, headR, r) {
      const eyeX = headX + headR * 0.32;
      const eyeOffsetY = headR * 0.42;
      const eyeR = Math.max(2.6, headR * 0.24);
      const isHappy = bug.chompTimer > 0 || bug.celebrateTimer > 0;
      const isScared = (bug.scaredAmount || 0) > 0.45 && !isHappy;

      // Rosy pastel cheeks
      ctx.fillStyle = 'rgba(255, 138, 171, 0.52)';
      ctx.beginPath();
      ctx.ellipse(headX + headR * 0.24, -headR * 0.68, headR * 0.2, headR * 0.14, 0, 0, Math.PI * 2);
      ctx.ellipse(headX + headR * 0.24, headR * 0.68, headR * 0.2, headR * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      for (let side = -1; side <= 1; side += 2) {
        const ey = side * eyeOffsetY;
        if (bug.isBlinking || isHappy) {
          ctx.strokeStyle = '#4a3542';
          ctx.lineWidth = Math.max(1.8, r * 0.075);
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (isHappy) {
            ctx.arc(eyeX, ey, eyeR * 0.85, -Math.PI * 0.35, Math.PI * 0.35);
          } else {
            ctx.moveTo(eyeX, ey - eyeR * 0.7);
            ctx.lineTo(eyeX, ey + eyeR * 0.7);
          }
          ctx.stroke();
        } else {
          ctx.fillStyle = '#3f2a37';
          ctx.beginPath();
          ctx.arc(eyeX, ey, isScared ? eyeR * 1.15 : eyeR, 0, Math.PI * 2);
          ctx.fill();

          // Big kawaii eye sparkle
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(eyeX + eyeR * 0.28, ey - eyeR * 0.28, eyeR * 0.38, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.arc(eyeX - eyeR * 0.22, ey + eyeR * 0.24, eyeR * 0.18, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cute nose / mouth
      const mouthX = headX + headR * 0.68;
      if (bug.chompTimer > 0) {
        // Happy chomp mouth!
        ctx.fillStyle = '#ff7aa2';
        ctx.beginPath();
        ctx.arc(mouthX, 0, headR * 0.22, 0, Math.PI * 2);
        ctx.fill();
      } else if (skinType === 'doggy') {
        // Boopable puppy button nose!
        ctx.fillStyle = '#5e3d31';
        ctx.beginPath();
        ctx.ellipse(mouthX + headR * 0.06, 0, headR * 0.14, headR * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (skinType === 'kitty') {
        // Tiny pink kitty nose!
        ctx.fillStyle = '#ff7aa2';
        ctx.beginPath();
        ctx.arc(mouthX + headR * 0.04, 0, headR * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (isScared) {
        // Little worried 'o' mouth
        ctx.strokeStyle = '#5a3d4c';
        ctx.lineWidth = Math.max(1.4, r * 0.055);
        ctx.beginPath();
        ctx.arc(mouthX, 0, headR * 0.13, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Cute tiny smile
        ctx.strokeStyle = '#5a3d4c';
        ctx.lineWidth = Math.max(1.4, r * 0.055);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(mouthX - headR * 0.08, 0, headR * 0.18, -0.6, 0.6);
        ctx.stroke();
      }
    }

    _drawBugLabel(ctx, bug, player, isLeader) {
      const r = bug.visualRadius;
      const rankCfg = Config.getRankConfig(bug.rank);
      const y = bug.y + r + 17;

      const playerEffRank = player && player.getEffectiveRank ? player.getEffectiveRank() : player ? player.rank : 1;
      const isDanger = player && !bug.isPlayer && bug.rank > playerEffRank;
      const bugEffRank = bug.isPlayer && bug.getEffectiveRank ? bug.getEffectiveRank() : bug.rank;
      const rankDiffBonus = bug.isPlayer ? bugEffRank - bug.rank : 0;
      const badgeText =
        'Lv.' +
        bug.rank +
        (rankDiffBonus > 0 ? '(+' + rankDiffBonus + ')' : rankDiffBonus < 0 ? '(' + rankDiffBonus + ')' : '');
      const nameText = bug.isPlayer ? bug.name : bug.rank === 0 ? '' : bug.name;

      ctx.save();
      ctx.font = '700 12px "SF Pro Rounded", ui-rounded, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const fullLabel = nameText ? badgeText + ' · ' + nameText : badgeText;
      const textW = ctx.measureText(fullLabel).width;
      const pillW = textW + (isDanger ? 26 : 16);
      const pillH = 20;

      // Pill background
      this._roundRect(ctx, bug.x - pillW * 0.5, y - pillH * 0.5, pillW, pillH, 10);
      ctx.fillStyle = bug.isPlayer
        ? 'rgba(255, 255, 255, 0.92)'
        : isDanger
        ? 'rgba(255, 224, 232, 0.92)'
        : 'rgba(255, 255, 255, 0.82)';
      ctx.fill();
      ctx.strokeStyle = bug.isPlayer ? '#c792ea' : isDanger ? '#f2789b' : rankCfg.accentColor;
      ctx.lineWidth = bug.isPlayer ? 2 : 1.5;
      ctx.stroke();

      ctx.fillStyle = isDanger ? '#b82952' : '#523d4c';
      ctx.fillText(isDanger ? '⚠ ' + fullLabel : fullLabel, bug.x, y + 0.5);

      // Crown above the #1 highest-ranked bug in the garden!
      if (isLeader) {
        const crownY = bug.y - r - 18 + Math.sin(this.time * 4) * 3;
        ctx.fillStyle = '#ffd166';
        ctx.strokeStyle = '#9e6b12';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bug.x - 10, crownY + 5);
        ctx.lineTo(bug.x - 12, crownY - 5);
        ctx.lineTo(bug.x - 4, crownY);
        ctx.lineTo(bug.x, crownY - 8);
        ctx.lineTo(bug.x + 4, crownY);
        ctx.lineTo(bug.x + 12, crownY - 5);
        ctx.lineTo(bug.x + 10, crownY + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Damaged AI bug HP pips (so brave players can see a weakened +1 bug!)
      if (!bug.isPlayer && bug.hp < bug.maxHp) {
        const pipY = bug.y - r - 12;
        const barW = Math.min(48, Math.max(26, r * 1.1));
        this._roundRect(ctx, bug.x - barW * 0.5, pipY - 4, barW, 7, 4);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fill();
        const pct = Math.max(0, bug.hp / bug.maxHp);
        this._roundRect(ctx, bug.x - barW * 0.5 + 1, pipY - 3, (barW - 2) * pct, 5, 3);
        ctx.fillStyle = '#ff8fab';
        ctx.fill();
      }

      ctx.restore();
    }

    _drawParticles(ctx, particles, viewLeft, viewRight, viewTop, viewBottom) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.x < viewLeft || p.x > viewRight || p.y < viewTop || p.y > viewBottom) continue;
        const alpha = Math.max(0, p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'star') {
          this._drawStar(ctx, 0, 0, 5, p.size, p.size * 0.45);
        } else if (p.shape === 'heart') {
          this._drawMiniHeart(ctx, 0, 0, p.size * 0.9);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    _drawFloatingTexts(ctx, list) {
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        const alpha = Math.min(1, (t.life / t.maxLife) * 1.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = '800 ' + Math.round(16 * t.scale) + 'px "SF Pro Rounded", ui-rounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      }
    }

    _drawVirtualJoystick(ctx, touch) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(touch.originX, touch.originY, touch.maxRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(181, 138, 224, 0.6)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(touch.knobX, touch.knobY, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 179, 198, 0.78)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    _drawMinimap(ctx, engine, leaderId) {
      const size = this.width < 640 ? 96 : 124;
      const margin = 16;
      // Place minimap in bottom-left so it never overlaps the bottom-right touch DASH button
      const x = margin;
      const y = this.height - size - margin;
      const world = Config.WORLD;
      const player = engine.player;

      ctx.save();
      this._roundRect(ctx, x, y, size, size, 18);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(168, 216, 170, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Draw fenced rest sanctuaries on minimap so players can navigate to safety!
      const sanctuaries = engine.sanctuaries || [];
      for (let i = 0; i < sanctuaries.length; i++) {
        const s = sanctuaries[i];
        const sx = x + 6 + ((s.x - s.width * 0.5) / world.width) * (size - 12);
        const sy = y + 6 + ((s.y - s.height * 0.5) / world.height) * (size - 12);
        const sw = Math.max(8, (s.width / world.width) * (size - 12));
        const sh = Math.max(7, (s.height / world.height) * (size - 12));
        ctx.fillStyle = 'rgba(255, 240, 195, 0.9)';
        ctx.strokeStyle = '#c2a07a';
        ctx.lineWidth = 1.2;
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeRect(sx, sy, sw, sh);
      }

      // Draw ponds, trees & rocks on minimap
      const obstacles = engine.obstacles || [];
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const ox = x + 6 + (o.x / world.width) * (size - 12);
        const oy = y + 6 + (o.y / world.height) * (size - 12);
        if (o.type === 'pond') {
          ctx.fillStyle = '#8adbf5';
          ctx.beginPath();
          ctx.ellipse(
            ox,
            oy,
            Math.max(3, (o.radius / world.width) * (size - 12)),
            Math.max(2.5, (o.ry / world.height) * (size - 12)),
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        } else if (o.type === 'tree') {
          ctx.fillStyle = 'rgba(130, 205, 145, 0.8)';
          ctx.beginPath();
          ctx.arc(ox, oy, 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(182, 174, 194, 0.8)';
          ctx.beginPath();
          ctx.arc(ox, oy, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const playerEffRank = player && player.getEffectiveRank ? player.getEffectiveRank() : player ? player.rank : 1;

      for (let i = 0; i < engine.bugs.length; i++) {
        const b = engine.bugs[i];
        if (!b.isAlive) continue;
        const mx = x + 6 + (b.x / world.width) * (size - 12);
        const my = y + 6 + (b.y / world.height) * (size - 12);

        if (b.isPlayer) {
          ctx.fillStyle = '#9d4edd';
          ctx.beginPath();
          ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (b.id === leaderId) {
          ctx.fillStyle = '#ffbe0b';
          ctx.beginPath();
          ctx.arc(mx, my, 3.8, 0, Math.PI * 2);
          ctx.fill();
        } else if (player && b.rank > playerEffRank) {
          ctx.fillStyle = '#ff7aa2';
          ctx.beginPath();
          ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#7ad1a6';
          ctx.beginPath();
          ctx.arc(mx, my, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    /**
     * Render a live animated skin preview into any small UI canvas (Skin Shop / Title).
     */
    renderSkinPreview(canvas, skinId, time) {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, global.devicePixelRatio || 1);
      const w = canvas.clientWidth || 92;
      const h = canvas.clientHeight || 92;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      const mockBug = {
        isPlayer: true,
        skinId: skinId || 'classic',
        walkPhase: time * 7,
        wingPhase: time * 14,
        angularVel: Math.sin(time * 2.5) * 2.2,
        chompTimer: 0,
        celebrateTimer: 0,
        scaredAmount: 0,
        hurtFlashTimer: 0,
        isBlinking: Math.sin(time * 1.1) > 0.96,
      };

      const radius = Math.min(w, h) * 0.25;
      const angle = -Math.PI * 0.2 + Math.sin(time * 2.1) * 0.16;
      this.drawCuteBugSprite(ctx, mockBug, w * 0.5, h * 0.54, radius, angle, time);
      ctx.restore();
    }

    _drawMiniHeart(ctx, x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.45);
      ctx.bezierCurveTo(x - s, y - s * 0.1, x - s * 0.6, y - s, x, y - s * 0.35);
      ctx.bezierCurveTo(x + s * 0.6, y - s, x + s, y - s * 0.1, x, y + s * 0.45);
      ctx.fill();
    }

    _drawStar(ctx, cx, cy, spikes, outerR, innerR) {
      let rot = (Math.PI / 2) * 3;
      const step = Math.PI / spikes;
      ctx.beginPath();
      ctx.moveTo(cx, cy - outerR);
      for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
        rot += step;
      }
      ctx.closePath();
      ctx.fill();
    }

    _roundRect(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w * 0.5, h * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }
  }

  DeeBug.GameRenderer = GameRenderer;
})(window);
