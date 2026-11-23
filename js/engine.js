/**
 * DeeBug — Core Game Simulation Engine (DOM-Free)
 *
 * Manages world state, player & AI bugs, garden food (regular growth food + temporary
 * power-up & silly debuff treats), randomly generated immovable obstacles (trees, ponds,
 * rocks), fenced rest/escape sanctuaries, eating/rank-up progression, skin purchases,
 * spawning, and win conditions.
 *
 * Designed with clean InputIntent hooks and EventBus callbacks so it can later
 * run in a WebWorker or authoritative Node.js multiplayer server.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const Config = DeeBug.Config;
  const { BugEntity, FoodItem, WorldObstacle, SanctuaryZone, Particle, FloatingText } = DeeBug.Entities;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerpAngle(current, target, maxStep) {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return current + Math.sign(diff) * maxStep;
  }

  class GameEngine {
    constructor(aiController) {
      this.ai = aiController || new DeeBug.AIController();
      this.listeners = new Map();

      this.state = 'menu'; // menu | playing | paused | victory | gameover
      this.elapsedTime = 0;
      this.spawnTimer = 0;
      this.foodSpawnTimer = 0;

      this.player = null;
      this.bugs = [];
      this.foods = [];
      this.obstacles = [];
      this.sanctuaries = [];
      this.particles = [];
      this.floatingTexts = [];
      this.decor = [];

      this.achievedMaxRank = false;
      this.achievedAllSkins = false;
      this.continuedAfterFirstWin = false;
      this.lastVictoryType = null;
      this.screenShake = 0;

      this._foodWeightTotal = Config.FOOD_TYPES.reduce((sum, f) => sum + f.weight, 0);

      this._generateDecor();
      this._generateWorldFeatures();
    }

    on(eventName, handler) {
      if (!this.listeners.has(eventName)) {
        this.listeners.set(eventName, []);
      }
      this.listeners.get(eventName).push(handler);
      return () => {
        const list = this.listeners.get(eventName);
        if (!list) return;
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    }

    emit(eventName, payload) {
      const list = this.listeners.get(eventName);
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        list[i](payload);
      }
    }

    _generateDecor() {
      const world = Config.WORLD;
      const types = ['clover', 'daisy', 'pebble', 'buttercup', 'leaf', 'lavender'];
      this.decor = [];
      for (let i = 0; i < world.decorCount; i++) {
        this.decor.push({
          x: world.borderPadding + 40 + Math.random() * (world.width - world.borderPadding * 2 - 80),
          y: world.borderPadding + 40 + Math.random() * (world.height - world.borderPadding * 2 - 80),
          type: types[i % types.length],
          scale: 0.75 + Math.random() * 0.75,
          rotation: Math.random() * Math.PI * 2,
          swayPhase: Math.random() * Math.PI * 2,
        });
      }
    }

    /**
     * Randomly generates immovable garden landmarks on each new game:
     * fenced rest/escape sanctuaries, ponds, trees, and rocks.
     */
    _generateWorldFeatures() {
      const world = Config.WORLD;
      const counts = world.obstacleCounts;
      const cx = world.width * 0.5;
      const cy = world.height * 0.5;
      const pad = world.borderPadding + 160;

      this.sanctuaries = [];
      this.obstacles = [];

      const isBlockedByCenter = (x, y, r) => Math.hypot(x - cx, y - cy) < r + 230;

      const overlapsSanctuary = (x, y, r) => {
        for (let i = 0; i < this.sanctuaries.length; i++) {
          const s = this.sanctuaries[i];
          if (s.containsPoint(x, y, r + 55)) return true;
        }
        return false;
      };

      const overlapsObstacle = (x, y, r, extraPad) => {
        const ep = extraPad || 38;
        for (let i = 0; i < this.obstacles.length; i++) {
          const o = this.obstacles[i];
          const minD = Math.max(o.radius, o.ry) + r + ep;
          if (Math.hypot(x - o.x, y - o.y) < minD) return true;
        }
        return false;
      };

      // 1. Place cozy Fenced Rest / Escape Sanctuaries
      for (let i = 0; i < counts.sanctuaries; i++) {
        const w = 260 + Math.floor(Math.random() * 40);
        const h = 210 + Math.floor(Math.random() * 40);
        const gates = i % 2 === 0 ? ['bottom', 'top'] : ['left', 'right'];

        for (let tries = 0; tries < 40; tries++) {
          let x;
          let y;
          if (i === 0 && tries < 20) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 420 + Math.random() * 220;
            x = clamp(cx + Math.cos(ang) * dist, pad + w * 0.5, world.width - pad - w * 0.5);
            y = clamp(cy + Math.sin(ang) * dist, pad + h * 0.5, world.height - pad - h * 0.5);
          } else {
            x = pad + w * 0.5 + Math.random() * (world.width - pad * 2 - w);
            y = pad + h * 0.5 + Math.random() * (world.height - pad * 2 - h);
          }

          const approxR = Math.max(w, h) * 0.55;
          if (isBlockedByCenter(x, y, approxR)) continue;

          let tooClose = false;
          for (let j = 0; j < this.sanctuaries.length; j++) {
            if (Math.hypot(x - this.sanctuaries[j].x, y - this.sanctuaries[j].y) < 950) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) continue;

          this.sanctuaries.push(new SanctuaryZone({ x, y, width: w, height: h, gates }));
          break;
        }
      }

      // 2. Place sparkling pastel Ponds (immovable ovals)
      for (let i = 0; i < counts.ponds; i++) {
        const rx = 95 + Math.random() * 55;
        const ry = 70 + Math.random() * 42;
        const maxR = Math.max(rx, ry);
        for (let tries = 0; tries < 35; tries++) {
          const x = pad + maxR + Math.random() * (world.width - (pad + maxR) * 2);
          const y = pad + maxR + Math.random() * (world.height - (pad + maxR) * 2);
          if (isBlockedByCenter(x, y, maxR)) continue;
          if (overlapsSanctuary(x, y, maxR + 30)) continue;
          if (overlapsObstacle(x, y, maxR, 95)) continue;
          this.obstacles.push(
            new WorldObstacle({
              type: 'pond',
              x,
              y,
              radius: rx,
              ry,
              rotation: (Math.random() - 0.5) * 0.4,
              variant: i % 3,
            })
          );
          break;
        }
      }

      // 3. Place Pastel Trees (immovable trunks with lush fluffy canopies)
      for (let i = 0; i < counts.trees; i++) {
        const trunkR = 28 + Math.random() * 14;
        const canopyR = trunkR * (2.5 + Math.random() * 0.55);
        for (let tries = 0; tries < 35; tries++) {
          const x = pad + canopyR + Math.random() * (world.width - (pad + canopyR) * 2);
          const y = pad + canopyR + Math.random() * (world.height - (pad + canopyR) * 2);
          if (isBlockedByCenter(x, y, canopyR * 0.7)) continue;
          if (overlapsSanctuary(x, y, canopyR * 0.85)) continue;
          if (overlapsObstacle(x, y, canopyR * 0.75, 55)) continue;
          this.obstacles.push(
            new WorldObstacle({
              type: 'tree',
              x,
              y,
              radius: trunkR,
              ry: trunkR,
              canopyRadius: canopyR,
              variant: i % 3,
            })
          );
          break;
        }
      }

      // 4. Place Smooth Pastel Rocks (immovable mossy garden boulders)
      for (let i = 0; i < counts.rocks; i++) {
        const rockR = 32 + Math.random() * 24;
        for (let tries = 0; tries < 35; tries++) {
          const x = pad + rockR + Math.random() * (world.width - (pad + rockR) * 2);
          const y = pad + rockR + Math.random() * (world.height - (pad + rockR) * 2);
          if (isBlockedByCenter(x, y, rockR + 20)) continue;
          if (overlapsSanctuary(x, y, rockR + 25)) continue;
          if (overlapsObstacle(x, y, rockR, 45)) continue;
          this.obstacles.push(
            new WorldObstacle({
              type: 'rock',
              x,
              y,
              radius: rockR,
              ry: rockR,
              rotation: Math.random() * Math.PI * 2,
              variant: i % 3,
            })
          );
          break;
        }
      }
    }

    _isPointClearForSpawn(x, y, clearance, avoidSanctuaryInterior) {
      const world = Config.WORLD;
      const pad = world.borderPadding + clearance;
      if (x < pad || x > world.width - pad || y < pad || y > world.height - pad) return false;

      for (let i = 0; i < this.obstacles.length; i++) {
        const o = this.obstacles[i];
        const minR = Math.max(o.radius, o.ry) + clearance;
        if (Math.hypot(x - o.x, y - o.y) < minR) return false;
      }

      for (let i = 0; i < this.sanctuaries.length; i++) {
        const s = this.sanctuaries[i];
        if (avoidSanctuaryInterior && s.containsPoint(x, y, clearance + 20)) return false;
        const segs = s.getWallSegments();
        for (let k = 0; k < segs.length; k++) {
          const seg = segs[k];
          if (
            x >= seg.x - clearance &&
            x <= seg.x + seg.w + clearance &&
            y >= seg.y - clearance &&
            y <= seg.y + seg.h + clearance
          ) {
            return false;
          }
        }
      }

      return true;
    }

    startNewGame(playerName) {
      const world = Config.WORLD;
      this.ai.reset();
      this.elapsedTime = 0;
      this.spawnTimer = 0;
      this.foodSpawnTimer = 0;
      this.particles = [];
      this.floatingTexts = [];
      this.foods = [];
      this.achievedMaxRank = false;
      this.achievedAllSkins = false;
      this.continuedAfterFirstWin = false;
      this.lastVictoryType = null;
      this.screenShake = 0;

      this._generateDecor();
      this._generateWorldFeatures();

      const cleanName = (playerName || 'DeeBug').trim().slice(0, 14) || 'DeeBug';

      this.player = new BugEntity({
        isPlayer: true,
        ownerId: 'local_player',
        name: cleanName,
        x: world.width * 0.5,
        y: world.height * 0.5,
        angle: -Math.PI / 4,
        rank: 1,
        points: 0,
        skinId: 'classic',
        ownedSkins: ['classic'],
      });

      this.bugs = [this.player];
      this.state = 'playing';

      this._populateInitialBugs();
      this._populateInitialFood();
      this.emit('gameStart', { player: this.player });
    }

    _populateInitialBugs() {
      const target = Config.WORLD.targetBugCount;
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const dist = 210 + Math.random() * 280;
        const rx = this.player.x + Math.cos(angle) * dist;
        const ry = this.player.y + Math.sin(angle) * dist;
        if (this._isPointClearForSpawn(rx, ry, 34, true)) {
          this._spawnAIBugAt(rx, ry, i < 8 ? 0 : 1);
        }
      }

      while (this.bugs.length < target) {
        this._spawnAIBug(true);
      }
    }

    _populateInitialFood() {
      const target = Config.WORLD.targetFoodCount;
      const starterTypes = ['fresh_leaf', 'sweet_berry', 'peach_fruit', 'button_mushroom', 'star_berry'];
      // Keep only a few starter snacks nearby so food feels scarce and rewarding to forage!
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist = 160 + Math.random() * 260;
        const fx = this.player.x + Math.cos(angle) * dist;
        const fy = this.player.y + Math.sin(angle) * dist;
        if (this._isPointClearForSpawn(fx, fy, 18, false)) {
          const typeId = starterTypes[i % starterTypes.length];
          this.foods.push(new FoodItem({ typeId, x: fx, y: fy }));
        }
      }

      for (let s = 0; s < this.sanctuaries.length; s++) {
        const zone = this.sanctuaries[s];
        const fx = zone.x + (Math.random() - 0.5) * (zone.width - 100);
        const fy = zone.y + (Math.random() - 0.5) * (zone.height - 100);
        this.foods.push(new FoodItem({ typeId: s % 2 === 0 ? 'sweet_berry' : 'fresh_leaf', x: fx, y: fy }));
      }

      while (this.foods.length < target) {
        this._spawnFoodItem(true);
      }
    }

    _pickWeightedFoodType() {
      let roll = Math.random() * this._foodWeightTotal;
      for (let i = 0; i < Config.FOOD_TYPES.length; i++) {
        roll -= Config.FOOD_TYPES[i].weight;
        if (roll <= 0) return Config.FOOD_TYPES[i];
      }
      return Config.FOOD_TYPES[0];
    }

    _spawnFoodItem(anywhere) {
      const world = Config.WORLD;
      const pad = world.borderPadding + 55;
      const foodType = this._pickWeightedFoodType();

      for (let tries = 0; tries < 18; tries++) {
        let x;
        let y;
        if (!anywhere && this.player) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 240 + Math.random() * 1150;
          x = clamp(this.player.x + Math.cos(angle) * dist, pad, world.width - pad);
          y = clamp(this.player.y + Math.sin(angle) * dist, pad, world.height - pad);
        } else {
          x = pad + Math.random() * (world.width - pad * 2);
          y = pad + Math.random() * (world.height - pad * 2);
        }

        if (this._isPointClearForSpawn(x, y, foodType.radius + 10, false)) {
          const item = new FoodItem({ typeId: foodType.id, x, y });
          this.foods.push(item);
          return item;
        }
      }
      return null;
    }

    _chooseSpawnRank() {
      const pRank = this.player ? this.player.rank : 1;
      const maxAiRank = Config.MAX_RANK - 1;
      const roll = Math.random();

      if (pRank <= 1) {
        if (roll < 0.36) return 0;
        if (roll < 0.58) return 1;
        if (roll < 0.76) return 2;
        if (roll < 0.89) return 3 + Math.floor(Math.random() * 2);
        return Math.min(maxAiRank, 5 + Math.floor(Math.random() * 6));
      }

      if (pRank >= Config.MAX_RANK) {
        return Math.max(0, Math.min(maxAiRank, Math.floor(Math.random() * Config.MAX_RANK)));
      }

      if (roll < 0.32) {
        // Strictly lower rank (tasty snacks, but you have to hunt for them!)
        return Math.max(0, pRank - 1 - Math.floor(Math.random() * Math.min(4, pRank)));
      }
      if (roll < 0.52) {
        // Equal rank (fair chomp!)
        return pRank;
      }
      if (roll < 0.80) {
        // +1 to +3 stronger rivals roaming nearby for higher challenge
        return Math.min(maxAiRank, pRank + 1 + Math.floor(Math.random() * 3));
      }
      // Roaming big garden titans (up to Lv.19)
      const minTitan = Math.min(maxAiRank, Math.max(pRank + 3, 7));
      return minTitan + Math.floor(Math.random() * (maxAiRank - minTitan + 1));
    }

    _spawnAIBug(anywhereInWorld) {
      const world = Config.WORLD;
      const pad = world.borderPadding + 90;
      const rank = this._chooseSpawnRank();
      const rankCfg = Config.getRankConfig(rank);

      for (let tries = 0; tries < 20; tries++) {
        let x;
        let y;
        if (!anywhereInWorld && this.player) {
          const angle = Math.random() * Math.PI * 2;
          const dist =
            world.minSpawnDistanceFromPlayer +
            Math.random() * (world.maxSpawnDistanceFromPlayer - world.minSpawnDistanceFromPlayer);
          x = clamp(this.player.x + Math.cos(angle) * dist, pad, world.width - pad);
          y = clamp(this.player.y + Math.sin(angle) * dist, pad, world.height - pad);
        } else {
          x = pad + Math.random() * (world.width - pad * 2);
          y = pad + Math.random() * (world.height - pad * 2);
        }

        if (this.player) {
          const dx = x - this.player.x;
          const dy = y - this.player.y;
          if (dx * dx + dy * dy < world.minSpawnDistanceFromPlayer * world.minSpawnDistanceFromPlayer) {
            continue;
          }
        }

        if (this._isPointClearForSpawn(x, y, rankCfg.radius + 14, true)) {
          return this._spawnAIBugAt(x, y, rank);
        }
      }
      return null;
    }

    _spawnAIBugAt(x, y, rank) {
      const world = Config.WORLD;
      const pad = world.borderPadding + 45;
      const clampedX = clamp(x, pad, world.width - pad);
      const clampedY = clamp(y, pad, world.height - pad);
      const rankCfg = Config.getRankConfig(rank);
      const personalities = rank === 0 ? ['timid'] : ['timid', 'wanderer', 'wanderer', 'hunter'];
      const aiPersonality = personalities[Math.floor(Math.random() * personalities.length)];
      const names = Config.AI_NAMES;
      const name = rank === 0 ? 'Dewy' : names[Math.floor(Math.random() * names.length)];

      const bug = new BugEntity({
        isPlayer: false,
        ownerId: 'ai_bot',
        name,
        x: clampedX,
        y: clampedY,
        rank,
        points: rankCfg.pointsRequired,
        skinId: 'classic',
        aiPersonality,
        customTint: {
          body: rankCfg.bodyColor,
          shell: rankCfg.accentColor,
          head: rankCfg.badgeBg,
        },
      });

      this.bugs.push(bug);
      return bug;
    }

    setPaused(paused) {
      if (paused && this.state === 'playing') {
        this.state = 'paused';
        this.emit('stateChange', { state: this.state });
      } else if (!paused && this.state === 'paused') {
        this.state = 'playing';
        this.emit('stateChange', { state: this.state });
      }
    }

    continueAfterVictory() {
      if (this.state !== 'victory') return;
      this.continuedAfterFirstWin = true;
      this.state = 'playing';
      this.emit('stateChange', { state: this.state });
    }

    buyOrEquipSkin(skinId) {
      if (!this.player || !this.player.isAlive) {
        return { ok: false, reason: 'not_playing' };
      }

      const skin = Config.getSkinConfig(skinId);
      if (!skin) return { ok: false, reason: 'invalid_skin' };

      if (this.player.ownedSkins.includes(skin.id)) {
        this.player.skinId = skin.id;
        this._spawnBurst(this.player.x, this.player.y, skin.palette.sparkle, 14, 'star');
        this.emit('skinEquipped', { skin, player: this.player });
        return { ok: true, action: 'equipped', skin };
      }

      if (this.player.points < skin.cost) {
        return {
          ok: false,
          reason: 'insufficient_points',
          needed: Math.ceil(skin.cost - this.player.points),
        };
      }

      this.player.points = Math.max(0, this.player.points - skin.cost);
      this.player.ownedSkins.push(skin.id);
      this.player.skinId = skin.id;
      this.player.celebrateTimer = 1.2;

      this._spawnBurst(this.player.x, this.player.y, skin.palette.sparkle, 24, 'heart');
      this._spawnBurst(this.player.x, this.player.y, '#ffe66d', 14, 'star');
      this._addFloatingText(
        this.player.x,
        this.player.y - this.player.visualRadius - 16,
        skin.name + ' Unlocked! -' + skin.cost + ' pts',
        '#7b3fa0',
        1.15
      );

      this.emit('skinBought', { skin, player: this.player });
      this._checkWinConditions();
      return { ok: true, action: 'bought', skin };
    }

    update(dt, playerIntent) {
      const clampedDt = Math.min(0.05, Math.max(0.001, dt));
      this.screenShake = Math.max(0, this.screenShake - clampedDt * 18);

      this._updateEffects(clampedDt);

      if (this.state !== 'playing' || !this.player) return;

      this.elapsedTime += clampedDt;
      const worldContext = {
        obstacles: this.obstacles,
        sanctuaries: this.sanctuaries,
        foods: this.foods,
      };

      // 1. Update all bugs
      for (let i = 0; i < this.bugs.length; i++) {
        const bug = this.bugs[i];
        if (!bug.isAlive) continue;

        let intent;
        if (bug.isPlayer) {
          intent = playerIntent || { targetAngle: bug.angle, throttle: 0, boost: false };
        } else {
          intent = this.ai.computeIntent(bug, this.bugs, clampedDt, worldContext);
        }

        this._updateBug(bug, intent, clampedDt);
      }

      // 2. Resolve food eating
      this._resolveFoodCollisions();

      // 3. Resolve bug-vs-bug collisions
      this._resolveCollisions();

      // 4. Clean up eaten bugs and foods
      this.bugs = this.bugs.filter((b) => b.isAlive);
      this.foods = this.foods.filter((f) => f.isAlive);

      // 5. Continuously spawn new bugs
      this.spawnTimer -= clampedDt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.55;
        const missing = Config.WORLD.targetBugCount - this.bugs.length;
        const toSpawn = Math.min(4, Math.max(0, missing));
        for (let s = 0; s < toSpawn; s++) {
          this._spawnAIBug(false);
        }
      }

      // 6. Continuously spawn fresh garden food (slower cadence so food stays scarce!)
      this.foodSpawnTimer -= clampedDt;
      if (this.foodSpawnTimer <= 0) {
        this.foodSpawnTimer = 1.1;
        const missingFood = Config.WORLD.targetFoodCount - this.foods.length;
        const toSpawn = Math.min(2, Math.max(0, missingFood));
        for (let s = 0; s < toSpawn; s++) {
          this._spawnFoodItem(false);
        }
      }
    }

    _updateBug(bug, intent, dt) {
      const rankCfg = Config.getRankConfig(bug.rank);
      const world = Config.WORLD;

      bug.tickEffects(dt);

      bug.invulnTimer = Math.max(0, bug.invulnTimer - dt);
      bug.hurtFlashTimer = Math.max(0, bug.hurtFlashTimer - dt);
      bug.chompTimer = Math.max(0, bug.chompTimer - dt);
      bug.celebrateTimer = Math.max(0, bug.celebrateTimer - dt);
      bug.timeSinceHurt += dt;

      const targetRadius = bug.getEffectiveRadius();
      bug.visualRadius += (targetRadius - bug.visualRadius) * Math.min(1, dt * 6.5);

      // Check sanctuary resting state for player
      if (bug.isPlayer) {
        const wasInSanctuary = bug.inSanctuary;
        let insideAny = false;
        for (let i = 0; i < this.sanctuaries.length; i++) {
          if (this.sanctuaries[i].containsPoint(bug.x, bug.y, -12)) {
            insideAny = true;
            break;
          }
        }
        bug.inSanctuary = insideAny;
        if (insideAny && !wasInSanctuary) {
          this._addFloatingText(bug.x, bug.y - bug.visualRadius - 14, '🏡 Safe Rest Area!', '#2f7d58', 1.05);
          this.emit('sanctuaryEnter', { player: bug });
        }

        if (insideAny) {
          bug.boostEnergy = Math.min(100, bug.boostEnergy + Config.COMBAT.boostRegenPerSec * 1.4 * dt);
          if (bug.hp < bug.maxHp) {
            bug.sanctuaryHealTimer += dt;
            if (bug.sanctuaryHealTimer >= 1.8) {
              bug.sanctuaryHealTimer = 0;
              bug.hp = Math.min(bug.maxHp, bug.hp + 1);
              this._spawnBurst(bug.x, bug.y, '#98ebd8', 10, 'heart');
              this._addFloatingText(bug.x, bug.y - bug.visualRadius - 12, '+1 ♥ Rested!', '#2f8a62', 1.0);
            }
          }
        } else {
          bug.sanctuaryHealTimer = 0;
        }
      }

      if (bug.isPlayer && !bug.inSanctuary && bug.hp < bug.maxHp && bug.timeSinceHurt >= Config.COMBAT.hpRegenDelaySec) {
        bug.regenTimer += dt;
        if (bug.regenTimer >= Config.COMBAT.hpRegenIntervalSec) {
          bug.regenTimer = 0;
          bug.hp = Math.min(bug.maxHp, bug.hp + 1);
          this._spawnBurst(bug.x, bug.y, '#ff9ebb', 8, 'heart');
          this._addFloatingText(bug.x, bug.y - bug.visualRadius - 10, '+1 ♥', '#e05780', 1.0);
        }
      }

      bug.blinkTimer -= dt;
      if (bug.blinkTimer <= 0) {
        if (bug.isBlinking) {
          bug.isBlinking = false;
          bug.blinkTimer = 2.0 + Math.random() * 3.5;
        } else {
          bug.isBlinking = true;
          bug.blinkTimer = 0.13;
        }
      }

      const wantsBoost = !!intent.boost && (intent.throttle || 0) > 0.15;
      const fasterBonus = bug.hasEffect('faster') ? 1.5 : 1;
      if (wantsBoost && bug.boostEnergy > (bug.isBoosting ? 2 : 16)) {
        if (!bug.isBoosting && bug.isPlayer) {
          this.emit('dash', { bug });
        }
        bug.isBoosting = true;
        bug.boostEnergy = Math.max(0, bug.boostEnergy - Config.COMBAT.boostDrainPerSec * dt);
      } else {
        bug.isBoosting = false;
        bug.boostEnergy = Math.min(100, bug.boostEnergy + Config.COMBAT.boostRegenPerSec * fasterBonus * dt);
      }

      const throttle = clamp(intent.throttle !== undefined ? intent.throttle : 0, 0, 1);
      const prevAngle = bug.angle;
      if (throttle > 0.05 && intent.targetAngle !== undefined && !Number.isNaN(intent.targetAngle)) {
        const turnRate = (bug.isPlayer ? 8.2 : 5.4) - bug.rank * 0.12;
        bug.angle = lerpAngle(bug.angle, intent.targetAngle, Math.max(3.2, turnRate) * dt);
      }
      bug.angularVel = (bug.angle - prevAngle) / dt;

      const baseSpeed = rankCfg.speed * (bug.isPlayer ? 1.06 : 0.92) * bug.getSpeedMultiplier();
      const speed = baseSpeed * throttle * (bug.isBoosting ? Config.COMBAT.boostSpeedMultiplier : 1);

      const desiredVx = Math.cos(bug.angle) * speed;
      const desiredVy = Math.sin(bug.angle) * speed;

      const accel = Math.min(1, dt * 9);
      bug.vx += (desiredVx - bug.vx) * accel;
      bug.vy += (desiredVy - bug.vy) * accel;

      bug.knockVx *= Math.pow(0.015, dt);
      bug.knockVy *= Math.pow(0.015, dt);

      bug.x += (bug.vx + bug.knockVx) * dt;
      bug.y += (bug.vy + bug.knockVy) * dt;

      this._resolveObstacleCollisionsForBug(bug);

      const effR = bug.getEffectiveRadius();
      const minX = world.borderPadding + effR;
      const maxX = world.width - world.borderPadding - effR;
      const minY = world.borderPadding + effR;
      const maxY = world.height - world.borderPadding - effR;

      if (bug.x < minX) {
        bug.x = minX;
        bug.vx = Math.abs(bug.vx) * 0.4;
      } else if (bug.x > maxX) {
        bug.x = maxX;
        bug.vx = -Math.abs(bug.vx) * 0.4;
      }
      if (bug.y < minY) {
        bug.y = minY;
        bug.vy = Math.abs(bug.vy) * 0.4;
      } else if (bug.y > maxY) {
        bug.y = maxY;
        bug.vy = -Math.abs(bug.vy) * 0.4;
      }

      const actualSpeed = Math.hypot(bug.vx, bug.vy);
      bug.walkPhase += (2.5 + actualSpeed * 0.08) * dt;
      bug.wingPhase += (10 + (bug.isBoosting ? 18 : actualSpeed * 0.04)) * dt;

      if (bug.isPlayer) {
        const hasFast = bug.hasEffect('faster');
        const hasStrong = bug.hasEffect('stronger') || bug.hasEffect('bigger');
        const hasSlow = bug.hasEffect('slower');
        if ((bug.isBoosting || hasFast || hasStrong || hasSlow) && Math.random() < (bug.isBoosting ? 0.65 : 0.25)) {
          const skin = Config.getSkinConfig(bug.skinId);
          const backX = bug.x - Math.cos(bug.angle) * (bug.visualRadius * 0.82);
          const backY = bug.y - Math.sin(bug.angle) * (bug.visualRadius * 0.82);
          const color = hasSlow
            ? '#c792ea'
            : hasFast
            ? '#8ce0ff'
            : hasStrong
            ? '#ffe066'
            : skin.palette.sparkle;
          this.particles.push(
            new Particle({
              x: backX + (Math.random() - 0.5) * 14,
              y: backY + (Math.random() - 0.5) * 14,
              vx: -Math.cos(bug.angle) * 35 + (Math.random() - 0.5) * 28,
              vy: -Math.sin(bug.angle) * 35 + (Math.random() - 0.5) * 28,
              size: 5 + Math.random() * 5,
              color,
              shape: hasSlow ? 'circle' : skin.features.type === 'kitty' || skin.features.type === 'bunny' ? 'heart' : 'star',
              life: 0.45 + Math.random() * 0.2,
            })
          );
        }
      }

      if (bug.isPlayer) {
        let danger = 0;
        if (!bug.inSanctuary && !bug.hasEffect('invisible')) {
          const effRank = bug.getEffectiveRank();
          for (let i = 0; i < this.bugs.length; i++) {
            const other = this.bugs[i];
            if (!other.isAlive || other.id === bug.id || other.rank <= effRank) continue;
            const dist = Math.hypot(other.x - bug.x, other.y - bug.y);
            const warnDist = 175 + other.radius + bug.visualRadius;
            if (dist < warnDist) {
              danger = Math.max(danger, 1 - dist / warnDist);
            }
          }
        }
        bug.scaredAmount += (danger - bug.scaredAmount) * Math.min(1, dt * 8);
      }
    }

    _resolveObstacleCollisionsForBug(bug) {
      const r = bug.getEffectiveRadius();

      // 1. Trees (trunk circle), Rocks (circle), and Ponds (ellipse)
      for (let i = 0; i < this.obstacles.length; i++) {
        const obs = this.obstacles[i];
        if (obs.type === 'pond') {
          const rx = obs.radius + r;
          const ry = obs.ry + r;
          const dx = bug.x - obs.x;
          const dy = bug.y - obs.y;
          const nx = dx / rx;
          const ny = dy / ry;
          const normSq = nx * nx + ny * ny;
          if (normSq < 1) {
            if (normSq < 0.000001) {
              bug.x = obs.x + rx;
            } else {
              const norm = Math.sqrt(normSq);
              bug.x = obs.x + (nx / norm) * rx;
              bug.y = obs.y + (ny / norm) * ry;
            }
          }
        } else {
          const dx = bug.x - obs.x;
          const dy = bug.y - obs.y;
          const minDist = obs.radius + r;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDist * minDist) {
            if (distSq < 0.000001) {
              bug.x = obs.x + minDist;
            } else {
              const dist = Math.sqrt(distSq);
              const overlap = minDist - dist;
              bug.x += (dx / dist) * overlap;
              bug.y += (dy / dist) * overlap;
            }
          }
        }
      }

      // 2. Fenced Sanctuary Walls (and keep AI bugs safely outside!)
      for (let i = 0; i < this.sanctuaries.length; i++) {
        const s = this.sanctuaries[i];

        if (!bug.isPlayer) {
          const halfW = s.width * 0.5 + r + 8;
          const halfH = s.height * 0.5 + r + 8;
          const dx = bug.x - s.x;
          const dy = bug.y - s.y;
          if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) {
            const penX = halfW - Math.abs(dx);
            const penY = halfH - Math.abs(dy);
            if (penX < penY) {
              bug.x = s.x + (dx >= 0 ? halfW : -halfW);
              bug.vx *= -0.35;
            } else {
              bug.y = s.y + (dy >= 0 ? halfH : -halfH);
              bug.vy *= -0.35;
            }
          }
          continue;
        }

        const segs = s.getWallSegments();
        for (let k = 0; k < segs.length; k++) {
          const seg = segs[k];
          const closestX = clamp(bug.x, seg.x, seg.x + seg.w);
          const closestY = clamp(bug.y, seg.y, seg.y + seg.h);
          const dx = bug.x - closestX;
          const dy = bug.y - closestY;
          const distSq = dx * dx + dy * dy;
          if (distSq < r * r) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.001) {
              const overlap = r - dist;
              bug.x += (dx / dist) * overlap;
              bug.y += (dy / dist) * overlap;
            } else {
              bug.y -= r * 0.5;
            }
          }
        }
      }
    }

    _resolveFoodCollisions() {
      const bugLen = this.bugs.length;
      const foodLen = this.foods.length;

      for (let i = 0; i < bugLen; i++) {
        const bug = this.bugs[i];
        if (!bug.isAlive) continue;
        const bugR = bug.getEffectiveRadius();

        for (let j = 0; j < foodLen; j++) {
          const food = this.foods[j];
          if (!food.isAlive) continue;

          if (!bug.isPlayer && food.special) continue;

          const dx = food.x - bug.x;
          const dy = food.y - bug.y;
          const eatDist = bugR + food.radius + (bug.isPlayer ? 4 : 0);
          if (dx * dx + dy * dy <= eatDist * eatDist) {
            this._eatFood(bug, food);
          }
        }
      }
    }

    _eatFood(bug, food) {
      food.isAlive = false;
      bug.points += food.points;
      bug.peakPoints = Math.max(bug.peakPoints, bug.points);
      bug.chompTimer = 0.24;
      bug.foodEaten += 1;

      const effectCfg = food.effectId ? Config.getEffectConfig(food.effectId) : null;
      if (effectCfg) {
        bug.addEffect(effectCfg.id, effectCfg.duration);
        if (effectCfg.kind === 'buff') {
          bug.celebrateTimer = 0.7;
        }
      }

      const burstShape = effectCfg ? (effectCfg.kind === 'buff' ? 'star' : 'circle') : 'circle';
      this._spawnBurst(food.x, food.y, food.color, bug.isPlayer ? (effectCfg ? 18 : 9) : 4, burstShape);

      if (bug.isPlayer) {
        if (effectCfg) {
          this._addFloatingText(
            food.x,
            food.y - 12,
            effectCfg.icon + ' ' + effectCfg.label + '! (+' + food.points + ')',
            effectCfg.color,
            1.12
          );
        } else {
          this._addFloatingText(food.x, food.y - 8, '+' + food.points + ' pts', '#2f805a', 0.95);
        }
        this.emit('eatFood', { bug, food, effect: effectCfg });
      }

      this._checkRankUp(bug);
      if (bug.isPlayer) {
        this._checkWinConditions();
      }
    }

    _resolveCollisions() {
      const len = this.bugs.length;
      for (let i = 0; i < len; i++) {
        const a = this.bugs[i];
        if (!a.isAlive) continue;

        for (let j = i + 1; j < len; j++) {
          const b = this.bugs[j];
          if (!b.isAlive) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDist = (a.getEffectiveRadius() + b.getEffectiveRadius()) * 0.86;
          const distSq = dx * dx + dy * dy;

          if (distSq >= minDist * minDist) continue;

          if (a.isPlayer || b.isPlayer) {
            const player = a.isPlayer ? a : b;
            const other = a.isPlayer ? b : a;
            this._handlePlayerCollision(player, other);
          } else {
            this._handleAICollision(a, b, dx, dy, Math.sqrt(distSq) || 1, minDist);
          }
        }
      }
    }

    _handlePlayerCollision(player, other) {
      if (!player.isAlive || !other.isAlive) return;

      const playerEffRank = player.getEffectiveRank();

      if (other.rank <= playerEffRank) {
        this._eatBug(player, other, 1);
        return;
      }

      if (player.hasEffect('invisible')) {
        return;
      }

      const pushAngle = Math.atan2(player.y - other.y, player.x - other.x);
      const minSep = player.getEffectiveRadius() + other.getEffectiveRadius() + 6;
      player.x = other.x + Math.cos(pushAngle) * minSep;
      player.y = other.y + Math.sin(pushAngle) * minSep;

      if (player.invulnTimer > 0) return;

      const rankDiff = other.rank - playerEffRank;
      let damage = 1;
      let label = 'Ouch! Too strong!';

      if (rankDiff === 1) {
        damage = 1;
        label = 'Ouch! Lv.' + other.rank + ' hurt you! -1 ♥';
      } else if (rankDiff === 2) {
        damage = 2;
        label = 'So strong! -2 ♥';
      } else if (rankDiff === 3) {
        damage = 3;
        label = 'Way too big! -3 ♥';
      } else {
        damage = player.hp;
        label = 'TOO POWERFUL!';
      }

      player.hp = Math.max(0, player.hp - damage);
      player.invulnTimer = Config.COMBAT.hurtInvulnSec;
      player.hurtFlashTimer = 0.45;
      player.timeSinceHurt = 0;
      player.regenTimer = 0;
      player.knockVx = Math.cos(pushAngle) * Config.COMBAT.knockbackSpeed;
      player.knockVy = Math.sin(pushAngle) * Config.COMBAT.knockbackSpeed;

      if (rankDiff === 1 && player.hp > 0) {
        other.hp -= 1;
        other.hurtFlashTimer = 0.35;
        other.knockVx = -Math.cos(pushAngle) * 200;
        other.knockVy = -Math.sin(pushAngle) * 200;
        if (other.hp <= 0) {
          this._eatBug(player, other, 1.45);
          this._addFloatingText(other.x, other.y - other.radius - 26, 'BRAVE CHOMP!', '#ff7aa2', 1.2);
        }
      }

      this.screenShake = Math.min(12, 4 + damage * 2.5);
      this._spawnBurst(player.x, player.y, '#ff85a1', 12, 'star');
      this._addFloatingText(player.x, player.y - player.visualRadius - 14, label, '#d63b64', 1.05);

      this.emit('playerHurt', {
        player,
        attacker: other,
        damage,
        rankDiff,
      });

      if (player.hp <= 0) {
        player.isAlive = false;
        this.state = 'gameover';
        this._spawnBurst(player.x, player.y, '#ffb3c6', 28, 'star');
        this.emit('gameOver', {
          player,
          attacker: other,
          summary: this.getRunSummary(false, false),
        });
      }
    }

    _handleAICollision(a, b, dx, dy, dist, minDist) {
      if (a.rank === b.rank) {
        const overlap = (minDist - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        return;
      }

      const predator = a.rank > b.rank ? a : b;
      const prey = a.rank > b.rank ? b : a;
      this._eatBug(predator, prey, 1);
    }

    _eatBug(eater, prey, bonusMultiplier) {
      prey.isAlive = false;
      this.ai.remove(prey.id);

      const preyRankCfg = Config.getRankConfig(prey.rank);
      const earned = Math.round(preyRankCfg.eatValue * (bonusMultiplier || 1));

      eater.points += earned;
      eater.peakPoints = Math.max(eater.peakPoints, eater.points);
      eater.chompTimer = 0.28;
      eater.bugsEaten += 1;

      const burstColor = prey.customTint ? prey.customTint.body : '#ffb3c6';
      this._spawnBurst(prey.x, prey.y, burstColor, eater.isPlayer ? 14 : 6, 'circle');

      if (eater.isPlayer) {
        this._addFloatingText(
          prey.x,
          prey.y - prey.radius,
          '+' + earned + ' pts',
          '#2e7d5b',
          1.0 + Math.min(0.35, prey.rank * 0.04)
        );
        this.emit('eat', { eater, prey, earned });
      }

      this._checkRankUp(eater);
      if (eater.isPlayer) {
        this._checkWinConditions();
      }
    }

    _checkRankUp(eater) {
      const maxAllowedRank = eater.isPlayer ? Config.MAX_RANK : Config.MAX_RANK - 1;
      while (eater.rank < maxAllowedRank) {
        const nextRankCfg = Config.getRankConfig(eater.rank + 1);
        if (eater.points >= nextRankCfg.pointsRequired) {
          eater.applyRankStats(eater.rank + 1);
          if (eater.isPlayer) {
            this._spawnBurst(eater.x, eater.y, '#ffe66d', 24, 'star');
            this._spawnBurst(eater.x, eater.y, nextRankCfg.bodyColor, 18, 'heart');
            this._addFloatingText(
              eater.x,
              eater.y - eater.visualRadius - 20,
              'RANK UP! Lv.' + eater.rank + ' ' + nextRankCfg.name,
              '#6d3b9e',
              1.25
            );
            this.emit('rankUp', { player: eater, rankConfig: nextRankCfg });
          } else {
            eater.customTint = {
              body: nextRankCfg.bodyColor,
              shell: nextRankCfg.accentColor,
              head: nextRankCfg.badgeBg,
            };
          }
        } else {
          break;
        }
      }
    }

    _checkWinConditions() {
      if (!this.player || this.state !== 'playing') return;

      const isMaxRank = this.player.rank >= Config.MAX_RANK;
      const hasAllSkins = this.player.ownedSkins.length >= Config.SKINS.length;

      const newlyMaxRank = isMaxRank && !this.achievedMaxRank;
      const newlyAllSkins = hasAllSkins && !this.achievedAllSkins;

      if (isMaxRank) this.achievedMaxRank = true;
      if (hasAllSkins) this.achievedAllSkins = true;

      if (this.achievedMaxRank && this.achievedAllSkins) {
        this.state = 'victory';
        this.lastVictoryType = 'ultimate';
        this._spawnVictoryConfetti();
        this.emit('victory', {
          type: 'ultimate',
          canContinueForUltimate: false,
          summary: this.getRunSummary(true, true),
        });
      } else if (!this.continuedAfterFirstWin && (newlyMaxRank || newlyAllSkins)) {
        this.state = 'victory';
        this.lastVictoryType = newlyMaxRank ? 'max_rank' : 'all_skins';
        this._spawnVictoryConfetti();
        this.emit('victory', {
          type: this.lastVictoryType,
          canContinueForUltimate: true,
          summary: this.getRunSummary(true, false),
        });
      }
    }

    _spawnVictoryConfetti() {
      if (!this.player) return;
      const colors = ['#ffb3c6', '#ffe08a', '#b8f2e6', '#d0b3ff', '#a8d8ff'];
      for (let i = 0; i < 5; i++) {
        this._spawnBurst(this.player.x, this.player.y, colors[i], 14, i % 2 === 0 ? 'star' : 'heart');
      }
    }

    _spawnBurst(x, y, color, count, shape) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 55 + Math.random() * 145;
        this.particles.push(
          new Particle({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 5 + Math.random() * 6,
            color,
            shape: shape || 'circle',
            life: 0.45 + Math.random() * 0.4,
          })
        );
      }
    }

    _addFloatingText(x, y, text, color, scale) {
      this.floatingTexts.push(
        new FloatingText({
          x,
          y,
          text,
          color,
          scale: scale || 1,
          life: 1.2,
        })
      );
    }

    _updateEffects(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.18, dt);
        p.vy *= Math.pow(0.18, dt);
        p.rotation += p.rotSpeed * dt;
      }

      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const t = this.floatingTexts[i];
        t.life -= dt;
        if (t.life <= 0) {
          this.floatingTexts.splice(i, 1);
          continue;
        }
        t.y += t.vy * dt;
        t.vy *= Math.pow(0.35, dt);
      }
    }

    getLeaderboard(limit) {
      const sorted = this.bugs
        .filter((b) => b.isAlive && b.rank >= 1)
        .slice()
        .sort((a, b) => {
          if (b.rank !== a.rank) return b.rank - a.rank;
          return b.points - a.points;
        });
      return sorted.slice(0, limit || 5);
    }

    getRunSummary(won, ultimate) {
      const p = this.player;
      return {
        won: !!won,
        ultimate: !!ultimate,
        name: p ? p.name : 'DeeBug',
        rank: p ? p.rank : 1,
        rankName: p ? Config.getRankConfig(p.rank).name : 'Baby Ladybug',
        points: p ? Math.floor(p.points) : 0,
        peakPoints: p ? Math.floor(p.peakPoints) : 0,
        bugsEaten: p ? p.bugsEaten : 0,
        foodEaten: p ? p.foodEaten : 0,
        skinsOwned: p ? p.ownedSkins.length : 1,
        totalSkins: Config.SKINS.length,
        elapsedSec: Math.floor(this.elapsedTime),
      };
    }

    getWorldSnapshot() {
      return {
        t: Math.round(this.elapsedTime * 1000),
        state: this.state,
        bugs: this.bugs.map((b) => b.toSnapshot()),
        foods: this.foods.map((f) => f.toSnapshot()),
        obstacles: this.obstacles.map((o) => o.toSnapshot()),
        sanctuaries: this.sanctuaries.map((s) => s.toSnapshot()),
      };
    }
  }

  DeeBug.GameEngine = GameEngine;
})(window);
