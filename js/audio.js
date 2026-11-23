/**
 * DeeBug — Cute Pastel Web Audio Synthesizer
 * Zero external audio files required; generates soft marimba/pop/sparkle sounds procedurally.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    setMuted(muted) {
      this.muted = !!muted;
    }

    unlock() {
      if (this.muted) return;
      try {
        if (!this.ctx) {
          const AudioCtx = global.AudioContext || global.webkitAudioContext;
          if (AudioCtx) {
            this.ctx = new AudioCtx();
          }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
      } catch (_err) {
        // Ignore audio restrictions silently
      }
    }

    _tone(freq, duration, type, volume, startDelay, slideToFreq) {
      if (this.muted || !this.ctx) return;
      try {
        const now = this.ctx.currentTime + (startDelay || 0);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.setValueAtTime(freq, now);
        if (slideToFreq) {
          osc.frequency.exponentialRampToValueAtTime(slideToFreq, now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(volume || 0.12, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
      } catch (_err) {
        // Safe fallback
      }
    }

    playEat(rankDiff) {
      this.unlock();
      const base = 440 + Math.min(6, Math.max(0, rankDiff || 0)) * 35;
      this._tone(base, 0.1, 'sine', 0.12, 0, base * 1.45);
      this._tone(base * 1.5, 0.12, 'triangle', 0.08, 0.04, base * 1.75);
    }

    /**
     * Distinct cute sounds for garden food (leaves, berries, fruits, mushrooms)
     * plus special power-up / silly debuff audio feedback.
     */
    playFood(kind, effectKind) {
      this.unlock();

      // Base food nibble sound tailored to food type
      if (kind === 'leaf') {
        // Crisp crunchy double-pip
        this._tone(740, 0.055, 'triangle', 0.08, 0, 520);
        this._tone(880, 0.06, 'triangle', 0.07, 0.045, 660);
      } else if (kind === 'berry') {
        // Juicy bubbly pop
        this._tone(520, 0.09, 'sine', 0.11, 0, 920);
      } else if (kind === 'fruit') {
        // Sweet bright chomp chime
        this._tone(587.33, 0.09, 'sine', 0.1, 0, 783.99);
        this._tone(880, 0.11, 'triangle', 0.08, 0.05, 1046.5);
      } else if (kind === 'mushroom') {
        // Cute bouncy mushroom boop
        this._tone(340, 0.11, 'sine', 0.11, 0, 620);
        this._tone(480, 0.09, 'triangle', 0.07, 0.06, 720);
      } else {
        this._tone(600, 0.08, 'sine', 0.1, 0, 840);
      }

      // Layer special power-up or silly debuff sting
      if (effectKind === 'buff') {
        const sparkle = [659.25, 880, 1174.66, 1318.5];
        sparkle.forEach((n, idx) => {
          this._tone(n, 0.18, 'triangle', 0.1, 0.06 + idx * 0.055);
        });
      } else if (effectKind === 'debuff') {
        // Playful cartoon descending wobble
        this._tone(460, 0.14, 'triangle', 0.1, 0.05, 310);
        this._tone(330, 0.18, 'sine', 0.1, 0.14, 210);
      }
    }

    playSanctuaryRest() {
      this.unlock();
      this._tone(523.25, 0.18, 'sine', 0.07, 0);
      this._tone(659.25, 0.22, 'sine', 0.07, 0.09);
    }

    playRankUp() {
      this.unlock();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        this._tone(n, 0.22, 'triangle', 0.13, idx * 0.07);
      });
    }

    playBuySkin() {
      this.unlock();
      const notes = [587.33, 739.99, 880, 1174.66];
      notes.forEach((n, idx) => {
        this._tone(n, 0.2, 'sine', 0.12, idx * 0.06);
      });
    }

    playEquip() {
      this.unlock();
      this._tone(660, 0.09, 'sine', 0.09, 0, 880);
    }

    playHurt() {
      this.unlock();
      this._tone(280, 0.18, 'sawtooth', 0.09, 0, 140);
      this._tone(210, 0.2, 'triangle', 0.1, 0.05, 110);
    }

    playDash() {
      this.unlock();
      this._tone(360, 0.12, 'sine', 0.06, 0, 620);
    }

    playVictory() {
      this.unlock();
      const melody = [523.25, 659.25, 783.99, 1046.5, 880, 1046.5, 1318.5];
      melody.forEach((n, idx) => {
        this._tone(n, 0.28, 'triangle', 0.13, idx * 0.095);
      });
    }

    playGameOver() {
      this.unlock();
      const notes = [440, 392, 349.23, 293.66];
      notes.forEach((n, idx) => {
        this._tone(n, 0.26, 'sine', 0.11, idx * 0.11);
      });
    }
  }

  DeeBug.Audio = new SoundEngine();
})(window);
