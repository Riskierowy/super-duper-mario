/**
 * game.js - Główny moduł silnika gry
 *
 * Odpowiada za:
 * - Inicjalizację canvas i wszystkich modułów
 * - Główną pętlę gry (requestAnimationFrame)
 * - Zarządzanie stanami gry (menu, gra, pauza, śmierć, koniec)
 * - System cząstek (particles) – efekty wizualne
 * - Kamerę (camera) – przewijanie poziomu
 * - HUD – wyświetlanie wyniku, żyć, czasu
 * - System sprite'ów – wczytywanie / generowanie PNG
 * - InputManager – obsługa klawiatury
 */

// ─────────────────────────────────────────────────────────────────────────────
//  INPUT MANAGER – obsługa klawiatury
// ─────────────────────────────────────────────────────────────────────────────

class InputManager {
  constructor() {
    // Zbiory aktywnych klawiszy
    this._down = new Set(); // klawisze wciśnięte w tej chwili
    this._pressed = new Set(); // klawisze właśnie naciśnięte (w tej klatce)
    this._pendingPressed = new Set(); // klawisze naciśnięte asynchronicznie

    window.addEventListener('keydown', e => {
      if (!this._down.has(e.code)) {
        this._pendingPressed.add(e.code);
      }
      this._down.add(e.code);

      // Zapobiegaj domyślnemu scrollowaniu strzałkami/spacją
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', e => {
      this._down.delete(e.code);
    });
  }

  /** Czy dany klawisz jest wciśnięty. */
  isDown(code) { return this._down.has(code); }

  /** Czy którykolwiek z podanych klawiszy jest wciśnięty. */
  isAnyDown(codes) { return codes.some(c => this._down.has(c)); }

  /** Czy dany klawisz został właśnie naciśnięty (jeden tick). */
  isPressed(code) { return this._pressed.has(code); }

  /** Czy którykolwiek z podanych klawiszy został właśnie naciśnięty. */
  isAnyPressed(codes) { return codes.some(c => this._pressed.has(c)); }

  /** Aktualizuje stan naciśniętych klawiszy na początku klatki */
  update() {
    this._pressed = new Set(this._pendingPressed);
    this._pendingPressed.clear();
  }

  /** Wyczyść listę "właśnie naciśniętych" – pozostawiona pusta dla kompatybilności */
  flush() { }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPRITE RENDERER – rejestr sprite'ów (PNG lub canvas)
// ─────────────────────────────────────────────────────────────────────────────

class SpriteRenderer {
  constructor() {
    // Mapa: nazwa → HTMLImageElement | HTMLCanvasElement
    this._sprites = new Map();
    // Zbiór nazw wygenerowanych programatycznie sprite'ów
    this._generated = new Set();
  }

  has(name) { return this._sprites.has(name); }
  get(name) { return this._sprites.get(name); }
  set(name, img) { this._sprites.set(name, img); }
  isGenerated(name) { return this._generated.has(name); }

  /**
   * Próbuje wczytać PNG z dysku.
   * Jeśli plik nie istnieje, generuje sprite programatycznie.
   *
   * @param {string} name     - identyfikator sprite'a
   * @param {string} pngPath  - ścieżka do pliku PNG
   * @param {Function} fallback - funkcja (canvas, ctx) rysująca zastępnik
   */
  async loadOrGenerate(name, pngPath, fallback) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        this._sprites.set(name, img);
        resolve();
      };
      img.onerror = () => {
        // Wygeneruj sprite na canvas
        const size = 64;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        if (fallback) fallback(c, ctx);
        this._sprites.set(name, c);
        this._generated.add(name);
        resolve();
      };
      img.src = pngPath;
    });
  }

  /**
   * Wczytuje wszystkie sprite'y potrzebne do gry.
   */
  async loadAll() {
    const T = CONFIG.CANVAS.TILE_SIZE;
    const base = CONFIG.ASSETS.TEXTURES_PATH;
    const tiles = CONFIG.ASSETS.TILES_PATH;

    // Lista: [nazwa, ścieżka PNG, funkcja_zastępcza]
    const list = [
      // Gracz – idle (Right / Left) use same sprite for both directions
      ['player_idle_right', base + 'player_idle.png', (c, ctx) => this._genPlayer(c, ctx, 'idle', true)],
      ['player_idle_left', base + 'player_idle.png', (c, ctx) => this._genPlayer(c, ctx, 'idle', false)],

      // Gracz – walk (1-4, Right / Left) use same walk sprites for both directions
      ['player_walk1_right', base + 'player_walk1.png', (c, ctx) => this._genPlayer(c, ctx, 'walk1', true)],
      ['player_walk1_left', base + 'player_walk1.png', (c, ctx) => this._genPlayer(c, ctx, 'walk1', false)],
      ['player_walk2_right', base + 'player_walk2.png', (c, ctx) => this._genPlayer(c, ctx, 'walk2', true)],
      ['player_walk2_left', base + 'player_walk2.png', (c, ctx) => this._genPlayer(c, ctx, 'walk2', false)],
      ['player_walk3_right', base + 'player_walk3.png', (c, ctx) => this._genPlayer(c, ctx, 'walk3', true)],
      ['player_walk3_left', base + 'player_walk3.png', (c, ctx) => this._genPlayer(c, ctx, 'walk3', false)],
      ['player_walk4_right', base + 'player_walk4.png', (c, ctx) => this._genPlayer(c, ctx, 'walk4', true)],
      ['player_walk4_left', base + 'player_walk4.png', (c, ctx) => this._genPlayer(c, ctx, 'walk4', false)],

      // Gracz – jump (Right / Left) use same jump sprite
      ['player_jump_right', base + 'player_jump.png', (c, ctx) => this._genPlayer(c, ctx, 'jump', true)],
      ['player_jump_left', base + 'player_jump.png', (c, ctx) => this._genPlayer(c, ctx, 'jump', false)],

      // Gracz – dead (Right / Left) use same dead sprite
      ['player_dead_right', base + 'player_dead.png', (c, ctx) => this._genPlayer(c, ctx, 'dead', true)],
      ['player_dead_left', base + 'player_dead.png', (c, ctx) => this._genPlayer(c, ctx, 'dead', false)],

      // Legacy / Un-suffixed references for backwards compatibility
      ['player_idle', base + 'player_idle.png', (c, ctx) => this._genPlayer(c, ctx, 'idle', true)],
      ['player_walk1', base + 'player_walk1.png', (c, ctx) => this._genPlayer(c, ctx, 'walk1', true)],
      ['player_walk2', base + 'player_walk2.png', (c, ctx) => this._genPlayer(c, ctx, 'walk2', true)],
      ['player_walk3', base + 'player_walk3.png', (c, ctx) => this._genPlayer(c, ctx, 'walk3', true)],
      ['player_walk4', base + 'player_walk4.png', (c, ctx) => this._genPlayer(c, ctx, 'walk4', true)],
      ['player_jump', base + 'player_jump.png', (c, ctx) => this._genPlayer(c, ctx, 'jump', true)],
      ['player_dead', base + 'player_dead.png', (c, ctx) => this._genPlayer(c, ctx, 'dead', true)],

      // Kafelki – loaded from tiles/ subfolder
      ['tile_ground', tiles + 'tile_ground.png', this._genTileGround.bind(this)],
      ['tile_brick', tiles + 'tile_brick.png', this._genTileBrick.bind(this)],
      ['tile_question', tiles + 'tile_question.png', this._genTileQuestion.bind(this)],
      ['tile_used', tiles + 'tile_used.png', this._genTileUsed.bind(this)],
      ['tile_pipe_top', tiles + 'tile_pipe_top.png', this._genPipeTop.bind(this)],
      ['tile_pipe', tiles + 'tile_pipe.png', this._genPipe.bind(this)],
      ['tile_cloud', tiles + 'tile_cloud.png', this._genCloud.bind(this)],
      ['tile_coin', tiles + 'tile_coin.png', this._genCoin.bind(this)],
      ['tile_underground', tiles + 'tile_underground.png', this._genTileUnderground.bind(this)],
      ['tile_pipe_variant', tiles + 'tile_pipe_variant.png', this._genPipeVariant.bind(this)],
      ['enemy_goomba', base + 'enemies/goomba.png', this._genGoomba.bind(this)],
      ['enemy_koopa', base + 'enemies/koopa.png', this._genKoopa.bind(this)],
    ];

    await Promise.all(list.map(([name, path, fn]) =>
      this.loadOrGenerate(name, path, fn)
    ));
  }

  // ── Generatory sprite'ów (pixel-art na canvas) ──────────────

  _genPlayer(c, ctx, pose, facingRight) {
    _drawMarioSprite(ctx, c.width, c.height, pose, facingRight);
  }

  _genTileGround(c, ctx) {
    const T = c.width;
    const scale = T / 32; // Skala dla wygenerowanej tekstury (np. 64px zamiast 32px)

    // Podkład ziemi (brązowy)
    ctx.fillStyle = '#C84C0C';
    ctx.fillRect(0, 0, T, T);

    // Tekstura ziemi - małe cegiełki/kamienie
    ctx.fillStyle = '#943A0A';
    for (let y = 10 * scale; y < T; y += 8 * scale) {
      for (let x = (y % 16 === 0 ? 0 : 4 * scale); x < T; x += 8 * scale) {
        ctx.fillRect(x, y, 3 * scale, 3 * scale);
      }
    }

    // Baza trawy (zielona)
    ctx.fillStyle = '#58A848';
    ctx.fillRect(0, 0, T, 6 * scale);

    // Jasny pasek podświetlenia na samej górze trawy
    ctx.fillStyle = '#7CE468';
    ctx.fillRect(0, 0, T, 2 * scale);

    // Ząbkowane krawędzie trawy (źdźbła)
    ctx.fillStyle = '#58A848';
    for (let x = 0; x < T; x += 4 * scale) {
      const h = (x % 8 === 0 ? 4 : 2) * scale;
      ctx.fillRect(x, 6 * scale, 2 * scale, h);
    }

    // Cień pod źdźbłami trawy
    ctx.fillStyle = '#306820';
    for (let x = 0; x < T; x += 4 * scale) {
      const h = (x % 8 === 0 ? 4 : 2) * scale;
      ctx.fillRect(x, 6 * scale + h, 2 * scale, 1 * scale);
    }
  }

  _genTileBrick(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#C84C0C';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#A03808';
    ctx.fillRect(0, 0, T / 2 - 1, T / 2 - 1);
    ctx.fillRect(T / 2, T / 2, T / 2 - 1, T / 2 - 1);
    ctx.fillStyle = '#E06020';
    ctx.fillRect(T / 2, 0, T / 2 - 1, T / 2 - 1);
    ctx.fillRect(0, T / 2, T / 2 - 1, T / 2 - 1);
    ctx.strokeStyle = '#703008';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, T - 1, T - 1);
    ctx.beginPath();
    ctx.moveTo(T / 2, 0); ctx.lineTo(T / 2, T);
    ctx.moveTo(0, T / 2); ctx.lineTo(T, T / 2);
    ctx.stroke();
  }

  _genTileQuestion(c, ctx) {
    const T = c.width;
    // Żółty blok
    ctx.fillStyle = '#F8B800';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#D09000';
    ctx.fillRect(2, 2, T - 4, T - 4);
    // Ciemna obwódka
    ctx.strokeStyle = '#202020';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, T - 2, T - 2);
    // Znak zapytania
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.round(T * 0.55)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', T / 2, T / 2 + 1);
  }

  _genTileUsed(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#C08000';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#A07000';
    ctx.fillRect(2, 2, T - 4, T - 4);
    ctx.strokeStyle = '#604000';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, T - 2, T - 2);
  }

  _genPipeTop(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#1A7018';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#38A038';
    ctx.fillRect(4, 4, T - 8, T - 4);
    // Kołnierz
    ctx.fillStyle = '#50C050';
    ctx.fillRect(0, T * 0.25, T, T * 0.25);
    ctx.fillStyle = '#28882A';
    ctx.fillRect(0, T * 0.25, 4, T * 0.25);
    ctx.fillRect(T - 4, T * 0.25, 4, T * 0.25);
  }

  _genPipe(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#1A7018';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#38A038';
    ctx.fillRect(5, 0, T - 10, T);
    ctx.fillStyle = '#60D060';
    ctx.fillRect(6, 0, 5, T);
  }

  _genCloud(c, ctx) {
    const T = c.width;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(T / 2, T / 2, T / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,230,255,0.6)';
    ctx.beginPath();
    ctx.arc(T / 2 - 6, T / 2 + 4, T / 4, 0, Math.PI * 2);
    ctx.arc(T / 2 + 6, T / 2 + 4, T / 4, 0, Math.PI * 2);
    ctx.fill();
  }

  _genCoin(c, ctx) {
    const T = c.width;
    const cx = T / 2, cy = T / 2, r = T / 2 - 4;
    const g = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r);
    g.addColorStop(0, '#FFFF80');
    g.addColorStop(0.5, '#F8D800');
    g.addColorStop(1, '#C09000');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#C09000';
    ctx.font = `bold ${Math.round(r)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy + 1);
  }

  _genTileUnderground(c, ctx) {
    const T = c.width;
    const scale = T / 32;

    // Podkład ziemi (brązowy) – same as ground but WITHOUT grass
    ctx.fillStyle = '#C84C0C';
    ctx.fillRect(0, 0, T, T);

    // Tekstura ziemi - małe cegiełki/kamienie
    ctx.fillStyle = '#943A0A';
    for (let y = 2 * scale; y < T; y += 8 * scale) {
      for (let x = (y % 16 === 0 ? 0 : 4 * scale); x < T; x += 8 * scale) {
        ctx.fillRect(x, y, 3 * scale, 3 * scale);
      }
    }

    // Darker spots for depth variation
    ctx.fillStyle = '#7A2E08';
    for (let y = 6 * scale; y < T; y += 12 * scale) {
      for (let x = 2 * scale; x < T; x += 10 * scale) {
        ctx.fillRect(x, y, 2 * scale, 2 * scale);
      }
    }

    // Subtle border
    ctx.strokeStyle = '#703008';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, T - 1, T - 1);
  }

  _genPipeVariant(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#404044';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#66666e';
    ctx.fillRect(5, 0, T - 10, T);
    ctx.fillStyle = '#9999a0';
    ctx.fillRect(6, 0, 5, T);
  }

  _genGoomba(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#A84000';
    ctx.beginPath();
    ctx.arc(T / 2, T / 2 - 4, T * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.fillRect(T / 2 - 8, T / 2 - 8, 4, 6);
    ctx.fillRect(T / 2 + 4, T / 2 - 8, 4, 6);
    ctx.fillStyle = '#000';
    ctx.fillRect(T / 2 - 7, T / 2 - 7, 2, 4);
    ctx.fillRect(T / 2 + 5, T / 2 - 7, 2, 4);
    ctx.fillStyle = '#502000';
    ctx.fillRect(16, T - 16, 12, 16);
    ctx.fillRect(T - 28, T - 16, 12, 16);
  }

  _genKoopa(c, ctx) {
    const T = c.width;
    ctx.fillStyle = '#30A030';
    ctx.beginPath();
    ctx.arc(T / 2, T / 2 + 4, T * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#50C050';
    ctx.beginPath();
    ctx.arc(T / 2 - 8, T / 2 - 12, T * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#206020';
    ctx.lineWidth = 2;
    ctx.strokeRect(T / 2 - 10, T / 2 - 4, 20, 20);
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(T / 2 - 10, T / 2 - 14, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Pomocnicza funkcja rysowania Mario na canvas sprite'a.
 */
function _drawMarioSprite(ctx, w, h, pose, facingRight = true) {
  const C = CONFIG.COLORS;
  ctx.clearRect(0, 0, w, h);

  const scale = w / 28;
  ctx.save();
  ctx.scale(scale, scale);

  // Flip horizontally if facing left
  if (!facingRight) {
    ctx.translate(28, 0);
    ctx.scale(-1, 1);
  }

  const pw = 28, ph = 32;

  // 1. CZAPKA I WŁOSY (CAP & HAIR)
  // Czapka góra (crown)
  ctx.fillStyle = C.PLAYER_BODY;
  ctx.fillRect(6, ph - 34, 14, 5);
  // Czapka rondo (visor)
  ctx.fillRect(6, ph - 30, 18, 3);

  // Włosy (hair)
  ctx.fillStyle = '#703000';
  ctx.fillRect(4, ph - 29, 4, 6);
  ctx.fillRect(6, ph - 26, 2, 4);

  // Ucho (ear)
  ctx.fillStyle = C.PLAYER_SKIN;
  ctx.fillRect(8, ph - 26, 2, 3);

  // 2. TWARZ (FACE)
  ctx.fillStyle = C.PLAYER_SKIN;
  ctx.fillRect(10, ph - 28, 10, 8);
  // Nos (nose)
  ctx.fillRect(20, ph - 26, 4, 4);

  // Wąsy (mustache)
  ctx.fillStyle = '#703000';
  ctx.fillRect(16, ph - 23, 6, 2);

  // Oko (eye)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(14, ph - 27, 2, 3);
  ctx.fillStyle = '#000000';
  ctx.fillRect(15, ph - 27, 1, 2);

  // 3. KOSZULA (SHIRT BODY)
  ctx.fillStyle = C.PLAYER_BODY;
  ctx.fillRect(8, ph - 20, 10, 7);

  // Ręce i Nogi w zależności od pozy
  if (pose === 'dead') {
    // Nogi
    ctx.fillStyle = '#703000';
    ctx.fillRect(4, ph - 6, 8, 6);
    ctx.fillRect(14, ph - 6, 8, 6);
    // Spodnie
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(6, ph - 14, 16, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(2, ph - 20, 4, 8);
    ctx.fillRect(20, ph - 20, 4, 8);
  } else if (pose === 'jump') {
    // Spodnie
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(7, ph - 16, 12, 10);
    // Lewe ramię (z tyłu)
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(4, ph - 26, 4, 8);
    // Prawe ramię (z przodu)
    ctx.fillRect(18, ph - 26, 4, 8);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(5, ph - 10, 6, 5);
    ctx.fillRect(15, ph - 11, 6, 5);
  } else if (pose === 'walk1') {
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(6, ph - 14, 14, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(3, ph - 18, 4, 7);
    ctx.fillRect(17, ph - 20, 4, 7);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(2, ph - 6, 8, 6);
    ctx.fillRect(16, ph - 6, 8, 6);
  } else if (pose === 'walk2') {
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(7, ph - 14, 12, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(5, ph - 20, 4, 8);
    ctx.fillRect(15, ph - 20, 4, 8);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(4, ph - 6, 8, 6);
    ctx.fillRect(12, ph - 6, 8, 6);
  } else if (pose === 'walk3') {
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(6, ph - 14, 14, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(17, ph - 18, 4, 7);
    ctx.fillRect(3, ph - 20, 4, 7);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(16, ph - 6, 8, 6);
    ctx.fillRect(2, ph - 6, 8, 6);
  } else if (pose === 'walk4') {
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(7, ph - 14, 12, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(6, ph - 19, 4, 8);
    ctx.fillRect(14, ph - 21, 4, 8);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(6, ph - 6, 8, 6);
    ctx.fillRect(10, ph - 6, 8, 6);
  } else {
    // Idle
    ctx.fillStyle = C.PLAYER_OVERALLS;
    ctx.fillRect(7, ph - 14, 12, 9);
    // Ręce
    ctx.fillStyle = C.PLAYER_BODY;
    ctx.fillRect(5, ph - 20, 4, 8);
    ctx.fillRect(17, ph - 20, 4, 8);
    // Stopy
    ctx.fillStyle = '#703000';
    ctx.fillRect(3, ph - 6, 8, 6);
    ctx.fillRect(13, ph - 6, 8, 6);
  }

  // Odcień po śmierci
  if (pose === 'dead') {
    ctx.fillStyle = 'rgba(255,0,0,0.3)';
    ctx.fillRect(0, 0, pw, ph);
  }

  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
//  PARTICLE SYSTEM – efekty wizualne
// ─────────────────────────────────────────────────────────────────────────────

class ParticleSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.particles = [];
    this.pool = [];
    this.MAX_PARTICLES = 200; // cap particles for performance
  }


  /**
   * Dodaj partię cząstek.
   * @param {number} x, y - pozycja
   * @param {string} type - 'brick' | 'coin' | 'score' | 'sparkle'
   * @param {*}      data - dodatkowe dane (np. tekst punktów)
   */
  spawn(x, y, type, data) {
    // Reuse particle from pool if available
    if (this.particles.length >= this.MAX_PARTICLES) return;
    let p;
    if (this.pool.length > 0) {
      p = this.pool.pop();
      // reset properties
      p.type = type;
      p.x = x;
      p.y = y;
      p.life = 0;
    } else {
      p = { type, x, y, life: 0 };
    }
    switch (type) {
      case 'brick':
        for (let i = 0; i < 4; i++) {
          const angle = (Math.PI / 2) + (i * Math.PI / 2) + Math.random() * 0.3;
          const speed = 3 + Math.random() * 3;
          p = Object.assign(p, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 4,
            life: 40,
            maxLife: 40,
            size: 6 + Math.random() * 4,
            color: ['#C84C0C', '#A03808', '#E06020'][Math.floor(Math.random() * 3)],
            type: 'brick'
          });
          this.particles.push(p);
        }
        break;
      case 'coin':
        p = Object.assign(p, { vx: 0, vy: -9, life: 45, maxLife: 45, size: 10, type: 'coin' });
        this.particles.push(p);
        break;
      case 'score':
        p = Object.assign(p, { vx: 0, vy: -1.5, life: 50, maxLife: 50, text: '+' + data, size: 14, color: '#FFFF00', type: 'score' });
        this.particles.push(p);
        break;
      case 'sparkle':
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          p = Object.assign(p, {
            vx: Math.cos(angle) * 2.5,
            vy: Math.sin(angle) * 2.5,
            life: 20,
            maxLife: 20,
            size: 4,
            color: '#FFFF00',
            type: 'sparkle'
          });
          this.particles.push(p);
        }
        break;
      case 'stomp':
        for (let i = 0; i < 5; i++) {
          p = Object.assign(p, {
            vx: (Math.random() - 0.5) * 4,
            vy: -2 - Math.random() * 3,
            life: 25,
            maxLife: 25,
            size: 5,
            color: '#FF8800',
            type: 'sparkle'
          });
          this.particles.push(p);
        }
        break;
    }
  }

  update() {
    this.particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.4; // gravity
      p.life--;
    });
    // recycle dead particles back to pool
    const alive = [];
    this.particles.forEach(p => {
      if (p.life > 0) {
        alive.push(p);
      } else {
        this.pool.push(p);
      }
    });
    this.particles = alive;
  }

  draw(camX) {
    const ctx = this.ctx;

    this.particles.forEach(p => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;

      const px = p.x - camX;

      switch (p.type) {
        case 'brick':
          ctx.fillStyle = p.color;
          ctx.fillRect(px - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;

        case 'coin':
          // Moneta wyskakująca z bloku
          const r = p.size * alpha;
          ctx.fillStyle = CONFIG.COLORS.COIN;
          ctx.beginPath();
          ctx.arc(px, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFFF80';
          ctx.beginPath();
          ctx.arc(px - 2, p.y - 2, r * 0.4, 0, Math.PI * 2);
          ctx.fill();
          break;

        case 'score':
          ctx.fillStyle = p.color;
          ctx.font = `bold ${p.size}px "Press Start 2P", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, px, p.y);
          break;

        case 'sparkle':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(px, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
          break;
      }

      ctx.restore();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  GAME – główna klasa gry
// ─────────────────────────────────────────────────────────────────────────────

class Game {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // Ustaw rozmiar canvas z konfiguracji
    this.canvas.width = CONFIG.CANVAS.WIDTH;
    this.canvas.height = CONFIG.CANVAS.HEIGHT;

    // ── Moduły ────────────────────────────────────────────────
    this.input = new InputManager();
    this.sprites = new SpriteRenderer();
    this.particles = new ParticleSystem(this.ctx);

    this.level = null;
    this.player = null;
    this.enemies = null;

    // ── Audio ─────────────────────────────────────────────────
    this.audio = new AudioManager();

    // ── Stan gry ──────────────────────────────────────────────
    // 'loading' | 'menu' | 'playing' | 'paused' | 'dead' | 'gameover' | 'win' | 'levelcomplete'
    this.state = 'loading';

    this.currentLevelIndex = 0;  // indeks aktualnego poziomu
    this.levelTransTimer = 0;  // timer przejścia między poziomami

    // Wybór w menu
    this.menuSelectedIndex = 0; // 0 = LEVEL, 1 = DIFFICULTY, 2 = START GAME
    this.selectedLevelOption = 0; // 0..4 (poziomy 1-5)
    this.selectedDifficultyOption = 0; // 0 = EASY
  }

  // ─────────────────────────────────────────────────────────────
  //  INICJALIZACJA
  // ─────────────────────────────────────────────────────────────

  async init() {
    this.state = 'loading';
    this._drawLoading();

    // Wczytaj sprite'y
    await this.sprites.loadAll();

    this.state = 'menu';
    this._startLoop();
  }

  _startLoop() {
    const MAX_FPS = 60;
    const FRAME_DURATION = 1000 / MAX_FPS;
    let lastFrame = 0;
    const loop = (timestamp) => {
      const dt = timestamp - this.lastTime;
      this.lastTime = timestamp;
      // Throttle to target FPS
      if (timestamp - lastFrame >= FRAME_DURATION) {
        lastFrame = timestamp;
        // FPS counter unchanged
        this.fpsCount++;
        this.fpsTimer += dt;
        if (this.fpsTimer >= 1000) {
          this.fps = this.fpsCount;
          this.fpsCount = 0;
          this.fpsTimer = 0;
        }
        this.update();
        this.draw();
        this.input.flush();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ─────────────────────────────────────────────────────────────
  //  ŁADOWANIE POZIOMU
  // ─────────────────────────────────────────────────────────────

  async loadLevel(index) {
    this.state = 'loading';
    this.currentLevelIndex = index;

    // Stop background music before loading level
    this.audio.stopBgm();

    // Preserve lives across level restarts
    const previousLives = this.player ? this.player.lives : undefined;

    const path = CONFIG.LEVELS[index];
    this.level = new Level(this.ctx, this.sprites);
    this.player = new Player(this.ctx, this.sprites, this.input);
    // Restore lives if we had them from a previous level
    if (typeof previousLives === 'number') {
      this.player.lives = previousLives;
    }
    this.enemies = new EnemyManager(this.ctx, this.sprites);
    this.particles = new ParticleSystem(this.ctx);

    await this.level.load(path);

    // Set player start position
    this.player.spawn(this.level.spawnX, this.level.spawnY);

    // Spawn enemies for this level
    this.enemies.spawn(this.level.enemies);

    // Apply difficulty settings only on first load (no previous lives)
    const diff = this.difficulty || 'hard';
    if (typeof previousLives !== 'number') {
      if (diff === 'easy') {
        this.player.lives = 5;
        // Slow enemies by 30%
        this.enemies.enemies.forEach(e => {
          if (e.speed) e.speed *= 0.7;
        });
        // Extend time by 60 seconds
        this.level.timeLeft += 60;
        this.level.timeLimit += 60;
      } else if (diff === 'hard') {
        this.player.lives = 3;
      } else if (diff === 'impossible') {
        this.player.lives = 1;
        // Speed enemies up by 50%
        this.enemies.enemies.forEach(e => {
          if (e.speed) e.speed *= 1.5;
        });
        // Reduce time by 60 seconds (minimum 60s)
        this.level.timeLeft = Math.max(60, this.level.timeLeft - 60);
        this.level.timeLimit = Math.max(60, this.level.timeLimit - 60);
      }
    }

    // Reset camera and timers
    this.camX = 0;
    this.deathTimer = 0;
    this.levelTransTimer = 0;

    this.state = 'playing';

    // Start background music
    this.audio.startBgm();
  }

  // ─────────────────────────────────────────────────────────────
  //  RESTART POZIOMU (po śmierci)
  // ─────────────────────────────────────────────────────────────

  restartLevel() {
    if (this.player && this.player.lives <= 0) {
      this.state = 'gameover';
      this.audio.playGameOver();
      return;
    }
    const savedLives = this.player ? this.player.lives : undefined;
    this.loadLevel(this.currentLevelIndex).then(() => {
      if (typeof savedLives === 'number') {
        this.player.lives = savedLives;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  NASTĘPNY POZIOM
  // ─────────────────────────────────────────────────────────────

  nextLevel() {
    const next = this.currentLevelIndex + 1;
    if (next < CONFIG.LEVELS.length) {
      // Przenieś wynik i życia do następnego poziomu
      const score = this.player.score;
      const coins = this.player.coins;
      const lives = this.player.lives;

      this.loadLevel(next).then(() => {
        this.player.score = score;
        this.player.coins = coins;
        this.player.lives = lives;
      });
    } else {
      // Ukończono wszystkie poziomy
      this.state = 'win';
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  CALLBACK: uderzenie bloku z pytajnikiem
  // ─────────────────────────────────────────────────────────────

  hitQuestionBlock(col, row) {
    const T = CONFIG.CANVAS.TILE_SIZE;
    const px = col * T + T / 2;
    const py = row * T;

    // Wyskocz moneta
    this.particles.spawn(px, py, 'coin');
    this.particles.spawn(px, py - 16, 'score', CONFIG.SCORE.QUESTION_ITEM);
    this.player.addScore(CONFIG.SCORE.QUESTION_ITEM);
    this.player.collectCoin();

    // Dźwięk monety
    this.audio.playCoin();
  }

  // ─────────────────────────────────────────────────────────────
  //  CALLBACK: rozbicie cegły
  // ─────────────────────────────────────────────────────────────

  spawnBrickParticles(col, row) {
    const T = CONFIG.CANVAS.TILE_SIZE;
    const px = col * T + T / 2;
    const py = row * T + T / 2;
    this.particles.spawn(px, py, 'brick');
    this.player.addScore(50);

    // Dźwięk rozbicia bloku
    this.audio.playBreak();
  }

  // ─────────────────────────────────────────────────────────────
  //  GŁÓWNA PĘTLA UPDATE
  // ─────────────────────────────────────────────────────────────

  update() {
    this.input.update();
    switch (this.state) {
      case 'menu':
        this._updateMenu();
        break;
      case 'playing':
        this._updatePlaying();
        break;
      case 'paused':
        this._updatePaused();
        break;
      case 'dead':
        this._updateDead();
        break;
      case 'gameover':
        this._updateGameOver();
        break;
      case 'levelcomplete':
        this._updateLevelComplete();
        break;
      case 'win':
        this._updateWin();
        break;
    }
  }

  _updateMenu() {
    // Nawigacja w menu góra/dół
    if (this.input.isPressed('ArrowUp') || this.input.isPressed('KeyW')) {
      this.menuSelectedIndex = (this.menuSelectedIndex - 1 + 3) % 3;
      if (this.audio) this.audio.playStomp(); // krótki klik
    } else if (this.input.isPressed('ArrowDown') || this.input.isPressed('KeyS')) {
      this.menuSelectedIndex = (this.menuSelectedIndex + 1) % 3;
      if (this.audio) this.audio.playStomp();
    }

    // Wybór opcji lewo/prawo
    if (this.menuSelectedIndex === 0) {
      // Wybór poziomu (1-5)
      if (this.input.isPressed('ArrowLeft') || this.input.isPressed('KeyA')) {
        this.selectedLevelOption = (this.selectedLevelOption - 1 + 5) % 5;
        if (this.audio) this.audio.playJump();
      } else if (this.input.isPressed('ArrowRight') || this.input.isPressed('KeyD')) {
        this.selectedLevelOption = (this.selectedLevelOption + 1) % 5;
        if (this.audio) this.audio.playJump();
      }
    } else if (this.menuSelectedIndex === 1) {
      // Wybór trudności
      if (this.input.isPressed('ArrowLeft') || this.input.isPressed('KeyA')) {
        this.selectedDifficultyOption = (this.selectedDifficultyOption - 1 + 3) % 3;
        if (this.audio) this.audio.playJump();
      } else if (this.input.isPressed('ArrowRight') || this.input.isPressed('KeyD')) {
        this.selectedDifficultyOption = (this.selectedDifficultyOption + 1) % 3;
        if (this.audio) this.audio.playJump();
      }
      this.difficulty = ['easy', 'hard', 'impossible'][this.selectedDifficultyOption];
    }

    // Zatwierdzenie
    if (this.input.isPressed('Enter') || this.input.isPressed('Space')) {
      if (this.menuSelectedIndex === 2 || this.input.isPressed('Enter')) {
        this.loadLevel(this.selectedLevelOption);
      }
    }
  }

  _updatePlaying() {
    const ctrl = CONFIG.CONTROLS;

    // Pauza
    if (this.input.isAnyPressed(ctrl.PAUSE)) {
      this.state = 'paused';
      this.audio.stopBgm(); // Zatrzymaj muzykę podczas pauzy
      return;
    }

    // Czas minął
    if (this.level.timeLeft <= 0 && !this.player.isDead) {
      this.player.die();
    }

    // Aktualizacja poziomu
    this.level.update();

    // Aktualizacja gracza
    this.player.update(this.level);

    // Aktualizacja wrogów
    this.enemies.update(this.level, this.camX);

    // Kolizje gracz ↔ wrogowie
    this.enemies.checkPlayerCollision(this.player);

    // Kolizje skorupa ↔ wrogowie
    this.enemies.checkShellCollisions();

    // Kolizje gracz ↔ monety
    this._checkCoinCollection();

    // Cząstki
    this.particles.update();

    // Aktualizuj kamerę
    this._updateCamera();

    // Gracz zginął → stan dead
    if (this.player.isDead) {
      this.deathTimer++;
      if (this.deathTimer > 90) {
        this.state = 'dead';
        this.deathTimer = 0;
      }
    }

    // Gracz wygrał poziom → stan levelcomplete
    if (this.player.isWinning) {
      this.levelTransTimer++;
      if (this.levelTransTimer > 120) {
        this.state = 'levelcomplete';
        this.levelTransTimer = 0;
      }
    }
  }

  _updatePaused() {
    const ctrl = CONFIG.CONTROLS;
    if (this.input.isAnyPressed(ctrl.PAUSE) ||
      this.input.isDown('Enter')) {
      this.state = 'playing';
      this.audio.startBgm(); // Wznów muzykę po wyjściu z pauzy
    }
  }

  _updateDead() {
    if (this.input.isAnyPressed(CONFIG.CONTROLS.JUMP) ||
      this.input.isDown('Enter')) {
      this.restartLevel();
    }
  }

  _updateGameOver() {
    if (this.input.isAnyPressed(CONFIG.CONTROLS.JUMP) ||
      this.input.isDown('Enter')) {
      this.state = 'menu';
    }
  }

  _updateLevelComplete() {
    this.levelTransTimer++;
    if (this.levelTransTimer > 180 ||
      this.input.isDown('Enter') ||
      this.input.isAnyPressed(CONFIG.CONTROLS.JUMP)) {
      this.nextLevel();
    }
  }

  _updateWin() {
    if (this.input.isAnyPressed(CONFIG.CONTROLS.JUMP) ||
      this.input.isDown('Enter')) {
      this.state = 'menu';
      this.currentLevelIndex = 0;
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  KAMERA
  // ─────────────────────────────────────────────────────────────

  _updateCamera() {
    const W = CONFIG.CANVAS.WIDTH;
    const target = this.player.x - W / 2 + CONFIG.CAMERA.LOOKAHEAD * (this.player.facingRight ? 0.5 : -0.5);
    const smoothed = this.camX + (target - this.camX) * CONFIG.CAMERA.SMOOTHING;

    const maxCamX = this.level.pixelWidth - W;
    this.camX = Math.max(0, Math.min(maxCamX, smoothed));
  }

  // ─────────────────────────────────────────────────────────────
  //  ZBIERANIE MONET
  // ─────────────────────────────────────────────────────────────

  _checkCoinCollection() {
    const p = this.player;

    this.level.coins.forEach(coin => {
      if (coin.collected) return;

      const T = CONFIG.CANVAS.TILE_SIZE;
      // Distance culling: skip check if coin is horizontally far from player
      if (Math.abs(coin.x - p.x) > T * 2) return;

      // Sprawdź nakładanie się prostokątów
      if (p.right > coin.x &&
        p.left < coin.x + T &&
        p.bottom > coin.y &&
        p.top < coin.y + T) {
        coin.collected = true;
        p.collectCoin();
        this.particles.spawn(coin.x + T / 2, coin.y, 'sparkle');
        this.particles.spawn(coin.x + T / 2, coin.y - 8, 'score', CONFIG.SCORE.COIN);

        // Dźwięk monety
        this.audio.playCoin();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  RYSOWANIE
  // ─────────────────────────────────────────────────────────────

  draw() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Wyczyść ekran
    ctx.clearRect(0, 0, W, H);

    switch (this.state) {
      case 'loading':
        this._drawLoading();
        break;
      case 'menu':
        this._drawMenu();
        break;
      case 'playing':
      case 'paused':
        this._drawGame();
        if (this.state === 'paused') this._drawPause();
        break;
      case 'dead':
        this._drawGame();
        this._drawDeadScreen();
        break;
      case 'gameover':
        this._drawGameOver();
        break;
      case 'levelcomplete':
        this._drawGame();
        this._drawLevelComplete();
        break;
      case 'win':
        this._drawWin();
        break;
    }


  }

  _drawGame() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Tło (gradient nieba)
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, CONFIG.COLORS.SKY_TOP);
    gradient.addColorStop(1, CONFIG.COLORS.SKY_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Chmury dekoracyjne (parallax)
    this._drawBackgroundClouds();

    // Poziom (kafelki)
    if (this.level) this.level.draw(this.camX);

    // Cząstki (za graczem)
    if (this.particles) this.particles.draw(this.camX);

    // Wrogowie
    if (this.enemies) this.enemies.draw(this.camX);

    // Gracz
    if (this.player) this.player.draw(this.camX);

    // HUD
    this._drawHUD();
  }

  /**
   * Rysuje dekoracyjne chmury na tle z efektem parallax.
   */
  _drawBackgroundClouds() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;
    const camX = this.camX;

    // Statyczne pozycje chmur (oparte o pozycję kamery z przesunięciem parallax)
    const cloudDefs = [
      { x: 120, y: 60, r: 28 },
      { x: 340, y: 45, r: 22 },
      { x: 560, y: 70, r: 32 },
      { x: 780, y: 50, r: 20 },
      { x: 990, y: 65, r: 26 },
      { x: 1200, y: 40, r: 30 },
      { x: 1450, y: 55, r: 24 },
      { x: 1700, y: 45, r: 28 },
      { x: 1950, y: 65, r: 22 },
      { x: 2200, y: 50, r: 32 },
    ];

    ctx.fillStyle = 'rgba(255,255,255,0.88)';

    cloudDefs.forEach(cd => {
      // Parallax: chmury przesuwają się wolniej niż poziom
      const cx = cd.x - camX * 0.35;
      // Zawijaj chmury
      const wrappedX = ((cx % (W + 80)) + W + 80) % (W + 80) - 40;

      ctx.beginPath();
      ctx.arc(wrappedX, cd.y, cd.r * 1.0, 0, Math.PI * 2);
      ctx.arc(wrappedX + 30, cd.y - 6, cd.r * 0.8, 0, Math.PI * 2);
      ctx.arc(wrappedX - 28, cd.y + 2, cd.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  HUD (ekran informacyjny)
  // ─────────────────────────────────────────────────────────────

  _drawHUD() {
    if (!this.player || !this.level) return;

    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;

    // Pasek HUD – ciemne tło
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, W, 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';

    // Wynik
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', 10, 6);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(String(this.player.score).padStart(6, '0'), 10, 22);

    // Monety
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('× ' + String(this.player.coins).padStart(2, '0'), W / 2 - 40, 14);
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('★', W / 2 - 66, 12);

    // Czas
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TIME', W / 2 + 60, 6);
    const timeColor = this.level.timeLeft < 60 ? '#FF4444' : '#FFD700';
    ctx.fillStyle = timeColor;
    ctx.fillText(String(this.level.timeLeft).padStart(3, '0'), W / 2 + 60, 22);

    // Życia
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText('MARIAN', W - 10, 6);
    ctx.fillStyle = '#FF6060';
    ctx.fillText('♥ × ' + this.player.lives, W - 10, 22);

    // Nazwa poziomu
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`WORLD ${this.currentLevelIndex + 1}-1`, W / 2, 28);
  }

  // ─────────────────────────────────────────────────────────────
  //  EKRANY SPECJALNE
  // ─────────────────────────────────────────────────────────────

  _drawLoading() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0a2e');
    g.addColorStop(1, '#16213e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ŁADOWANIE...', W / 2, H / 2);
  }

  _drawMenu() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    // Tło gradientowe
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#A0A0A0');
    g.addColorStop(0.5, '#707070');
    g.addColorStop(1, '#404040');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Chmury dekoracyjne
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    [[120, 80, 30], [300, 60, 24], [550, 90, 28], [700, 70, 20]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + 28, y - 8, r * 0.75, 0, Math.PI * 2);
      ctx.arc(x - 24, y + 4, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });

    // Ziemia na dole menu
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, H - 64, W, 10);
    ctx.fillStyle = '#81C784';
    ctx.fillRect(0, H - 54, W, 54);

    // Bloki dekoracyjne
    [[60, H - 160, '#F8B800', '?'], [200, H - 192, '#C84C0C', ''], [200, H - 160, '#C84C0C', ''],
    [232, H - 160, '#C84C0C', ''], [264, H - 192, '#F8B800', '?']].forEach(([x, y, clr, txt]) => {
      ctx.fillStyle = clr;
      ctx.fillRect(x, y, 32, 32);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, 32, 32);
      if (txt) {
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 16, y + 16);
      }
    });

    // Tytuł – cień
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 44px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUPER MARIAN DELUX', W / 2 + 3, H / 2 - 120 + 3);

    // Tytuł – czerwona ramka
    ctx.fillStyle = '#E80000';
    ctx.fillText('SUPER MARIAN DELUX', W / 2, H / 2 - 120);

    // Podtytuł
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.fillText('WYBÓR POZIOMU I TRUDNOŚCI', W / 2, H / 2 - 75);

    // Rysowanie opcji interaktywnych
    const optionsY = [H / 2 - 35, H / 2 + 10, H / 2 + 65];

    // Opcja 0: LEVEL
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = (this.menuSelectedIndex === 0) ? '#FFFF00' : '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText((this.menuSelectedIndex === 0 ? '▶ ' : '') + 'POZIOM: ', W / 2 - 40, optionsY[0]);

    ctx.textAlign = 'left';
    for (let i = 0; i < 5; i++) {
      const isSelectedVal = (this.selectedLevelOption === i);
      ctx.fillStyle = isSelectedVal ? '#FFFF00' : '#D0D0D0';
      let valText = ` [${i + 1}] `;
      if (isSelectedVal && this.menuSelectedIndex === 0) {
        const blink = Math.floor(Date.now() / 200) % 2 === 0;
        valText = blink ? `▶[${i + 1}]◀` : ` [${i + 1}] `;
      }
      ctx.fillText(valText, W / 2 - 30 + i * 45, optionsY[0]);
    }

    // Opcja 1: DIFFICULTY
    ctx.fillStyle = (this.menuSelectedIndex === 1) ? '#FFFF00' : '#FFFFFF';
    ctx.textAlign = 'right';
    ctx.fillText((this.menuSelectedIndex === 1 ? '▶ ' : '') + 'TRUDNOŚĆ: ', W / 2 - 40, optionsY[1]);

    ctx.textAlign = 'left';
    const diffs = ['LATWY', 'TRUDNY', 'KOSZMAR'];
    let xOffset = -30;
    diffs.forEach((dName, idx) => {
      const isSelectedVal = (this.selectedDifficultyOption === idx);
      ctx.fillStyle = isSelectedVal ? '#FFFF00' : '#D0D0D0';
      let valText = ` [${dName}] `;
      if (isSelectedVal && this.menuSelectedIndex === 1) {
        const blink = Math.floor(Date.now() / 200) % 2 === 0;
        valText = blink ? `▶[${dName}]◀` : ` [${dName}] `;
      }
      ctx.fillText(valText, W / 2 + xOffset, optionsY[1]);
      xOffset += dName.length * 10 + 40;
    });

    // Opcja 2: START GAME
    ctx.textAlign = 'center';
    ctx.fillStyle = (this.menuSelectedIndex === 2) ? '#FFFF00' : '#FFFFFF';
    let startText = '  URUCHOM GRĘ  ';
    if (this.menuSelectedIndex === 2) {
      const blink = Math.floor(Date.now() / 200) % 2 === 0;
      startText = blink ? '▶ URUCHOM GRĘ ◀' : '  URUCHOM GRĘ  ';
    }
    ctx.fillText(startText, W / 2, optionsY[2]);

    // ── Stylish info panel (glassmorphism) ──────────────────────
    const panelW = 500, panelH = 64;
    const panelX = W / 2 - panelW / 2;
    const panelY = H / 2 + 96;
    const panelR = 14; // corner radius

    // Animated glow behind panel
    const glowPhase = (Math.sin(Date.now() / 800) + 1) / 2; // 0..1
    ctx.save();
    ctx.shadowColor = `rgba(255, 215, 0, ${0.3 + glowPhase * 0.4})`;
    ctx.shadowBlur = 18 + glowPhase * 10;

    // Panel background – dark glass
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, panelR);
    ctx.fillStyle = 'rgba(10, 10, 30, 0.72)';
    ctx.fill();
    ctx.restore();

    // Gradient border
    const borderGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    borderGrad.addColorStop(0, '#FFD700');
    borderGrad.addColorStop(0.5, '#FF6B35');
    borderGrad.addColorStop(1, '#FFD700');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, panelR);
    ctx.stroke();

    // Inner subtle highlight line at top
    ctx.beginPath();
    ctx.roundRect(panelX + 2, panelY + 2, panelW - 4, panelH / 2 - 2, [panelR - 2, panelR - 2, 0, 0]);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();

    // Key icons helper
    const drawKey = (cx, cy, label) => {
      const kw = Math.max(ctx.measureText(label).width + 10, 22);
      const kh = 16;
      ctx.beginPath();
      ctx.roundRect(cx - kw / 2, cy - kh / 2, kw, kh, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#FFD700';
      ctx.fillText(label, cx, cy);
    };

    // Top line — controls
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const row1Y = panelY + 20;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    drawKey(W / 2 - 190, row1Y, 'W');
    drawKey(W / 2 - 165, row1Y, 'S');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('/ \u2191\u2193  nawigacja', W / 2 - 100, row1Y);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('|', W / 2 - 16, row1Y);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    drawKey(W / 2 + 20, row1Y, 'A');
    drawKey(W / 2 + 45, row1Y, 'D');
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('/ \u2190\u2192  zmiana opcji', W / 2 + 130, row1Y);

    // Bottom line — CTA with pulse
    const row2Y = panelY + 44;
    const ctaPulse = 0.6 + 0.4 * Math.sin(Date.now() / 400);
    ctx.globalAlpha = ctaPulse;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.fillText('\u25B6  ENTER / SPACJA \u2013 ROZPOCZNIJ GR\u0118  \u25C0', W / 2, row2Y);
    ctx.globalAlpha = 1;

    // Autor
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Pure HTML5 + Vanilla JS  •  Brak backendu', W / 2, H - 12);
  }

  _drawPause() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUZA', W / 2, H / 2 - 20);

    const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 500);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px "Press Start 2P", monospace';
    ctx.fillText('P / ESC – WZNÓW', W / 2, H / 2 + 30);
    ctx.globalAlpha = 1;
  }

  _drawDeadScreen() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FF4444';
    ctx.font = 'bold 32px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER!', W / 2, H / 2 - 40);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px "Press Start 2P", monospace';
    ctx.fillText(`Żyć pozostało: ${this.player ? this.player.lives : 0}`, W / 2, H / 2 + 10);

    const pulse = 0.4 + 0.6 * Math.sin(Date.now() / 400);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 13px "Press Start 2P", monospace';
    ctx.fillText('SPACJA / ENTER – SPRÓBUJ PONOWNIE', W / 2, H / 2 + 50);
    ctx.globalAlpha = 1;
  }

  _drawGameOver() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0000');
    g.addColorStop(1, '#4a0000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FF2222';
    ctx.font = 'bold 48px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 50);

    ctx.fillStyle = '#FFD700';
    ctx.font = '16px "Press Start 2P", monospace';
    if (this.player) {
      ctx.fillText(`WYNIK: ${this.player.score}`, W / 2, H / 2 + 10);
      ctx.fillText(`MONETY: ${this.player.coins}`, W / 2, H / 2 + 40);
    }

    const pulse = 0.4 + 0.6 * Math.sin(Date.now() / 500);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillText('SPACJA / ENTER – MENU GŁÓWNE', W / 2, H / 2 + 90);
    ctx.globalAlpha = 1;
  }

  _drawLevelComplete() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POZIOM UKOŃCZONY!', W / 2, H / 2 - 50);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px "Press Start 2P", monospace';
    if (this.player) {
      ctx.fillText(`WYNIK: ${this.player.score}`, W / 2, H / 2);
      ctx.fillText(`MONETY: ${this.player.coins}`, W / 2, H / 2 + 30);
    }

    const pulse = 0.4 + 0.6 * Math.sin(Date.now() / 400);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#88FF88';
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillText('ENTER / SPACJA – NASTĘPNY POZIOM', W / 2, H / 2 + 80);
    ctx.globalAlpha = 1;
  }

  _drawWin() {
    const ctx = this.ctx;
    const W = CONFIG.CANVAS.WIDTH;
    const H = CONFIG.CANVAS.HEIGHT;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#002200');
    g.addColorStop(1, '#004400');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Confetti efekt
    for (let i = 0; i < 60; i++) {
      const hue = (Date.now() / 20 + i * 6) % 360;
      ctx.fillStyle = `hsl(${hue},100%,60%)`;
      const x = (Math.sin(i * 2.3 + Date.now() / 300) * 0.5 + 0.5) * W;
      const y = ((Date.now() / 800 + i * 0.05) % 1) * H;
      ctx.fillRect(x, y, 5, 10);
    }

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GRATULACJE!', W / 2, H / 2 - 70);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.fillText('WSZYSTKIE POZIOMY UKOŃCZONE!', W / 2, H / 2 - 20);

    if (this.player) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '14px "Press Start 2P", monospace';
      ctx.fillText(`FINALNY WYNIK: ${this.player.score}`, W / 2, H / 2 + 20);
      ctx.fillText(`MONETY: ${this.player.coins}`, W / 2, H / 2 + 50);
    }

    const pulse = 0.4 + 0.6 * Math.sin(Date.now() / 400);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#88FF88';
    ctx.font = 'bold 11px "Press Start 2P", monospace';
    ctx.fillText('ENTER / SPACJA – MENU GŁÓWNE', W / 2, H / 2 + 100);
    ctx.globalAlpha = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  URUCHOMIENIE GRY – po załadowaniu DOM
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game('gameCanvas');
  game.init();
});
