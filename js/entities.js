/**
 * DeeBug — Entity Models & State Serialization
 * Designed with explicit entityId, ownerId, and snapshot serialization so a future
 * multiplayer backend can replicate bugs cleanly over WebSockets.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const Config = DeeBug.Config;

  let nextEntityId = 1;

  function generateEntityId(prefix) {
    return (prefix || 'bug') + '_' + nextEntityId++;
  }

  class BugEntity {
    constructor(options) {
      const opts = options || {};
      const rankCfg = Config.getRankConfig(opts.rank !== undefined ? opts.rank : 1);

      this.id = opts.id || generateEntityId(opts.isPlayer ? 'player' : 'ai');
      this.ownerId = opts.ownerId || (opts.isPlayer ? 'local_player' : 'ai_bot');
      this.isPlayer = !!opts.isPlayer;
      this.name = opts.name || rankCfg.name;

      // Spatial transform
      this.x = opts.x || 0;
      this.y = opts.y || 0;
      this.vx = 0;
      this.vy = 0;
      this.knockVx = 0;
      this.knockVy = 0;
      this.angle = opts.angle !== undefined ? opts.angle : Math.random() * Math.PI * 2;
      this.targetAngle = this.angle;
      this.angularVel = 0;

      // Progression & size
      this.rank = rankCfg.rank;
      this.points = opts.points !== undefined ? opts.points : rankCfg.pointsRequired;
      this.peakPoints = this.points;
      this.radius = rankCfg.radius;
      this.visualRadius = rankCfg.radius; // smoothly lerped when ranking up

      // Health & boost
      this.maxHp = rankCfg.maxHp;
      this.hp = rankCfg.maxHp;
      this.invulnTimer = 0;
      this.hurtFlashTimer = 0;
      this.timeSinceHurt = 99;
      this.regenTimer = 0;

      this.boostEnergy = 100;
      this.isBoosting = false;
      this.isAlive = true;

      // Cosmetics & expression
      this.skinId = opts.skinId || 'classic';
      this.ownedSkins = opts.ownedSkins ? opts.ownedSkins.slice() : ['classic'];
      this.customTint = opts.customTint || null; // AI bugs use rank pastel colors unless skinned
      this.aiPersonality = opts.aiPersonality || 'wanderer';

      // Animation timers
      this.walkPhase = Math.random() * Math.PI * 2;
      this.wingPhase = Math.random() * Math.PI * 2;
      this.blinkTimer = 1.5 + Math.random() * 3.5;
      this.isBlinking = false;
      this.chompTimer = 0;
      this.celebrateTimer = 0;
      this.scaredAmount = 0;
      this.bugsEaten = 0;
      this.foodEaten = 0;

      // Active temporary status effects: Map<effectId, { remaining, duration }>
      this.activeEffects = {};
      this.inSanctuary = false;
      this.sanctuaryHealTimer = 0;
    }

    hasEffect(effectId) {
      return !!(this.activeEffects[effectId] && this.activeEffects[effectId].remaining > 0);
    }

    addEffect(effectId, duration) {
      const cfg = Config.getEffectConfig(effectId);
      const dur = duration || (cfg ? cfg.duration : 6);
      // Cancel direct opposites cleanly so feelings stay intuitive
      const opposites = {
        bigger: 'smaller',
        smaller: 'bigger',
        faster: 'slower',
        slower: 'faster',
        stronger: 'weaker',
        weaker: 'stronger',
      };
      if (opposites[effectId]) {
        delete this.activeEffects[opposites[effectId]];
      }
      this.activeEffects[effectId] = { remaining: dur, duration: dur };
    }

    tickEffects(dt) {
      const keys = Object.keys(this.activeEffects);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        this.activeEffects[k].remaining -= dt;
        if (this.activeEffects[k].remaining <= 0) {
          delete this.activeEffects[k];
        }
      }
    }

    getSizeMultiplier() {
      let mult = 1;
      if (this.hasEffect('bigger')) mult *= Config.EFFECTS.bigger.sizeMultiplier;
      if (this.hasEffect('smaller')) mult *= Config.EFFECTS.smaller.sizeMultiplier;
      return mult;
    }

    getSpeedMultiplier() {
      let mult = 1;
      if (this.hasEffect('faster')) mult *= Config.EFFECTS.faster.speedMultiplier;
      if (this.hasEffect('slower')) mult *= Config.EFFECTS.slower.speedMultiplier;
      return mult;
    }

    getEffectiveRank() {
      let bonus = 0;
      if (this.hasEffect('stronger')) bonus += Config.EFFECTS.stronger.rankBonus;
      if (this.hasEffect('bigger')) bonus += Config.EFFECTS.bigger.rankBonus;
      if (this.hasEffect('weaker')) bonus += Config.EFFECTS.weaker.rankBonus;
      if (this.hasEffect('smaller')) bonus += Config.EFFECTS.smaller.rankBonus;
      return Math.max(0, Math.min(Config.MAX_RANK + 2, this.rank + bonus));
    }

    getEffectiveRadius() {
      return this.radius * this.getSizeMultiplier();
    }

    applyRankStats(newRank) {
      const cfg = Config.getRankConfig(newRank);
      const hpGain = Math.max(0, cfg.maxHp - this.maxHp);
      this.rank = cfg.rank;
      this.radius = cfg.radius;
      this.maxHp = cfg.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + hpGain + 1);
      this.celebrateTimer = 1.1;
    }

    /**
     * Compact snapshot for future multiplayer state sync.
     */
    toSnapshot() {
      return {
        id: this.id,
        ownerId: this.ownerId,
        isPlayer: this.isPlayer,
        name: this.name,
        x: Math.round(this.x * 10) / 10,
        y: Math.round(this.y * 10) / 10,
        angle: Math.round(this.angle * 1000) / 1000,
        rank: this.rank,
        points: Math.floor(this.points),
        hp: this.hp,
        maxHp: this.maxHp,
        skinId: this.skinId,
        isBoosting: this.isBoosting,
        isAlive: this.isAlive,
      };
    }
  }

  class Particle {
    constructor(opts) {
      this.x = opts.x;
      this.y = opts.y;
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.size = opts.size || 6;
      this.color = opts.color || '#ffb3c6';
      this.shape = opts.shape || 'circle'; // circle | star | heart | ring
      this.life = opts.life || 0.6;
      this.maxLife = this.life;
      this.rotation = Math.random() * Math.PI * 2;
      this.rotSpeed = (Math.random() - 0.5) * 6;
    }
  }

  class FloatingText {
    constructor(opts) {
      this.x = opts.x;
      this.y = opts.y;
      this.text = opts.text;
      this.color = opts.color || '#5e4b56';
      this.bg = opts.bg || null;
      this.scale = opts.scale || 1;
      this.life = opts.life || 1.1;
      this.maxLife = this.life;
      this.vy = opts.vy || -46;
    }
  }

  class FoodItem {
    constructor(opts) {
      const cfg = Config.getFoodType(opts.typeId);
      this.id = opts.id || generateEntityId('food');
      this.typeId = cfg.id;
      this.kind = cfg.kind; // leaf | berry | fruit | mushroom
      this.name = cfg.name;
      this.x = opts.x;
      this.y = opts.y;
      this.radius = cfg.radius;
      this.points = cfg.points;
      this.color = cfg.color;
      this.accent = cfg.accent;
      this.effectId = cfg.effectId;
      this.special = !!cfg.special;
      this.bobPhase = Math.random() * Math.PI * 2;
      this.rotation = (Math.random() - 0.5) * 0.8;
      this.isAlive = true;
    }

    toSnapshot() {
      return {
        id: this.id,
        typeId: this.typeId,
        x: Math.round(this.x),
        y: Math.round(this.y),
      };
    }
  }

  /**
   * Immovable garden obstacle: tree (trunk solid + leafy canopy), pond (oval), or rock (circle cluster).
   */
  class WorldObstacle {
    constructor(opts) {
      this.id = opts.id || generateEntityId(opts.type || 'obs');
      this.type = opts.type; // tree | pond | rock
      this.x = opts.x;
      this.y = opts.y;
      this.radius = opts.radius || 46; // Solid collision radius (or rx for pond)
      this.ry = opts.ry || this.radius; // Pond vertical radius
      this.canopyRadius = opts.canopyRadius || this.radius * 2.1; // Tree canopy visual radius
      this.rotation = opts.rotation || 0;
      this.variant = opts.variant || 0;
      this.seed = opts.seed || Math.random();
    }

    toSnapshot() {
      return {
        id: this.id,
        type: this.type,
        x: Math.round(this.x),
        y: Math.round(this.y),
        radius: Math.round(this.radius),
        ry: Math.round(this.ry),
      };
    }
  }

  /**
   * Cozy fenced rest/escape sanctuary with open doorways.
   * Player can slip inside to rest, heal faster, and escape bigger bugs.
   */
  class SanctuaryZone {
    constructor(opts) {
      this.id = opts.id || generateEntityId('sanctuary');
      this.x = opts.x; // Center X
      this.y = opts.y; // Center Y
      this.width = opts.width || 270;
      this.height = opts.height || 230;
      this.gateWidth = opts.gateWidth || 92;
      this.wallThickness = 14;
      // Two cozy opposite gates (either top+bottom or left+right) for easy entry/escape
      this.gates = opts.gates || ['bottom', 'top'];
    }

    containsPoint(px, py, pad) {
      const p = pad || 0;
      return (
        px >= this.x - this.width * 0.5 - p &&
        px <= this.x + this.width * 0.5 + p &&
        py >= this.y - this.height * 0.5 - p &&
        py <= this.y + this.height * 0.5 + p
      );
    }

    /**
     * Returns solid fence segments as axis-aligned rectangles { x, y, w, h } (top-left origin).
     */
    getWallSegments() {
      const left = this.x - this.width * 0.5;
      const right = this.x + this.width * 0.5;
      const top = this.y - this.height * 0.5;
      const bottom = this.y + this.height * 0.5;
      const t = this.wallThickness;
      const gw = this.gateWidth;
      const segs = [];

      // Top wall
      if (this.gates.includes('top')) {
        const sideW = (this.width - gw) * 0.5;
        segs.push({ x: left, y: top - t * 0.5, w: sideW, h: t });
        segs.push({ x: right - sideW, y: top - t * 0.5, w: sideW, h: t });
      } else {
        segs.push({ x: left, y: top - t * 0.5, w: this.width, h: t });
      }

      // Bottom wall
      if (this.gates.includes('bottom')) {
        const sideW = (this.width - gw) * 0.5;
        segs.push({ x: left, y: bottom - t * 0.5, w: sideW, h: t });
        segs.push({ x: right - sideW, y: bottom - t * 0.5, w: sideW, h: t });
      } else {
        segs.push({ x: left, y: bottom - t * 0.5, w: this.width, h: t });
      }

      // Left wall
      if (this.gates.includes('left')) {
        const sideH = (this.height - gw) * 0.5;
        segs.push({ x: left - t * 0.5, y: top, w: t, h: sideH });
        segs.push({ x: left - t * 0.5, y: bottom - sideH, w: t, h: sideH });
      } else {
        segs.push({ x: left - t * 0.5, y: top, w: t, h: this.height });
      }

      // Right wall
      if (this.gates.includes('right')) {
        const sideH = (this.height - gw) * 0.5;
        segs.push({ x: right - t * 0.5, y: top, w: t, h: sideH });
        segs.push({ x: right - t * 0.5, y: bottom - sideH, w: t, h: sideH });
      } else {
        segs.push({ x: right - t * 0.5, y: top, w: t, h: this.height });
      }

      return segs;
    }

    toSnapshot() {
      return {
        id: this.id,
        x: Math.round(this.x),
        y: Math.round(this.y),
        width: this.width,
        height: this.height,
        gates: this.gates,
      };
    }
  }

  DeeBug.Entities = {
    BugEntity,
    FoodItem,
    WorldObstacle,
    SanctuaryZone,
    Particle,
    FloatingText,
    generateEntityId,
  };
})(window);
