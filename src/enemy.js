/**
 * enemy.js - Moduł przeciwników
 *
 * Zawiera klasy:
 * - Enemy        (klasa bazowa)
 * - Goomba       (standardowy przeciwnik, chodzi i zawraca)
 * - Koopa        (żółw; po deptaniu staje się lecącą skorupą)
 * - EnemyManager (zarządza wszystkimi wrogami na poziomie)
 */

// ─────────────────────────────────────────────────────────────────────────────
//  KLASA BAZOWA: Enemy
// ─────────────────────────────────────────────────────────────────────────────

class Enemy {
  /**
   * @param {number} x, y   - pozycja startowa
   * @param {number} w, h   - rozmiary hitboxa
   * @param {CanvasRenderingContext2D} ctx
   * @param {SpriteRenderer} sprites
   */
  constructor(x, y, w, h, ctx, sprites) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.ctx     = ctx;
    this.sprites = sprites;

    this.velX = 0;
    this.velY = 0;

    this.onGround  = false;
    this.alive     = true;   // false gdy pokonany
    this.dying     = false;  // trwa animacja śmierci
    this.dyingTimer = 0;     // licznik klatek animacji śmierci

    // Kierunek poruszania (-1 = lewo, +1 = prawo)
    this.direction = -1;

    // Ograniczenia patrolu
    this.patrolMin = 0;
    this.patrolMax = 99999;

    this.animFrame = 0;
    this.animTimer = 0;
  }

  /**
   * Aktualizuj fizykę i kolizje z poziomem.
   * @param {Level} level
   */
  update(level, camX) {
    if (!this.alive) return;

    if (typeof camX === 'number') {
      const W = CONFIG.CANVAS.WIDTH;
      const margin = 120;
      if (this.x + this.w < camX - margin || this.x > camX + W + margin) {
        return; // off-screen, don't update physics/logic to save resources
      }
    }

    if (this.dying) {
      this._updateDying();
      return;
    }

    this._move();
    this._applyGravity();
    this._resolveWithLevel(level);
    this._checkPatrol();
    this._updateAnimation();
  }

  _move() {
    // Nadpisywana przez podklasy
  }

  _applyGravity() {
    this.velY += CONFIG.PHYSICS.GRAVITY;
    if (this.velY > CONFIG.PHYSICS.MAX_FALL_SPEED) {
      this.velY = CONFIG.PHYSICS.MAX_FALL_SPEED;
    }
    this.onGround = false;
  }

  _resolveWithLevel(level) {
    const result = level.resolveCollision(
      this.x, this.y, this.w, this.h,
      this.velX, this.velY
    );
    this.x    = result.x;
    this.y    = result.y;
    this.velX = result.velX;
    this.velY = result.velY;
    if (result.onGround) this.onGround = true;

    // Zawróć przy ścianie
    if (result.hitWallL) this.direction =  1;
    if (result.hitWallR) this.direction = -1;
  }

  /**
   * Zawróć jeśli wrogiem wyszedł poza strefę patrolu.
   */
  _checkPatrol() {
    if (this.x < this.patrolMin) {
      this.x = this.patrolMin;
      this.direction = 1;
    }
    if (this.x + this.w > this.patrolMax) {
      this.x = this.patrolMax - this.w;
      this.direction = -1;
    }
  }

  _updateAnimation() {
    this.animTimer++;
    if (this.animTimer >= 10) {
      this.animTimer = 0;
      this.animFrame = (this.animFrame + 1) % 2;
    }
  }

  /**
   * Wywoływana gdy gracz skacze na wroga.
   */
  stomp() {
    this.alive  = false;
    this.dying  = true;
    this.dyingTimer = 30;
    this.velX   = 0;
    this.velY   = 0;
  }

  /**
   * Wywoływana gdy wróg ginie od innej przyczyny (rura, dziura).
   */
  kill() {
    this.alive  = false;
    this.dying  = false;
  }

  _updateDying() {
    this.dyingTimer--;
    if (this.dyingTimer <= 0) {
      this.dying = false;
    }
  }

  draw(camX) {
    // Nadpisywana przez podklasy
  }

  // Gettery prostokąta kolizji
  get left()   { return this.x; }
  get right()  { return this.x + this.w; }
  get top()    { return this.y; }
  get bottom() { return this.y + this.h; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GOOMBA  – brązowy grzyb; chodzi i zawraca
// ─────────────────────────────────────────────────────────────────────────────

class Goomba extends Enemy {
  constructor(x, y, ctx, sprites) {
    super(x, y, 30, 30, ctx, sprites);
    this.direction = -1;
    this.speed     = CONFIG.ENEMY.GOOMBA_SPEED;
    this.spriteW   = 42; // visually bigger sprite size
    this.spriteH   = 42;
  }

  _move() {
    this.velX = this.speed * this.direction;
  }

  stomp() {
    super.stomp();
    this.dyingTimer = 40; // goomba jest spłaszczona chwilę
  }

  draw(camX) {
    if (!this.alive && !this.dying) return;

    const ctx = this.ctx;
    const w   = this.spriteW;
    const h   = this.spriteH;
    const offsetX = (w - this.w) / 2;
    const offsetY = h - this.h; // align bottom to prevent floating
    const px  = Math.round(this.x - camX - offsetX);
    const py  = Math.round(this.y - offsetY);

    ctx.save();

    const img = this.sprites.get('enemy_goomba');

    if (this.dying) {
      // Spłaszczona goomba
      const ratio = 1 - this.dyingTimer / 40;
      ctx.globalAlpha = 1 - ratio * 0.5;
      if (img) {
        ctx.drawImage(img, px, py + h * 0.6, w, h * 0.4);
      } else {
        this._drawBody(px, py + h * 0.6, w, h * 0.35);
      }
    } else {
      if (img) {
        if (this.direction > 0) {
          ctx.translate(px + w, py);
          ctx.scale(-1, 1);
          ctx.drawImage(img, 0, 0, w, h);
        } else {
          ctx.drawImage(img, px, py, w, h);
        }
      } else {
        this._drawBody(px, py, w, h);
      }
    }

    ctx.restore();

    if (CONFIG.DEBUG.SHOW_HITBOXES && this.alive) {
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(this.x - camX), Math.round(this.y), this.w, this.h);
    }
  }

  _drawBody(px, py, w, h) {
    const ctx = this.ctx;
    const C   = CONFIG.COLORS;

    // Ciało
    ctx.fillStyle = C.GOOMBA;
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h * 0.55, w / 2 - 1, h * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Głowa
    ctx.fillStyle = '#C05000';
    ctx.beginPath();
    ctx.arc(px + w / 2, py + h * 0.3, w * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // Oczy
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(px + w * 0.3, py + h * 0.25, 4, 0, Math.PI * 2);
    ctx.arc(px + w * 0.7, py + h * 0.25, 4, 0, Math.PI * 2);
    ctx.fill();

    // Źrenice
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(px + w * 0.28, py + h * 0.26, 2, 0, Math.PI * 2);
    ctx.arc(px + w * 0.72, py + h * 0.26, 2, 0, Math.PI * 2);
    ctx.fill();

    // Brwi (zagniewane)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + w * 0.18, py + h * 0.18);
    ctx.lineTo(px + w * 0.38, py + h * 0.22);
    ctx.moveTo(px + w * 0.82, py + h * 0.18);
    ctx.lineTo(px + w * 0.62, py + h * 0.22);
    ctx.stroke();

    // Nogi (animowane)
    const legSwing = Math.sin(Date.now() / 100) * 4;
    ctx.fillStyle = '#803000';
    ctx.fillRect(px + 2,       py + h - 8, 8, 8);
    ctx.fillRect(px + w - 10,  py + h - 8, 8, 8);

    // Stopy
    ctx.fillStyle = '#502000';
    ctx.fillRect(px - 1 + legSwing,       py + h - 4, 10, 4);
    ctx.fillRect(px + w - 9 - legSwing,   py + h - 4, 10, 4);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  KOOPA  – zielony żółw; po deptaniu staje się skorupą
// ─────────────────────────────────────────────────────────────────────────────

class Koopa extends Enemy {
  constructor(x, y, ctx, sprites) {
    super(x, y, 28, 36, ctx, sprites);
    this.direction  = -1;
    this.speed      = CONFIG.ENEMY.KOOPA_SPEED;
    this.isShell    = false;   // czy jest w skorupie
    this.shellMoving = false;  // czy skorupa się porusza
    this.shellTimer  = 0;      // licznik bezruchu skorupy
    this.spriteW    = 38; // visually bigger sprite size
    this.spriteH    = 48;
    this.shellSpriteW = 38;
    this.shellSpriteH = 30;
  }

  _move() {
    if (this.isShell) {
      if (this.shellMoving) {
        this.velX = CONFIG.ENEMY.SHELL_SPEED * this.direction;
      } else {
        // Spokojnie stojąca skorupa
        this.velX *= 0.8;
        this.shellTimer++;
        if (this.shellTimer > 300) {
          // Ożyj po 5 sekundach (300 klatek)
          this.isShell     = false;
          this.shellMoving = false;
          this.shellTimer  = 0;
          this.w = 28;
          this.h = 36;
        }
      }
      return;
    }
    this.velX = this.speed * this.direction;
  }

  /**
   * Gracz skoczył na koopę.
   */
  stomp() {
    if (!this.isShell) {
      // Pierwsza stopa – chowa się w skorupie
      this.isShell     = true;
      this.shellMoving = false;
      this.shellTimer  = 0;
      this.velX = 0;
      this.h = 22; // mniejszy hitbox skorupy
    } else if (!this.shellMoving) {
      // Gracz kopnął nieruchomą skorupę
      this.shellMoving = true;
      this.direction   = (this.velX >= 0) ? 1 : -1;
    } else {
      // Zatrzymaj poruszającą się skorupę
      this.shellMoving = false;
      this.velX = 0;
      this.shellTimer = 0;
    }
  }

  draw(camX) {
    if (!this.alive && !this.dying) return;

    const ctx = this.ctx;
    const isShell = this.isShell;

    // Use scaled size for drawings
    const w = isShell ? this.shellSpriteW : this.spriteW;
    const h = isShell ? this.shellSpriteH : this.spriteH;

    const offsetX = (w - this.w) / 2;
    const offsetY = h - this.h; // align bottom to prevent floating
    const px  = Math.round(this.x - camX - offsetX);
    const py  = Math.round(this.y - offsetY);

    ctx.save();
    if (isShell) {
      this._drawShell(px, py, w, h);
    } else {
      this._drawKoopa(px, py, w, h);
    }
    ctx.restore();

    if (CONFIG.DEBUG.SHOW_HITBOXES && this.alive) {
      ctx.strokeStyle = '#FF8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(this.x - camX), Math.round(this.y), this.w, this.h);
    }
  }

  _drawKoopa(px, py, w, h) {
    const ctx = this.ctx;
    const img = this.sprites.get('enemy_koopa');

    if (img) {
      ctx.save();
      if (this.direction > 0) {
        ctx.translate(px + w, py);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        ctx.drawImage(img, px, py, w, h);
      }
      ctx.restore();
      return;
    }

    const C   = CONFIG.COLORS;

    // Pancerz (muszla)
    ctx.fillStyle = C.KOOPA;
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h * 0.55, w / 2 - 2, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wzór muszli
    ctx.strokeStyle = '#208020';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + w / 2, py + h * 0.2);
    ctx.lineTo(px + w / 2, py + h * 0.9);
    ctx.moveTo(px + w * 0.1, py + h * 0.55);
    ctx.lineTo(px + w * 0.9, py + h * 0.55);
    ctx.stroke();

    // Głowa
    ctx.fillStyle = '#50C050';
    ctx.beginPath();
    ctx.arc(px + w / 2 + (this.direction > 0 ? 4 : -4),
            py + h * 0.22, w * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Oko
    ctx.fillStyle = '#FFFFFF';
    const eyeOffX = this.direction > 0 ? w * 0.65 : w * 0.25;
    ctx.beginPath();
    ctx.arc(px + eyeOffX, py + h * 0.18, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(px + eyeOffX + (this.direction > 0 ? 1 : -1),
            py + h * 0.19, 2, 0, Math.PI * 2);
    ctx.fill();

    // Nogi
    ctx.fillStyle = '#50C050';
    const legSwing = Math.sin(Date.now() / 120) * 3;
    ctx.fillRect(px + 2 + legSwing, py + h - 10, 8, 10);
    ctx.fillRect(px + w - 10 - legSwing, py + h - 10, 8, 10);
  }

  _drawShell(px, py, w, h) {
    const ctx = this.ctx;
    const img = this.sprites.get('enemy_koopa');

    if (img) {
      ctx.save();
      ctx.translate(px + w / 2, py + h / 2);
      if (this.shellMoving) {
        const rotationSpeed = 0.15;
        const angle = (this.x * rotationSpeed) * this.direction;
        ctx.rotate(angle);
      } else {
        ctx.scale(1.0, 0.8);
      }
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();

      if (this.shellMoving) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = 'rgba(168, 64, 0, 0.4)';
        ctx.lineWidth = 3;
        const dir = this.direction;
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(px + w / 2 - dir * i * 5, py + h / 2, w / 2 + i * 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }

    const C   = CONFIG.COLORS;

    // Skorupa
    ctx.fillStyle = C.KOOPA;
    ctx.beginPath();
    ctx.ellipse(px + w / 2, py + h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wzór
    ctx.strokeStyle = '#208020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + w / 2, py + 2);
    ctx.lineTo(px + w / 2, py + h - 2);
    ctx.moveTo(px + 2, py + h / 2);
    ctx.lineTo(px + w - 2, py + h / 2);
    ctx.stroke();

    // Jeśli się porusza – efekt ruchu
    if (this.shellMoving) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 3;
      const dir = this.direction;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = 0.3 / i;
        ctx.beginPath();
        ctx.arc(px + w / 2 - dir * i * 5,
                py + h / 2, w / 2 + i * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENEMY MANAGER  – tworzy i zarządza wszystkimi wrogami
// ─────────────────────────────────────────────────────────────────────────────

class EnemyManager {
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {SpriteRenderer} sprites
   */
  constructor(ctx, sprites) {
    this.ctx     = ctx;
    this.sprites = sprites;
    this.enemies = []; // lista aktywnych obiektów Enemy
  }

  /**
   * Tworzy wrogów na podstawie danych poziomu.
   * @param {Array} enemyData - dane z level.enemies
   */
  spawn(enemyData) {
    this.enemies = [];

    enemyData.forEach(data => {
      let enemy;

      switch (data.type) {
        case 'koopa':
          enemy = new Koopa(data.x, data.y, this.ctx, this.sprites);
          break;
        case 'goomba':
        default:
          enemy = new Goomba(data.x, data.y, this.ctx, this.sprites);
          break;
      }

      enemy.patrolMin = data.patrolMin;
      enemy.patrolMax = data.patrolMax;
      this.enemies.push(enemy);
    });
  }

  /**
   * Aktualizuje wszystkich wrogów.
   * @param {Level} level
   */
  update(level, camX) {
    this.enemies.forEach(e => e.update(level, camX));

    // Usuń całkowicie martwych wrogów (animacja śmierci zakończona)
    this.enemies = this.enemies.filter(e => e.alive || e.dying);
  }

  /**
   * Sprawdza kolizje gracza z wrogami.
   * @param {Player} player
   */
  checkPlayerCollision(player) {
    if (player.isDead || player.isWinning) return;

    this.enemies.forEach(enemy => {
      if (!enemy.alive) return;

      // Quick distance culling for player collisions
      if (Math.abs(enemy.x - player.x) > 100) return;

      // Prostokąt przecięcia
      const overlapX = Math.min(player.right, enemy.right)
                     - Math.max(player.left,  enemy.left);
      const overlapY = Math.min(player.bottom, enemy.bottom)
                     - Math.max(player.top,    enemy.top);

      if (overlapX <= 0 || overlapY <= 0) return; // brak kolizji

      // Gracz skacze na wroga – deptanie
      // Warunek: gracz spada (velY > 0) i dolna krawędź gracza
      //          jest ponad środkiem wroga
      const stomping =
        player.velY > 0 &&
        player.bottom <= enemy.top + enemy.h * 0.45 &&
        overlapX > 4;

      if (stomping) {
        // Koopa z poruszającą się skorupą zabija gracza
        if (enemy instanceof Koopa && enemy.isShell && enemy.shellMoving) {
          player.hurt();
        } else {
          enemy.stomp();
          player.killEnemy();
        }
      } else {
        // Kontakt boczny / od dołu → gracz ginie
        if (!player.isInvincible()) {
          player.hurt();
        }
      }
    });
  }

  /**
   * Sprawdza kolizje lecącej skorupy z innymi wrogami.
   */
  checkShellCollisions() {
    this.enemies.forEach(shell => {
      if (!(shell instanceof Koopa)) return;
      if (!shell.shellMoving) return;

      this.enemies.forEach(other => {
        if (other === shell || !other.alive) return;
        
        // Quick distance culling for shell collisions
        if (Math.abs(other.x - shell.x) > 120) return;

        if (shell.right < other.left || shell.left > other.right) return;
        if (shell.bottom < other.top || shell.top > other.bottom) return;
        other.kill();
      });
    });
  }

  /**
   * Rysuje wszystkich wrogów.
   * @param {number} camX
   */
  draw(camX) {
    this.enemies.forEach(e => e.draw(camX));
  }
}
