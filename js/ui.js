/**
 * DeeBug — UI Controller (HUD, Skin Shop with Live Previews, Leaderboard, Modals)
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const Config = DeeBug.Config;

  class UIController {
    constructor(engine, renderer, input, storage, audio) {
      this.engine = engine;
      this.renderer = renderer;
      this.input = input;
      this.storage = storage;
      this.audio = audio;

      this.shopOpen = false;
      this.skinPreviewCanvases = [];
      this.toastTimeout = null;

      this._cacheElements();
      this._buildSkinShopCards();
      this._bindUIEvents();
      this._bindEngineEvents();
      this._loadSavedProfile();
    }

    _cacheElements() {
      const $ = (id) => document.getElementById(id);
      this.el = {
        // Screens & overlays
        startOverlay: $('start-overlay'),
        shopModal: $('shop-modal'),
        resultModal: $('result-modal'),
        hud: $('hud'),
        touchControls: $('touch-controls'),

        // Start screen
        nameInput: $('player-name-input'),
        startBtn: $('start-btn'),
        startBestStats: $('start-best-stats'),
        heroPreviewCanvas: $('hero-preview-canvas'),

        // HUD top-left (Rank, Points, Hearts, Boost)
        hudRankPill: $('hud-rank-pill'),
        hudRankName: $('hud-rank-name'),
        hudPoints: $('hud-points'),
        hudProgressFill: $('hud-progress-fill'),
        hudProgressText: $('hud-progress-text'),
        hudHearts: $('hud-hearts'),
        hudBoostFill: $('hud-boost-fill'),
        hudEffectsRow: $('hud-effects-row'),

        // HUD top-right (Skins button, Audio, Pause, Leaderboard)
        shopBtn: $('shop-btn'),
        shopBtnCount: $('shop-btn-count'),
        shopAffordableDot: $('shop-affordable-dot'),
        muteBtn: $('mute-btn'),
        leaderboardList: $('leaderboard-list'),

        // Touch controls
        dashBtn: $('touch-dash-btn'),
        touchShopBtn: $('touch-shop-btn'),

        // Skin shop modal
        shopPointsValue: $('shop-points-value'),
        shopGrid: $('shop-grid'),
        shopCloseBtn: $('shop-close-btn'),
        shopOwnedLabel: $('shop-owned-label'),

        // Result modal (Victory / Game Over)
        resultBadge: $('result-badge'),
        resultTitle: $('result-title'),
        resultSubtitle: $('result-subtitle'),
        resultStatsGrid: $('result-stats-grid'),
        resultContinueBtn: $('result-continue-btn'),
        resultRestartBtn: $('result-restart-btn'),
        resultPreviewCanvas: $('result-preview-canvas'),

        // Toast banner
        toastBanner: $('toast-banner'),
      };
    }

    _loadSavedProfile() {
      const settings = this.storage.loadSettings();
      const stats = this.storage.loadStats();

      if (this.el.nameInput) {
        this.el.nameInput.value = settings.playerName || 'DeeBug';
      }
      this.audio.setMuted(settings.muted);
      this._updateMuteIcon(settings.muted);
      this._renderStartStats(stats);
    }

    _renderStartStats(stats) {
      if (!this.el.startBestStats) return;
      if (stats.totalBugsEaten === 0 && stats.victories === 0) {
        this.el.startBestStats.hidden = true;
        return;
      }
      this.el.startBestStats.hidden = false;
      this.el.startBestStats.innerHTML =
        '<span>Best Rank: <strong>Lv.' +
        stats.highestRank +
        '</strong></span>' +
        '<span>Best Points: <strong>' +
        stats.bestPoints +
        '</strong></span>' +
        '<span>Victories: <strong>' +
        stats.victories +
        '</strong></span>';
    }

    _buildSkinShopCards() {
      const grid = this.el.shopGrid;
      if (!grid) return;
      grid.innerHTML = '';
      this.skinPreviewCanvases = [];

      Config.SKINS.forEach((skin) => {
        const card = document.createElement('div');
        card.className = 'skin-card';
        card.dataset.skinId = skin.id;

        const canvas = document.createElement('canvas');
        canvas.className = 'skin-preview-canvas';
        canvas.width = 160;
        canvas.height = 140;
        this.skinPreviewCanvases.push({ canvas, skinId: skin.id });

        const tag = document.createElement('span');
        tag.className = 'skin-tag';
        tag.textContent = skin.tag;

        const title = document.createElement('h3');
        title.className = 'skin-name';
        title.textContent = skin.name;

        const desc = document.createElement('p');
        desc.className = 'skin-desc';
        desc.textContent = skin.description;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skin-action-btn';
        btn.dataset.skinId = skin.id;
        btn.addEventListener('click', () => this._onSkinCardClick(skin.id));

        card.appendChild(tag);
        card.appendChild(canvas);
        card.appendChild(title);
        card.appendChild(desc);
        card.appendChild(btn);
        grid.appendChild(card);
      });
    }

    _bindUIEvents() {
      this.el.startBtn.addEventListener('click', () => {
        this.audio.unlock();
        const name = (this.el.nameInput.value || 'DeeBug').trim() || 'DeeBug';
        this.storage.saveSettings({ playerName: name });
        this.el.startOverlay.classList.add('hidden');
        this.el.hud.classList.remove('hidden');
        this.el.touchControls.classList.remove('hidden');
        this.engine.startNewGame(name);
      });

      this.el.nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.el.startBtn.click();
        }
      });

      this.el.shopBtn.addEventListener('click', () => this.toggleShop());
      this.el.touchShopBtn.addEventListener('click', () => this.toggleShop());
      this.el.shopCloseBtn.addEventListener('click', () => this.closeShop());

      // Click backdrop to close shop
      this.el.shopModal.addEventListener('click', (e) => {
        if (e.target === this.el.shopModal) this.closeShop();
      });

      this.el.muteBtn.addEventListener('click', () => {
        const nextMuted = !this.audio.muted;
        this.audio.setMuted(nextMuted);
        if (!nextMuted) this.audio.unlock();
        this.storage.saveSettings({ muted: nextMuted });
        this._updateMuteIcon(nextMuted);
      });

      // Touch Dash button (pointer & touch friendly)
      const dashStart = (e) => {
        e.preventDefault();
        this.audio.unlock();
        this.input.setUiBoost(true);
        this.el.dashBtn.classList.add('active');
      };
      const dashEnd = (e) => {
        e.preventDefault();
        this.input.setUiBoost(false);
        this.el.dashBtn.classList.remove('active');
      };
      this.el.dashBtn.addEventListener('touchstart', dashStart, { passive: false });
      this.el.dashBtn.addEventListener('touchend', dashEnd, { passive: false });
      this.el.dashBtn.addEventListener('touchcancel', dashEnd, { passive: false });
      this.el.dashBtn.addEventListener('mousedown', dashStart);
      global.addEventListener('mouseup', () => {
        this.input.setUiBoost(false);
        this.el.dashBtn.classList.remove('active');
      });

      // Result modal buttons
      this.el.resultContinueBtn.addEventListener('click', () => {
        this.el.resultModal.classList.add('hidden');
        this.engine.continueAfterVictory();
        this.showToast('Keep going for Ultimate 100% Champion!');
      });

      this.el.resultRestartBtn.addEventListener('click', () => {
        this.el.resultModal.classList.add('hidden');
        const name = (this.el.nameInput.value || 'DeeBug').trim() || 'DeeBug';
        this.engine.startNewGame(name);
      });

      // Keyboard shortcuts: B / Tab for Skin Shop, Esc to close shop
      global.addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'INPUT') return;
        if (this.engine.state === 'playing' || this.engine.state === 'paused') {
          if (e.code === 'KeyB' || e.code === 'Tab') {
            e.preventDefault();
            this.toggleShop();
          } else if (e.code === 'Escape' && this.shopOpen) {
            this.closeShop();
          }
        }
      });
    }

    _bindEngineEvents() {
      this.engine.on('eat', ({ eater, prey }) => {
        this.audio.playEat(eater.rank - prey.rank);
      });

      this.engine.on('eatFood', ({ food, effect }) => {
        this.audio.playFood(food.kind, effect ? effect.kind : null);
        if (effect) {
          this.showToast(
            effect.icon + ' ' + effect.label + ' for ' + Math.round(effect.duration) + 's!',
            effect.kind === 'debuff' ? 'danger' : ''
          );
        }
      });

      this.engine.on('sanctuaryEnter', () => {
        this.audio.playSanctuaryRest();
        this.showToast('🏡 Safe Rest Area — bigger bugs stay out & hearts heal fast!');
      });

      this.engine.on('dash', () => {
        this.audio.playDash();
      });

      this.engine.on('rankUp', ({ player, rankConfig }) => {
        this.audio.playRankUp();
        this.showToast('Rank Up! Lv.' + player.rank + ' ' + rankConfig.name + '!');
      });

      this.engine.on('playerHurt', ({ attacker, rankDiff }) => {
        this.audio.playHurt();
        if (rankDiff >= 2) {
          this.showToast('Watch out! Lv.' + attacker.rank + ' is much stronger!', 'danger');
        }
      });

      this.engine.on('skinBought', ({ skin }) => {
        this.audio.playBuySkin();
        this._refreshShopUI();
        this.showToast('Unlocked ' + skin.name + '! (-' + skin.cost + ' pts)');
      });

      this.engine.on('skinEquipped', ({ skin }) => {
        this.audio.playEquip();
        this._refreshShopUI();
        this.showToast('Wearing ' + skin.name + '!');
      });

      this.engine.on('victory', (payload) => {
        this.closeShop(true);
        this.audio.playVictory();
        const updatedStats = this.storage.recordRun(payload.summary);
        this._renderStartStats(updatedStats);
        this._showResultModal(true, payload);
      });

      this.engine.on('gameOver', (payload) => {
        this.closeShop(true);
        this.audio.playGameOver();
        const updatedStats = this.storage.recordRun(payload.summary);
        this._renderStartStats(updatedStats);
        this._showResultModal(false, payload);
      });
    }

    toggleShop() {
      if (this.shopOpen) {
        this.closeShop();
      } else {
        this.openShop();
      }
    }

    openShop() {
      if (this.engine.state !== 'playing') return;
      this.shopOpen = true;
      this.engine.setPaused(true);
      this._refreshShopUI();
      this.el.shopModal.classList.remove('hidden');
    }

    closeShop(keepState) {
      if (!this.shopOpen) return;
      this.shopOpen = false;
      this.el.shopModal.classList.add('hidden');
      if (!keepState && this.engine.state === 'paused') {
        this.engine.setPaused(false);
      }
    }

    _onSkinCardClick(skinId) {
      const res = this.engine.buyOrEquipSkin(skinId);
      if (!res.ok && res.reason === 'insufficient_points') {
        this.showToast('Need ' + res.needed + ' more points to unlock!', 'danger');
      }
    }

    _refreshShopUI() {
      const p = this.engine.player;
      if (!p) return;

      this.el.shopPointsValue.textContent = Math.floor(p.points) + ' pts';
      this.el.shopOwnedLabel.textContent = p.ownedSkins.length + ' / ' + Config.SKINS.length + ' Skins';

      const cards = this.el.shopGrid.querySelectorAll('.skin-card');
      cards.forEach((card) => {
        const id = card.dataset.skinId;
        const skin = Config.getSkinConfig(id);
        const owned = p.ownedSkins.includes(id);
        const equipped = p.skinId === id;
        const canAfford = p.points >= skin.cost;

        card.classList.toggle('owned', owned);
        card.classList.toggle('equipped', equipped);
        card.classList.toggle('affordable', !owned && canAfford);

        const btn = card.querySelector('.skin-action-btn');
        if (equipped) {
          btn.textContent = 'Wearing ✓';
          btn.disabled = false;
          btn.className = 'skin-action-btn is-equipped';
        } else if (owned) {
          btn.textContent = 'Wear Skin';
          btn.disabled = false;
          btn.className = 'skin-action-btn is-owned';
        } else if (canAfford) {
          btn.textContent = 'Trade ' + skin.cost + ' pts';
          btn.disabled = false;
          btn.className = 'skin-action-btn is-buyable';
        } else {
          btn.textContent = skin.cost + ' pts';
          btn.disabled = true;
          btn.className = 'skin-action-btn is-locked';
        }
      });
    }

    _showResultModal(won, payload) {
      const summary = payload.summary;
      this.el.resultModal.classList.remove('hidden');

      if (won) {
        if (payload.type === 'ultimate') {
          this.el.resultBadge.textContent = '👑 ULTIMATE DEEBUG CHAMPION!';
          this.el.resultBadge.className = 'result-badge badge-gold';
          this.el.resultTitle.textContent = 'You Did EVERYTHING!';
          this.el.resultSubtitle.textContent =
            summary.name + ' became the Most Powerful Pastel Monarch AND collected every single cute skin!';
        } else if (payload.type === 'max_rank') {
          this.el.resultBadge.textContent = '👑 MOST POWERFUL BUG!';
          this.el.resultBadge.className = 'result-badge badge-gold';
          this.el.resultTitle.textContent = 'You Rule the Garden!';
          this.el.resultSubtitle.textContent =
            summary.name + ' reached Max Rank (Lv.' + Config.MAX_RANK + ' Pastel Monarch)! Keep playing to collect all skins too, or start fresh!';
        } else {
          this.el.resultBadge.textContent = '✨ ALL SKINS COLLECTED!';
          this.el.resultBadge.className = 'result-badge badge-lilac';
          this.el.resultTitle.textContent = 'Cutest Bug Wardrobe Ever!';
          this.el.resultSubtitle.textContent =
            summary.name + ' unlocked all ' + summary.totalSkins + ' cute skins! Keep going to reach Max Rank Lv.' + Config.MAX_RANK + ', or start a new garden!';
        }
        this.el.resultContinueBtn.hidden = !payload.canContinueForUltimate;
      } else {
        const attacker = payload.attacker;
        this.el.resultBadge.textContent = '💫 OUCH! TOO STRONG!';
        this.el.resultBadge.className = 'result-badge badge-coral';
        this.el.resultTitle.textContent = 'Good Try, ' + summary.name + '!';
        this.el.resultSubtitle.textContent = attacker
          ? 'A bigger Lv.' + attacker.rank + ' bug bumped you out! Eat smaller bugs first to grow stronger.'
          : 'You got bumped out by a bigger bug! Ready to try again?';
        this.el.resultContinueBtn.hidden = true;
      }

      this.el.resultStatsGrid.innerHTML =
        '<div class="stat-box"><span class="stat-label">Rank Reached</span><span class="stat-val">Lv.' +
        summary.rank +
        '</span></div>' +
        '<div class="stat-box"><span class="stat-label">Bugs Eaten</span><span class="stat-val">' +
        summary.bugsEaten +
        '</span></div>' +
        '<div class="stat-box"><span class="stat-label">Skins Unlocked</span><span class="stat-val">' +
        summary.skinsOwned +
        ' / ' +
        summary.totalSkins +
        '</span></div>' +
        '<div class="stat-box"><span class="stat-label">Peak Points</span><span class="stat-val">' +
        summary.peakPoints +
        '</span></div>';
    }

    _updateMuteIcon(muted) {
      this.el.muteBtn.textContent = muted ? '🔇' : '🔊';
      this.el.muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
    }

    showToast(message, variant) {
      const el = this.el.toastBanner;
      if (!el) return;
      el.textContent = message;
      el.className = 'toast-banner show' + (variant ? ' toast-' + variant : '');
      clearTimeout(this.toastTimeout);
      this.toastTimeout = setTimeout(() => {
        el.classList.remove('show');
      }, 2400);
    }

    /**
     * Called once per animation frame to keep HUD & live skin previews smoothly updated.
     */
    update(time) {
      // Animate start screen hero preview (cycles cute skins gently!)
      if (!this.el.startOverlay.classList.contains('hidden') && this.el.heroPreviewCanvas) {
        const cycleIdx = Math.floor(time / 2.6) % Config.SKINS.length;
        this.renderer.renderSkinPreview(this.el.heroPreviewCanvas, Config.SKINS[cycleIdx].id, time);
      }

      // Animate result screen preview with player's current skin
      if (!this.el.resultModal.classList.contains('hidden') && this.el.resultPreviewCanvas && this.engine.player) {
        this.renderer.renderSkinPreview(this.el.resultPreviewCanvas, this.engine.player.skinId, time);
      }

      // Animate all Skin Shop live previews when shop is open
      if (this.shopOpen) {
        for (let i = 0; i < this.skinPreviewCanvases.length; i++) {
          const item = this.skinPreviewCanvases[i];
          this.renderer.renderSkinPreview(item.canvas, item.skinId, time);
        }
      }

      const p = this.engine.player;
      if (!p) return;

      const rankCfg = Config.getRankConfig(p.rank);
      this.el.hudRankPill.textContent = 'Lv.' + p.rank;
      this.el.hudRankPill.style.background = rankCfg.badgeBg;
      this.el.hudRankPill.style.color = rankCfg.badgeText;
      this.el.hudRankName.textContent = rankCfg.name;
      this.el.hudPoints.textContent = Math.floor(p.points) + ' pts';

      // Progress bar toward next rank
      if (p.rank >= Config.MAX_RANK) {
        this.el.hudProgressFill.style.width = '100%';
        this.el.hudProgressText.textContent = 'MAX RANK 👑';
      } else {
        const nextCfg = Config.getRankConfig(p.rank + 1);
        const pct = Math.max(0, Math.min(100, (p.points / nextCfg.pointsRequired) * 100));
        this.el.hudProgressFill.style.width = pct.toFixed(1) + '%';
        this.el.hudProgressText.textContent =
          Math.floor(p.points) + ' / ' + nextCfg.pointsRequired + ' → Lv.' + nextCfg.rank;
      }

      // Hearts display
      let heartsHtml = '';
      for (let h = 0; h < p.maxHp; h++) {
        heartsHtml += h < p.hp ? '<span class="heart full">♥</span>' : '<span class="heart empty">♡</span>';
      }
      if (this.el.hudHearts.dataset.last !== heartsHtml) {
        this.el.hudHearts.innerHTML = heartsHtml;
        this.el.hudHearts.dataset.last = heartsHtml;
      }

      // Boost bar
      this.el.hudBoostFill.style.width = Math.round(p.boostEnergy) + '%';

      // Active temporary effects & sanctuary badge pills
      if (this.el.hudEffectsRow) {
        let pillsHtml = '';
        if (p.inSanctuary) {
          pillsHtml += '<span class="effect-pill effect-safe">🏡 Resting Safe</span>';
        }
        const effectKeys = Object.keys(p.activeEffects || {});
        for (let i = 0; i < effectKeys.length; i++) {
          const id = effectKeys[i];
          const entry = p.activeEffects[id];
          const cfg = Config.getEffectConfig(id);
          if (!cfg || !entry) continue;
          const secs = Math.max(0.1, entry.remaining).toFixed(1) + 's';
          pillsHtml +=
            '<span class="effect-pill effect-' +
            cfg.kind +
            '" style="background:' +
            cfg.bg +
            ';border-color:' +
            cfg.color +
            ';color:' +
            cfg.color +
            '">' +
            cfg.icon +
            ' ' +
            cfg.label +
            ' <strong>' +
            secs +
            '</strong></span>';
        }
        if (this.el.hudEffectsRow.dataset.last !== pillsHtml) {
          this.el.hudEffectsRow.innerHTML = pillsHtml;
          this.el.hudEffectsRow.dataset.last = pillsHtml;
          this.el.hudEffectsRow.hidden = !pillsHtml;
        }
      }

      // Skin shop badge + affordable sparkle dot
      this.el.shopBtnCount.textContent = p.ownedSkins.length + '/' + Config.SKINS.length;
      const canBuyAny = Config.SKINS.some(
        (s) => !p.ownedSkins.includes(s.id) && p.points >= s.cost
      );
      this.el.shopAffordableDot.hidden = !canBuyAny;

      // Update leaderboard ~5 times/sec
      if (Math.floor(time * 5) !== this._lastBoardTick) {
        this._lastBoardTick = Math.floor(time * 5);
        this._renderLeaderboard();
      }
    }

    _renderLeaderboard() {
      const top = this.engine.getLeaderboard(5);
      let html = '';
      for (let i = 0; i < top.length; i++) {
        const b = top[i];
        const cls = b.isPlayer ? 'lb-row is-player' : 'lb-row';
        const medal = i === 0 ? '👑' : i + 1 + '.';
        html +=
          '<div class="' +
          cls +
          '">' +
          '<span class="lb-rank">' +
          medal +
          '</span>' +
          '<span class="lb-name">' +
          this._escapeHtml(b.name) +
          '</span>' +
          '<span class="lb-lv">Lv.' +
          b.rank +
          '</span>' +
          '</div>';
      }
      this.el.leaderboardList.innerHTML = html;
    }

    _escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }

  DeeBug.UIController = UIController;
})(window);
