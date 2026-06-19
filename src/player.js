/**
 * player.js - Moduł gracza
 *
 * Odpowiada za:
 * - Ruch gracza (chodzenie, bieganie, skakanie)
 * - Fizykę (grawitacja, kolizje z poziomem)
 * - Animację sprite'ów
 * - Stany gracza (żywy, martwy, nietykalny, zwycięstwo)
 * - Obsługę klawiatury
 */

class Player {
  /**
   * @param {CanvasRenderingContext2D} ctx      - kontekst canvas
   * @param {SpriteRenderer}           sprites  - rejestr sprite'ów
   * @param {InputManager}             input    - obsługa wejścia
   */
  constructor(ctx, sprites, input) {
    this.ctx = ctx;
    this.sprites = sprites;
    this.input = input;

    // ── Pozycja i wymiary ──────────────────────────────────────
    this.w = CONFIG.PLAYER.WIDTH;
    this.h = CONFIG.PLAYER.HEIGHT;
    this.spriteW = CONFIG.PLAYER.SPRITE_WIDTH; // visual sprite width
    this.spriteH = CONFIG.PLAYER.SPRITE_HEIGHT; // visual sprite height

    // ── Prędkości ─────────────────────────────────────────────
    this.velX = 0;
    this.velY = 0;

    // ── Stany ─────────────────────────────────────────────────
    this.onGround = false;  // czy stoi na ziemi
    this.facingRight = true;  // kierunek patrzenia
    this.isRunning = false;  // czy biegnie (Shift)
    this.isDead = false;  // czy gracz zginął
    this.isWinning = false;  // czy dotarł do flagi

    // Nietykalność po uderzeniu
    this.invincibleTimer = 0;    // ile klatek pozostało nietykalności
    this.invincibleBlink = 0;    // licznik migotania

    // Kombo (ile wrogów zabitych w jednym skoku)
    this.airKillCombo = 0;

    // ── Animacja ──────────────────────────────────────────────
    this.animFrame = 0;   // aktualny indeks klatki animacji
    this.animTimer = 6;   // licznik klatek do zmiany klatki
    this.deathAnim = 0;   // postęp animacji śmierci (0..1)
    this.deathVelY = -12; // prędkość Y podczas animacji śmierci

    // Nazwy sprite'ów dla każdego stanu
    this.SPRITE_IDLE = 'player_idle';
    this.SPRITE_WALK1 = 'player_walk1';
    this.SPRITE_WALK2 = 'player_walk2';
    this.SPRITE_WALK3 = 'player_walk3';
    this.SPRITE_WALK4 = 'player_walk4';
    this.SPRITE_JUMP = 'player_jump';
    this.SPRITE_DEAD = 'player_dead';

    // ── Statystyki ────────────────────────────────────────────
    this.score = 0;
    this.coins = 0;
    this.lives = CONFIG.PLAYER.START_LIVES;

    // Skok: Coyote Time i Jump Buffering
    this.coyoteCounter = 0;
    this.jumpBufferCounter = 0;
  }

  // ─────────────────────────────────────────────────────────────
  //  USTAWIANIE POZYCJI STARTOWEJ
  // ─────────────────────────────────────────────────────────────

  /**
   * Resetuje gracza do pozycji startowej poziomu.
   */
  spawn(x, y) {
    this.x = x;
    this.y = y;
    this.isDead = false;
    this.isWinning = false;
    this.invincibleTimer = 0;
    this.airKillCombo = 0;
    this.animFrame = 0;
    this.animTimer = 0;
    this.coyoteCounter = 0;
    this.jumpBufferCounter = 0;
  }

  // ─────────────────────────────────────────────────────────────
  //  AKTUALIZACJA (wywoływana co klatkę)
  // ─────────────────────────────────────────────────────────────

  /**
   * Główna pętla aktualizacji gracza.
   * @param {Level} level - aktualny poziom (do kolizji)
   */
  update(level) {
    if (this.isDead) {
      this._updateDeath();
      return;
    }
    if (this.isWinning) {
      this._updateWinning();
      return;
    }

    this._handleInput();
    this._applyPhysics();
    this._resolveWithLevel(level);
    this._checkLevelBounds(level);
    this._updateInvincibility();
    this._updateAnimation();
  }

  // ─────────────────────────────────────────────────────────────
  //  OBSŁUGA WEJŚCIA
  // ─────────────────────────────────────────────────────────────

  _handleInput() {
    const inp = this.input;
    const cfg = CONFIG.PLAYER;
    const ctrl = CONFIG.CONTROLS;

    this.isRunning = inp.isAnyDown(ctrl.RUN);

    const maxSpeed = this.isRunning ? cfg.RUN_SPEED : cfg.MOVE_SPEED;

    // Ruch lewo/prawo
    if (inp.isAnyDown(ctrl.MOVE_LEFT)) {
      this.velX -= 0.8;
      if (this.velX < -maxSpeed) this.velX = -maxSpeed;
      this.facingRight = false;
    } else if (inp.isAnyDown(ctrl.MOVE_RIGHT)) {
      this.velX += 0.8;
      if (this.velX > maxSpeed) this.velX = maxSpeed;
      this.facingRight = true;
    } else {
      // Tarcie – zatrzymaj gracza gdy brak wejścia
      this.velX *= CONFIG.PHYSICS.FRICTION;
      if (Math.abs(this.velX) < 0.1) this.velX = 0;
    }

    // Aktualizacja liczników Coyote Time i Jump Buffering
    if (this.onGround) {
      this.coyoteCounter = 8; // 8 klatek tolerancji
    } else if (this.coyoteCounter > 0) {
      this.coyoteCounter--;
    }

    if (inp.isAnyPressed(ctrl.JUMP)) {
      this.jumpBufferCounter = 8; // 8 klatek buforowania skoku
    } else if (this.jumpBufferCounter > 0) {
      this.jumpBufferCounter--;
    }

    // Wykonanie skoku
    if (this.jumpBufferCounter > 0 && this.coyoteCounter > 0) {
      this.velY = cfg.JUMP_FORCE;
      this.onGround = false;
      this.coyoteCounter = 0;
      this.jumpBufferCounter = 0;

      // Odtwórz dźwięk skoku
      if (window._game && window._game.audio) {
        window._game.audio.playJump();
      }
    }

    // Wyższy skok przy dłuższym trzymaniu klawisza
    if (inp.isAnyDown(ctrl.JUMP) && this.velY < 0) {
      this.velY -= 0.3; // dodatkowy impuls w górę
      if (this.velY < cfg.JUMP_FORCE * 1.35) {
        this.velY = cfg.JUMP_FORCE * 1.35;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  FIZYKA
  // ─────────────────────────────────────────────────────────────

  _applyPhysics() {
    // Grawitacja
    this.velY += CONFIG.PHYSICS.GRAVITY;

    // Ogranicz prędkość opadania
    if (this.velY > CONFIG.PHYSICS.MAX_FALL_SPEED) {
      this.velY = CONFIG.PHYSICS.MAX_FALL_SPEED;
    }

    // Resetuj flagę podłoża (zostanie ustawiona po kolizji)
    this.onGround = false;
  }

  // ─────────────────────────────────────────────────────────────
  //  KOLIZJA Z POZIOMEM
  // ─────────────────────────────────────────────────────────────

  _resolveWithLevel(level) {
    const result = level.resolveCollision(
      this.x, this.y, this.w, this.h,
      this.velX, this.velY
    );

    this.x = result.x;
    this.y = result.y;
    this.velX = result.velX;
    this.velY = result.velY;

    if (result.onGround) {
      this.onGround = true;
      this.airKillCombo = 0; // reset kombo przy lądowaniu
    }
    if (result.hitCeiling) {
      // Głowa uderzyła w sufit – zatrzymaj ruch w górę
    }
    if (result.hitWallL || result.hitWallR) {
      this.velX = 0;
    }
  }

  /**
   * Sprawdza czy gracz wyszedł poza granice poziomu.
   */
  _checkLevelBounds(level) {
    // Śmierć przez wpadnięcie do dziury
    if (this.y > level.deathY) {
      this.die();
      return;
    }

    // Lewa granica – nie pozwól wyjść za ekran
    if (this.x < 0) {
      this.x = 0;
      this.velX = 0;
    }

    // Górna granica – nie pozwól przeskoczyć góra
    if (this.y < 0) {
      this.y = 0;
      this.velY = 0;
    }

    // Prawa granica mapy
    const maxX = level.pixelWidth - this.w;
    if (this.x > maxX) {
      this.x = maxX;
      this.velX = 0;
    }

    // Sprawdź czy gracz dotarł do flagi
    const flagZone = level.flagX;
    if (flagZone > 0 &&
      this.x + this.w > flagZone &&
      this.x < flagZone + CONFIG.CANVAS.TILE_SIZE) {
      this.win();
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  STANY SPECJALNE
  // ─────────────────────────────────────────────────────────────

  /**
   * Gracz ginie – uruchom animację śmierci.
   */
  die() {
    if (this.invincibleTimer > 0 || this.isDead || this.isWinning) return;
    if (CONFIG.DEBUG.INVINCIBLE_PLAYER) return;

    this.isDead = true;
    this.velX = 0;
    this.velY = 0;
    this.deathVelY = -11;
    this.lives--;

    // Odtwórz dźwięk śmierci
    if (window._game && window._game.audio) {
      window._game.audio.playDie();
    }
  }

  /**
   * Gracz dotarł do celu.
   */
  win() {
    if (this.isWinning || this.isDead) return;
    this.isWinning = true;
    this.velX = 0;
    this.velY = 0;
    this.addScore(1000);

    // Odtwórz dźwięk ukończenia poziomu
    if (window._game && window._game.audio) {
      window._game.audio.playWin();
    }
  }

  /**
   * Zadaj graczowi obrażenia od wroga (kontakt boczny / od dołu).
   */
  hurt() {
    this.die();
  }

  /**
   * Gracz zabił wroga (skoczył na niego).
   * @returns {number} przyznane punkty
   */
  killEnemy() {
    this.airKillCombo++;
    const pts = CONFIG.SCORE.KILL_ENEMY +
      CONFIG.SCORE.COMBO_BONUS * (this.airKillCombo - 1);
    this.addScore(pts);
    // Odbicie po zabiciu wroga
    this.velY = CONFIG.PLAYER.JUMP_FORCE * 0.65;

    // Odtwórz dźwięk zdeptania wroga
    if (window._game && window._game.audio) {
      window._game.audio.playStomp();
    }
    return pts;
  }

  /**
   * Gracz zebrał monetę.
   */
  collectCoin() {
    this.coins++;
    this.addScore(CONFIG.SCORE.COIN);
    // Co 100 monet dodatkowe życie
    if (this.coins % 100 === 0) {
      this.lives++;
    }
  }

  /**
   * Dodaje punkty do wyniku.
   */
  addScore(pts) {
    this.score += pts;
  }

  /**
   * Ustaw nietykalność po uderzeniu.
   */
  setInvincible(frames) {
    this.invincibleTimer = 360;
  }

  // ─────────────────────────────────────────────────────────────
  //  ANIMACJE SPECJALNE (śmierć, zwycięstwo)
  // ─────────────────────────────────────────────────────────────

  _updateDeath() {
    // Animacja skoku w górę i opadania
    this.deathVelY += CONFIG.PHYSICS.GRAVITY;
    this.y += this.deathVelY;
  }

  _updateWinning() {
    // Lekki ruch w prawo (wbiegnij za flagę)
    this.velX = 2;
    this.facingRight = true;
    this.x += this.velX;
  }

  // ─────────────────────────────────────────────────────────────
  //  NIETYKALNOŚĆ
  // ─────────────────────────────────────────────────────────────

  _updateInvincibility() {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer--;
      this.invincibleBlink++;
    } else {
      this.invincibleBlink = 0;
    }
  }

  /**
   * Czy gracz jest aktualnie nietykalny.
   */
  isInvincible() {
    return this.invincibleTimer > 0 || CONFIG.DEBUG.INVINCIBLE_PLAYER;
  }

  // ─────────────────────────────────────────────────────────────
  //  AKTUALIZACJA ANIMACJI
  // ─────────────────────────────────────────────────────────────

  _updateAnimation() {
    const speed = Math.abs(this.velX);

    this.animTimer++;
    const fps = Math.max(2, CONFIG.PLAYER.ANIMATION_SPEED - Math.floor(speed));

    if (this.animTimer >= fps) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 4; // co najmniej 4 klatki chodzenia
    }
  }

  /**
   * Zwraca aktualną nazwę sprite'a do rysowania.
   */
  _currentSprite() {
    // Determine which sprite to display based on state and vertical velocity.
    // Show jump sprite only when the player is airborne and moving upward.
    if (this.isDead) return this.SPRITE_DEAD;
    if (!this.onGround && this.velY < 0) return this.SPRITE_JUMP;
    if (Math.abs(this.velX) > 0.3) {
      switch (this.animFrame) {
        case 0: return this.SPRITE_WALK1;
        case 1: return this.SPRITE_WALK2;
        case 2: return this.SPRITE_WALK3;
        case 3: return this.SPRITE_WALK4;
      }
    }
    return this.SPRITE_IDLE;
  }

  // ─────────────────────────────────────────────────────────────
  //  RYSOWANIE
  // ─────────────────────────────────────────────────────────────

  /**
   * Rysuje gracza na canvas z uwzględnieniem przesunięcia kamery.
   * @param {number} camX - pozycja kamery X
   */
  draw(camX) {
    const ctx = this.ctx;
    const offsetX = (this.spriteW - this.w) / 2;
    const offsetY = (this.spriteH - this.h) / 2;
    const px = Math.round(this.x - camX - offsetX);
    const py = Math.round(this.y - offsetY);
    const w = this.spriteW; // use sprite dimensions for drawing
    const h = this.spriteH;

    // Migotanie nietykalności – co 4 klatki pomijamy rysowanie
    if (this.invincibleTimer > 0 && Math.floor(this.invincibleBlink / 4) % 2 === 1) {
      return;
    }

    const spriteBaseName = this._currentSprite();
    const suffix = this.facingRight ? '_right' : '_left';
    let spriteName = spriteBaseName + suffix;
    let useFlippedFallback = false;

    // Check if the direction-specific sprite was loaded from a file (not generated)
    const hasDirectionalImage = this.sprites.has(spriteName) && !this.sprites.isGenerated(spriteName);

    if (!hasDirectionalImage) {
      // If we don't have a specific left/right image file, check if the unsuffixed base image file was loaded
      const hasBaseImage = this.sprites.has(spriteBaseName) && !this.sprites.isGenerated(spriteBaseName);
      if (hasBaseImage) {
        spriteName = spriteBaseName;
        useFlippedFallback = true;
      }
    }

    ctx.save();

    // If using the unsuffixed base sprite, we flip it manually when facing left
    if (useFlippedFallback && !this.facingRight) {
      ctx.translate(px + w, py);
      ctx.scale(-1, 1);
      this._drawSprite(spriteName, 0, 0, w, h);
    } else {
      this._drawSprite(spriteName, px, py, w, h);
    }

    ctx.restore();

    // Debug hitbox
    if (CONFIG.DEBUG.SHOW_HITBOXES) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, w, h);
    }
  }

  /**
   * Rysuje sprite lub zastępczą grafikę wektorową.
   */
  _drawSprite(name, x, y, w, h) {
    const ctx = this.ctx;

    if (this.sprites.has(name)) {
      ctx.drawImage(this.sprites.get(name), x, y, w, h);
      return;
    }

    // ── Zastępcza grafika wektorowa Mario ────────────────────
    const C = CONFIG.COLORS;

    if (name.includes(this.SPRITE_DEAD)) {
      // Martwy – płaski, obrócony
      ctx.fillStyle = C.PLAYER_BODY;
      ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.fillStyle = C.PLAYER_SKIN;
      ctx.fillRect(x + 6, y + 6, w - 12, 8);
      return;
    }

    // Wybór offsetu nóg w zależności od klatki animacji chodu
    let legOffset = 0;
    if (name.includes(this.SPRITE_WALK1)) legOffset = -4;
    else if (name.includes(this.SPRITE_WALK2)) legOffset = -2;
    else if (name.includes(this.SPRITE_WALK3)) legOffset = 2;
    else if (name.includes(this.SPRITE_WALK4)) legOffset = 4;

    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(x + 2 + legOffset, y + h - 6, 8, 6);
    ctx.fillRect(x + w - 10 - legOffset, y + h - 6, 8, 6);

    // Spodnie (ogrodniczki)
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(x + 3, y + h - 14, w - 6, 10);

    // Ciało / koszula
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(x + 4, y + h - 22, w - 8, 10);

    // Twarz (skóra)
    ctx.fillStyle = C.PLAYER_SKIN;
    ctx.fillRect(x + 5, y + h - 28, w - 10, 10);

    // Czapka
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(x + 2, y + h - 32, w - 4, 5);
    ctx.fillRect(x + 4, y + h - 36, w - 8, 5);

    // Wąs
    ctx.fillStyle = '#703000';
    ctx.fillRect(x + 7, y + h - 22, 6, 2);

    // Skok – ręce w górze
    if (name.includes(this.SPRITE_JUMP)) {
      ctx.fillStyle = C.PLAYER_BODY;
      ctx.fillRect(x, y + h - 22, 4, 8);
      ctx.fillRect(x + w - 4, y + h - 22, 4, 8);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  POMOCNICZE GETTERY (prostokąt kolizji)
  // ─────────────────────────────────────────────────────────────

  get left() { return this.x; }
  get right() { return this.x + this.w; }
  get top() { return this.y; }
  get bottom() { return this.y + this.h; }
  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
}
