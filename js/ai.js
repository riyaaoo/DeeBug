/**
 * DeeBug — AI Brain Controller
 * Outputs the exact same InputIntent `{ targetAngle, throttle, boost }` contract
 * as local human inputs or future multiplayer remote player inputs.
 *
 * Respects invisible players, steers around ponds/trees/rocks, stays out of
 * fenced rest sanctuaries, and casually nibbles regular garden food.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const Config = DeeBug.Config;

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  class AIController {
    constructor() {
      this.brains = new Map();
    }

    reset() {
      this.brains.clear();
    }

    remove(bugId) {
      this.brains.delete(bugId);
    }

    _getBrain(bug) {
      let brain = this.brains.get(bug.id);
      if (!brain) {
        brain = {
          wanderAngle: bug.angle,
          decisionTimer: Math.random() * 1.2,
          dashCooldown: 1 + Math.random() * 3,
          orbitDir: Math.random() < 0.5 ? 1 : -1,
        };
        this.brains.set(bug.id, brain);
      }
      return brain;
    }

    /**
     * Compute steering intent for an AI bug given world state.
     * @returns {{ targetAngle: number, throttle: number, boost: boolean }}
     */
    computeIntent(bug, allBugs, dt, worldContext) {
      const brain = this._getBrain(bug);
      brain.decisionTimer -= dt;
      brain.dashCooldown = Math.max(0, brain.dashCooldown - dt);

      const world = Config.WORLD;
      const obstacles = (worldContext && worldContext.obstacles) || [];
      const sanctuaries = (worldContext && worldContext.sanctuaries) || [];
      const foods = (worldContext && worldContext.foods) || [];
      const visionRadius = 250 + bug.radius * 4.2;

      let closestThreat = null;
      let closestThreatDist = Infinity;
      let closestPrey = null;
      let closestPreyDist = Infinity;

      for (let i = 0; i < allBugs.length; i++) {
        const other = allBugs[i];
        if (!other.isAlive || other.id === bug.id) continue;

        // Invisible players cannot be spotted by AI bugs!
        if (other.isPlayer && other.hasEffect && other.hasEffect('invisible')) continue;
        // Players resting inside a safe sanctuary cannot be targeted!
        if (other.isPlayer && other.inSanctuary) continue;

        const dx = other.x - bug.x;
        const dy = other.y - bug.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > visionRadius * visionRadius) continue;

        const dist = Math.sqrt(distSq);
        const otherEffRank = other.getEffectiveRank ? other.getEffectiveRank() : other.rank;

        // Threat: any bug of higher effective rank
        const isThreat =
          otherEffRank > bug.rank ||
          (other.isPlayer && otherEffRank === bug.rank && bug.aiPersonality === 'timid');

        if (isThreat && dist < closestThreatDist) {
          closestThreat = other;
          closestThreatDist = dist;
        }

        // Prey: lower-rank bugs
        const isPrey =
          otherEffRank < bug.rank &&
          bug.rank > 0 &&
          (!other.isPlayer || bug.aiPersonality === 'hunter' || bug.rank <= otherEffRank + 2);

        if (isPrey && dist < closestPreyDist) {
          closestPrey = other;
          closestPreyDist = dist;
        }
      }

      // Also look for nearby regular food when wandering
      let closestFood = null;
      let closestFoodDist = 175 + bug.radius;
      if (!closestThreat && !closestPrey && foods.length > 0) {
        for (let i = 0; i < foods.length; i++) {
          const f = foods[i];
          if (!f.isAlive || f.special) continue;
          const dist = Math.hypot(f.x - bug.x, f.y - bug.y);
          if (dist < closestFoodDist) {
            closestFood = f;
            closestFoodDist = dist;
          }
        }
      }

      let targetAngle = brain.wanderAngle;
      let throttle = bug.rank === 0 ? 0.55 : 0.78;
      let boost = false;
      let scared = 0;

      // 1. Border avoidance takes top priority near garden edge
      const margin = world.borderPadding + bug.radius + 95;
      if (
        bug.x < margin ||
        bug.x > world.width - margin ||
        bug.y < margin ||
        bug.y > world.height - margin
      ) {
        const cx = world.width * 0.5;
        const cy = world.height * 0.5;
        targetAngle = Math.atan2(cy - bug.y, cx - bug.x);
        brain.wanderAngle = targetAngle;
        throttle = 0.85;
      } else if (closestThreat && closestThreatDist < 220 + closestThreat.radius * 2) {
        // 2. Flee from bigger/stronger bugs!
        const away = Math.atan2(bug.y - closestThreat.y, bug.x - closestThreat.x);
        targetAngle = away + brain.orbitDir * 0.22;
        brain.wanderAngle = targetAngle;
        throttle = 1;
        scared = 1 - Math.min(1, closestThreatDist / (240 + closestThreat.radius * 2));
        if (closestThreatDist < 120 + closestThreat.radius && brain.dashCooldown <= 0 && bug.boostEnergy > 45) {
          boost = true;
          brain.dashCooldown = 2.6;
        }
      } else if (closestPrey && bug.aiPersonality !== 'timid') {
        // 3. Chase tasty smaller bug
        const chaseAngle = Math.atan2(closestPrey.y - bug.y, closestPrey.x - bug.x);
        targetAngle = chaseAngle;
        brain.wanderAngle = targetAngle;
        throttle = bug.aiPersonality === 'hunter' ? 0.96 : 0.84;
        if (
          bug.aiPersonality === 'hunter' &&
          closestPreyDist < 170 + bug.radius &&
          brain.dashCooldown <= 0 &&
          bug.boostEnergy > 55 &&
          !closestPrey.isPlayer
        ) {
          boost = true;
          brain.dashCooldown = 3.5;
        }
      } else if (closestFood) {
        targetAngle = Math.atan2(closestFood.y - bug.y, closestFood.x - bug.x);
        brain.wanderAngle = targetAngle;
        throttle = 0.72;
      } else {
        // 4. Gentle curved wandering
        if (brain.decisionTimer <= 0) {
          brain.decisionTimer = 0.9 + Math.random() * 2.1;
          brain.wanderAngle = normalizeAngle(bug.angle + (Math.random() - 0.5) * 1.7);
          if (Math.random() < 0.25) brain.orbitDir *= -1;
        }
        targetAngle = brain.wanderAngle;
        throttle = bug.rank === 0 ? 0.45 : 0.68;
      }

      // 5. Steer smoothly around immovable obstacles (ponds, trees, rocks) & fenced sanctuaries
      let repulseX = 0;
      let repulseY = 0;

      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        const dx = bug.x - obs.x;
        const dy = bug.y - obs.y;
        const approxR = Math.max(obs.radius, obs.ry) + bug.radius + 58;
        const distSq = dx * dx + dy * dy;
        if (distSq < approxR * approxR && distSq > 1) {
          const dist = Math.sqrt(distSq);
          const strength = (approxR - dist) / approxR;
          repulseX += (dx / dist) * strength * 2.2;
          repulseY += (dy / dist) * strength * 2.2;
        }
      }

      for (let i = 0; i < sanctuaries.length; i++) {
        const s = sanctuaries[i];
        const pad = bug.radius + 52;
        if (s.containsPoint(bug.x, bug.y, pad)) {
          const dx = bug.x - s.x;
          const dy = bug.y - s.y;
          const dist = Math.hypot(dx, dy) || 1;
          repulseX += (dx / dist) * 2.8;
          repulseY += (dy / dist) * 2.8;
        }
      }

      if (repulseX !== 0 || repulseY !== 0) {
        const desiredX = Math.cos(targetAngle) + repulseX;
        const desiredY = Math.sin(targetAngle) + repulseY;
        targetAngle = Math.atan2(desiredY, desiredX);
        brain.wanderAngle = targetAngle;
      }

      bug.scaredAmount += (scared - bug.scaredAmount) * Math.min(1, dt * 8);

      return { targetAngle, throttle, boost };
    }
  }

  DeeBug.AIController = AIController;
})(window);
