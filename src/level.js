/**
 * level.js - Moduł zarządzający poziomami gry
 *
 * Odpowiada za:
 * - Wczytywanie plików JSON z definicją poziomu
 * - Parsowanie mapy kafelków (tile map)
 * - Rysowanie kafelków na canvas
 * - Sprawdzanie kolizji gracza/wrogów z kafelkami
 */

class Level {
  /**
   * @param {CanvasRenderingContext2D} ctx  - kontekst rysowania canvas
   * @param {SpriteRenderer} sprites        - rejestr sprite'ów
   */
  constructor(ctx, sprites) {
    this.ctx     = ctx;
    this.sprites = sprites;

    // Dane wczytane z JSON
    this.data        = null;  // surowy obiekt JSON
    this.tileMap     = [];    // dwuwymiarowa tablica ID kafelków
    this.mapWidth    = 0;     // szerokość mapy w kafelkach
    this.mapHeight   = 0;     // wysokość mapy w kafelkach
    this.pixelWidth  = 0;     // szerokość mapy w pikselach
    this.pixelHeight = 0;     // wysokość mapy w pikselach

    // Obiekty poziomu
    this.coins       = [];    // tablica monet  [{x, y, collected}]
    this.enemies     = [];    // lista wroga (obiektów Enemy)
    this.pipes       = [];    // rury [{x, y, w, h}]
    this.flagX       = 0;     // pozycja X masztu flagi (cel poziomu)
    this.spawnX      = 64;    // pozycja startowa gracza X
    this.spawnY      = 128;   // pozycja startowa gracza Y

    // Bloki z pytajnikami [{x, y, hit: bool}]
    this.questionBlocks = [];

    // Czas na poziomie (sekundy)
    this.timeLimit   = 300;
    this.timeLeft    = 300;
    this.lastTick    = 0;

    // Czy poziom ukończony
    this.completed   = false;

    // Granica śmierci – gracz spada poniżej tej wartości Y → śmierć
    this.deathY      = 0;

    const T = CONFIG.CANVAS.TILE_SIZE;

    // Słownik typów kafelków:
    // Każdy ID kafelka ma: solid (kolizja), sprite (nazwa tekstury)
    this.TILE_TYPES = {
      0:  { solid: false, sprite: null,            label: 'powietrze'     },
      1:  { solid: true,  sprite: 'tile_ground',   label: 'ziemia'        },
      2:  { solid: true,  sprite: 'tile_brick',    label: 'cegła'         },
      3:  { solid: true,  sprite: 'tile_question', label: 'blok ?'        },
      4:  { solid: true,  sprite: 'tile_ground',   label: 'ziemia twarda' },
      5:  { solid: true,  sprite: 'tile_pipe_top', label: 'rura (góra)'   },
      6:  { solid: true,  sprite: 'tile_pipe',     label: 'rura (ciało)'  },
      7:  { solid: false, sprite: 'tile_coin',     label: 'moneta'        },
      8:  { solid: false, sprite: null,            label: 'spawn'         },
      9:  { solid: false, sprite: null,            label: 'flaga'         },
      10: { solid: true,  sprite: 'tile_used',     label: 'blok zużyty'   },
      11: { solid: true,  sprite: 'tile_cloud',    label: 'chmura'        },
      12: { solid: true,  sprite: 'tile_underground', label: 'ziemia podziemna' },
      13: { solid: true,  sprite: 'tile_pipe_variant', label: 'rura wariant' },
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  WCZYTYWANIE POZIOMU Z JSON
  // ─────────────────────────────────────────────────────────────

  /**
   * Wczytuje dane poziomu.
   *
   * Strategia ładowania (w tej kolejności):
   *  1. Sprawdź window.LEVEL_DATA[path] – dane wbudowane jako JS
   *     (działa lokalnie bez serwera HTTP, po otwarciu index.html)
   *  2. Jeśli brak, spróbuj fetch() – działa gdy uruchomiony serwer HTTP
   *
   * @param {string} path - klucz / ścieżka do poziomu (np. 'maps/level1.json')
   * @returns {Promise<void>}
   */
  async load(path) {
    // ── Wariant 0: dane z localStorage (nadpisanie edytorem) ──
    const localOverride = localStorage.getItem(`marian_delux_level_${path}`);
    if (localOverride) {
      try {
        this.data = JSON.parse(localOverride);
        this._parse();
        return;
      } catch (err) {
        console.error("Błąd wczytywania poziomu z localStorage:", err);
      }
    }

    // ── Wariant 1: dane wbudowane w JS (bez serwera) ─────────
    if (window.LEVEL_DATA && window.LEVEL_DATA[path]) {
      this.data = window.LEVEL_DATA[path];
      this._parse();
      return;
    }

    // ── Wariant 2: fetch (gdy działa serwer HTTP) ─────────────
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.data = await response.json();
      this._parse();
    } catch (err) {
      throw new Error(
        `Nie można wczytać poziomu "${path}".\n` +
        `Upewnij się, że plik maps/level1.js jest dołączony w index.html.\n` +
        `Szczegóły: ${err.message}`
      );
    }
  }

  /**
   * Parsuje wczytane dane JSON i wypełnia struktury danych.
   */
  _parse() {
    const d = this.data;
    const T = CONFIG.CANVAS.TILE_SIZE;

    this.tileMap    = d.tileMap;
    this.mapHeight  = this.tileMap.length;
    this.mapWidth   = this.tileMap[0].length;
    this.pixelWidth  = this.mapWidth  * T;
    this.pixelHeight = this.mapHeight * T;
    this.deathY      = this.pixelHeight + T * 2; // poniżej dna mapy

    this.timeLimit = d.timeLimit || 300;
    this.timeLeft  = this.timeLimit;
    this.lastTick  = Date.now();

    // Parsuj obiekty poziomu (monety, wrogowie, spawn, flaga)
    this.coins          = [];
    this.enemies        = [];
    this.questionBlocks = [];
    this.pipes          = [];
    this.completed      = false;

    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = 0; col < this.mapWidth; col++) {
        const id = this.tileMap[row][col];
        const px = col * T;
        const py = row * T;

        if (id === 7) {
          // Moneta – zapisz pozycję, zamień kafelek na powietrze
          this.coins.push({ x: px, y: py, collected: false, animFrame: 0 });
          this.tileMap[row][col] = 0;
        } else if (id === 8) {
          // Punkt startowy gracza
          this.spawnX = px;
          this.spawnY = py;
          this.tileMap[row][col] = 0;
        } else if (id === 9) {
          // Maszt flagi
          this.flagX = px;
          this.tileMap[row][col] = 0;
        } else if (id === 3) {
          // Blok z pytajnikiem
          this.questionBlocks.push({ col, row, x: px, y: py, hit: false });
        }
      }
    }

    // Wrogowie zdefiniowani osobno w JSON
    if (d.enemies) {
      d.enemies.forEach(e => {
        this.enemies.push({
          type:      e.type || 'goomba',
          x:         e.x * T,
          y:         e.y * T,
          startX:    e.x * T,
          startY:    e.y * T,
          patrolMin: (e.patrolMin || e.x - 3) * T,
          patrolMax: (e.patrolMax || e.x + 3) * T,
        });
      });
    }

    // Rury zdefiniowane osobno
    if (d.pipes) {
      d.pipes.forEach(p => {
        this.pipes.push({
          x: p.x * T,
          y: p.y * T,
          w: (p.w || 2) * T,
          h: (p.h || 2) * T,
        });
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  DOSTĘP DO KAFELKÓW
  // ─────────────────────────────────────────────────────────────

  /**
   * Pobiera ID kafelka na pozycji (col, row).
   * @returns {number} ID kafelka lub 0 (powietrze) jeśli poza mapą
   */
  getTile(col, row) {
    if (row < 0 || row >= this.mapHeight) return 0;
    if (col < 0 || col >= this.mapWidth)  return 0;
    return this.tileMap[row][col];
  }

  /**
   * Ustawia ID kafelka na pozycji (col, row).
   */
  setTile(col, row, id) {
    if (row >= 0 && row < this.mapHeight &&
        col >= 0 && col < this.mapWidth) {
      this.tileMap[row][col] = id;
    }
  }

  /**
   * Czy kafelek na pozycji (col, row) jest solidny (koliduje).
   */
  isSolid(col, row) {
    const id = this.getTile(col, row);
    const type = this.TILE_TYPES[id];
    return type ? type.solid : false;
  }

  // ─────────────────────────────────────────────────────────────
  //  KOLIZJA PROSTOKĄTA Z KAFELKAMI
  // ─────────────────────────────────────────────────────────────

  /**
   * Sprawdza kolizje prostokąta z siatką kafelków.
   * Zwraca obiekt z informacją o kolizjach ze wszystkich stron.
   *
   * @param {number} x   - lewa krawędź prostokąta
   * @param {number} y   - górna krawędź prostokąta
   * @param {number} w   - szerokość prostokąta
   * @param {number} h   - wysokość prostokąta
   * @returns {{ top, bottom, left, right, tileX, tileY }}
   */
  checkCollision(x, y, w, h) {
    const T  = CONFIG.CANVAS.TILE_SIZE;
    const result = {
      top: false, bottom: false, left: false, right: false,
      tileCol: 0, tileRow: 0,
    };

    // Oblicz zakres kafelków zajmowanych przez prostokąt
    const colLeft   = Math.floor(x / T);
    const colRight  = Math.floor((x + w - 1) / T);
    const rowTop    = Math.floor(y / T);
    const rowBottom = Math.floor((y + h - 1) / T);

    // Dół – sprawdź kafelki pod stopami
    for (let c = colLeft; c <= colRight; c++) {
      if (this.isSolid(c, rowBottom)) {
        result.bottom = true;
        result.tileCol = c;
        result.tileRow = rowBottom;
      }
    }

    // Góra – sprawdź kafelki nad głową
    for (let c = colLeft; c <= colRight; c++) {
      if (this.isSolid(c, rowTop)) {
        result.top = true;
        result.tileCol = c;
        result.tileRow = rowTop;
      }
    }

    // Lewo
    for (let r = rowTop; r <= rowBottom; r++) {
      if (this.isSolid(colLeft, r)) {
        result.left = true;
      }
    }

    // Prawo
    for (let r = rowTop; r <= rowBottom; r++) {
      if (this.isSolid(colRight, r)) {
        result.right = true;
      }
    }

    return result;
  }

  /**
   * Rozwiązuje kolizję prostokąta z kafelkami – przesuwa prostokąt.
   * Zwraca { x, y, velX, velY, onGround, hitCeiling }.
   *
   * @param {number} x, y     - aktualna pozycja
   * @param {number} w, h     - rozmiary prostokąta
   * @param {number} velX, velY - prędkości
   */
  resolveCollision(x, y, w, h, velX, velY) {
    const T = CONFIG.CANVAS.TILE_SIZE;
    let onGround   = false;
    let hitCeiling = false;
    let hitWallL   = false;
    let hitWallR   = false;

    // ── Ruch poziomy ──────────────────────────────────────────
    x += velX;
    {
      const colLeft   = Math.floor(x / T);
      const colRight  = Math.floor((x + w - 1) / T);
      const rowTop    = Math.floor((y + 1) / T);
      const rowBottom = Math.floor((y + h - 1) / T);

      if (velX < 0) {
        // Poruszamy się w lewo – sprawdź lewą kolumnę
        for (let r = rowTop; r <= rowBottom; r++) {
          if (this.isSolid(colLeft, r)) {
            x = (colLeft + 1) * T;
            velX = 0;
            hitWallL = true;
            break;
          }
        }
      } else if (velX > 0) {
        // Poruszamy się w prawo – sprawdź prawą kolumnę
        for (let r = rowTop; r <= rowBottom; r++) {
          if (this.isSolid(colRight, r)) {
            x = colRight * T - w;
            velX = 0;
            hitWallR = true;
            break;
          }
        }
      }
    }

    // ── Ruch pionowy ──────────────────────────────────────────
    y += velY;
    {
      const colLeft   = Math.floor((x + 1) / T);
      const colRight  = Math.floor((x + w - 1) / T);
      const rowTop    = Math.floor(y / T);
      const rowBottom = Math.floor((y + h - 1) / T);

      if (velY > 0) {
        // Padamy w dół – sprawdź dolny rząd
        for (let c = colLeft; c <= colRight; c++) {
          if (this.isSolid(c, rowBottom)) {
            y = rowBottom * T - h;
            velY = 0;
            onGround = true;
            break;
          }
        }
      } else if (velY < 0) {
        // Skaczemy w górę – sprawdź górny rząd
        for (let c = colLeft; c <= colRight; c++) {
          if (this.isSolid(c, rowTop)) {
            y = (rowTop + 1) * T;
            velY = 0;
            hitCeiling = true;

            // Uderz w blok z pytajnikiem od dołu
            this._hitBlockFromBelow(c, rowTop);
            break;
          }
        }
      }
    }

    return { x, y, velX, velY, onGround, hitCeiling, hitWallL, hitWallR };
  }

  /**
   * Wywoływana gdy gracz uderza głową w blok od dołu.
   * Zmienia blok z pytajnikiem w zużyty i nagradza gracza.
   */
  _hitBlockFromBelow(col, row) {
    const id = this.getTile(col, row);

    if (id === 2) {
      // Cegła – rozbij ją (usuń kafelek)
      this.setTile(col, row, 0);
      // Efekt cząstek jest zarządzany przez Game
      if (window._game) window._game.spawnBrickParticles(col, row);
    } else if (id === 3) {
      // Blok z pytajnikiem – zamień na zużyty, daj nagrodę
      this.setTile(col, row, 10);
      const qb = this.questionBlocks.find(q => q.col === col && q.row === row);
      if (qb) qb.hit = true;
      if (window._game) window._game.hitQuestionBlock(col, row);
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  AKTUALIZACJA LOGIKI POZIOMU
  // ─────────────────────────────────────────────────────────────

  update() {
    // Odliczanie czasu (co 1 sekundę)
    const now = Date.now();
    if (now - this.lastTick >= 1000) {
      this.timeLeft = Math.max(0, this.timeLeft - 1);
      this.lastTick = now;
    }

    // Animacja monet
    this.coins.forEach(coin => {
      if (!coin.collected) {
        coin.animFrame = (coin.animFrame + 0.1) % (Math.PI * 2);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  RYSOWANIE POZIOMU
  // ─────────────────────────────────────────────────────────────

  /**
   * Rysuje kafelki poziomu widoczne w oknie kamery.
   * @param {number} camX - przesunięcie kamery w osi X
   */
  draw(camX) {
    const ctx = this.ctx;
    const T   = CONFIG.CANVAS.TILE_SIZE;
    const W   = CONFIG.CANVAS.WIDTH;
    const H   = CONFIG.CANVAS.HEIGHT;

    // Oblicz zakres widocznych kolumn
    const startCol = Math.max(0, Math.floor(camX / T) - 1);
    const endCol   = Math.min(this.mapWidth - 1, Math.ceil((camX + W) / T) + 1);

    for (let row = 0; row < this.mapHeight; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const id = this.getTile(col, row);
        if (id === 0) continue; // powietrze – nic nie rysuj

        const px = col * T - camX;
        const py = row * T;
        const type = this.TILE_TYPES[id];

        if (type && type.sprite && this.sprites.has(type.sprite)) {
          // Rysuj sprite PNG
          ctx.drawImage(this.sprites.get(type.sprite), px, py, T, T);
        } else {
          // Rysuj zastępczy prostokąt z kolorem
          this._drawFallbackTile(id, px, py, T);
        }
      }
    }

    // Rysuj monety
    this._drawCoins(camX);

    // Rysuj maszt flagi
    this._drawFlag(camX);

    // Debug: siatka kafelków
    if (CONFIG.DEBUG.SHOW_TILE_GRID) {
      this._drawGrid(camX, startCol, endCol);
    }
  }

  /**
   * Rysuje zastępczy kafelek (gdy brak sprite'a PNG).
   */
  _drawFallbackTile(id, px, py, T) {
    const ctx = this.ctx;
    const C = CONFIG.COLORS;

    switch (id) {
      case 1: // Ziemia
        // Podkład ziemi
        ctx.fillStyle = '#C84C0C';
        ctx.fillRect(px, py, T, T);

        // Kropki ziemi (tekstura)
        ctx.fillStyle = '#943A0A';
        for (let y = 10; y < T; y += 8) {
          for (let x = (y % 16 === 0 ? 0 : 4); x < T; x += 8) {
            ctx.fillRect(px + x, py + y, 3, 3);
          }
        }

        // Baza trawy (zielona)
        ctx.fillStyle = '#58A848';
        ctx.fillRect(px, py, T, 6);

        // Lighter green highlight
        ctx.fillStyle = '#7CE468';
        ctx.fillRect(px, py, T, 2);

        // Ząbkowane źdźbła
        ctx.fillStyle = '#58A848';
        for (let x = 0; x < T; x += 4) {
          const h = (x % 8 === 0 ? 4 : 2);
          ctx.fillRect(px + x, py + 6, 2, h);
        }

        // Cień pod źdźbłami
        ctx.fillStyle = '#306820';
        for (let x = 0; x < T; x += 4) {
          const h = (x % 8 === 0 ? 4 : 2);
          ctx.fillRect(px + x, py + 6 + h, 2, 1);
        }
        break;

      case 2: // Cegła
        ctx.fillStyle = C.BRICK;
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#A03808';
        ctx.fillRect(px,      py,      T / 2 - 1, T / 2 - 1);
        ctx.fillRect(px + T / 2, py + T / 2, T / 2 - 1, T / 2 - 1);
        ctx.strokeStyle = '#703008';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;

      case 3: // Blok ?
        ctx.fillStyle = C.QUESTION_BLOCK;
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#D09000';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', px + T / 2, py + T / 2 + 1);
        break;

      case 4: // Ziemia twarda (platforma)
        ctx.fillStyle = C.GROUND;
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;

      case 5: // Rura góra
        ctx.fillStyle = '#2A8028';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = C.PIPE;
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        // Kołnierz
        ctx.fillStyle = '#50C050';
        ctx.fillRect(px - 2, py + 4, T + 4, 8);
        break;

      case 6: // Rura ciało
        ctx.fillStyle = '#2A8028';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = C.PIPE;
        ctx.fillRect(px + 4, py, T - 8, T);
        // Podświetlenie boczne
        ctx.fillStyle = '#60D060';
        ctx.fillRect(px + 5, py, 4, T);
        break;

      case 10: // Blok zużyty
        ctx.fillStyle = '#C08000';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#A07000';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        break;

      case 11: // Chmura
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(px + T / 2, py + T / 2, T / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 12: // Ziemia podziemna (underground / dirt without grass)
        ctx.fillStyle = '#C84C0C';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#943A0A';
        for (let y = 2; y < T; y += 8) {
          for (let x = (y % 16 === 0 ? 0 : 4); x < T; x += 8) {
            ctx.fillRect(px + x, py + y, 3, 3);
          }
        }
        ctx.fillStyle = '#7A2E08';
        for (let y = 6; y < T; y += 12) {
          for (let x = 2; x < T; x += 10) {
            ctx.fillRect(px + x, py + y, 2, 2);
          }
        }
        ctx.strokeStyle = '#703008';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;

      case 13: // Rura wariant (szary)
        ctx.fillStyle = '#404044';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#66666e';
        ctx.fillRect(px + 4, py, T - 8, T);
        ctx.fillStyle = '#9999a0';
        ctx.fillRect(px + 5, py, 4, T);
        break;

      default:
        ctx.fillStyle = '#888';
        ctx.fillRect(px, py, T, T);
    }
  }

  /**
   * Rysuje wszystkie monety.
   */
  _drawCoins(camX) {
    const ctx = this.ctx;
    const T   = CONFIG.CANVAS.TILE_SIZE;
    const W   = CONFIG.CANVAS.WIDTH;

    this.coins.forEach(coin => {
      if (coin.collected) return;

      // Frustum culling: skip drawing coins that are offscreen
      if (coin.x + T < camX || coin.x > camX + W) return;

      const px = coin.x - camX + T / 2;
      const py = coin.y + T / 2;

      // Efekt pulsowania
      const scale = 1 + Math.sin(coin.animFrame) * 0.08;
      const r = (T / 2 - 4) * scale;

      // Zewnętrzna poświata
      const grd = ctx.createRadialGradient(px, py, r * 0.3, px, py, r);
      grd.addColorStop(0, '#FFFF80');
      grd.addColorStop(0.6, CONFIG.COLORS.COIN);
      grd.addColorStop(1, '#C09000');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();

      // Znak $ / gwiazdka
      ctx.fillStyle = '#C09000';
      ctx.font = `bold ${Math.round(r)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', px, py + 1);
    });
  }

  /**
   * Rysuje maszt flagi (cel poziomu) oraz miasto w tle.
   */
  _drawFlag(camX) {
    const ctx = this.ctx;
    const T   = CONFIG.CANVAS.TILE_SIZE;
    const H   = CONFIG.CANVAS.HEIGHT;

    if (this.flagX === 0) return;

    const px = this.flagX - camX + T / 2;

    // Rysuj proste miasto w tle za flagą
    this._drawCity(camX);

    // Maszt
    ctx.fillStyle = CONFIG.COLORS.FLAG_POLE;
    ctx.fillRect(px - 3, T, 6, H - T * 2);

    // Flaga Polski (biało-czerwona)
    const flagW = 60;
    const flagH = 40;
    const flagY = T + 8;

    // Biała połowa
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(px + 3, flagY, flagW, flagH / 2);
    // Czerwona połowa
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(px + 3, flagY + flagH / 2, flagW, flagH / 2);

    // Napis POLSKA
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLSKA', px + 3 + flagW / 2, flagY + flagH / 2);

    // Kula na szczycie
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(px, T + 4, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Rysuje proste budynki miasta w tle na końcu poziomu.
   */
  _drawCity(camX) {
    const ctx = this.ctx;
    const T   = CONFIG.CANVAS.TILE_SIZE;
    const H   = CONFIG.CANVAS.HEIGHT;
    const startX = this.flagX - 100;

    ctx.save();
    ctx.globalAlpha = 0.7;

    const buildings = [
      { x: 0,   w: 60,  h: 120, color: '#444' },
      { x: 70,  w: 50,  h: 180, color: '#333' },
      { x: 130, w: 80,  h: 150, color: '#555' },
      { x: 220, w: 40,  h: 220, color: '#222' },
      { x: 270, w: 70,  h: 100, color: '#444' },
    ];

    buildings.forEach(b => {
      const px = startX + b.x - camX;
      if (px + b.w > 0 && px < CONFIG.CANVAS.WIDTH) {
        ctx.fillStyle = b.color;
        ctx.fillRect(px, H - T - b.h, b.w, b.h);
        
        // Okna
        ctx.fillStyle = '#FFD700';
        for (let wy = H - T - b.h + 10; wy < H - T - 10; wy += 20) {
          for (let wx = px + 5; wx < px + b.w - 5; wx += 15) {
            if (Math.random() > 0.3) {
              ctx.fillRect(wx, wy, 8, 12);
            }
          }
        }
      }
    });

    ctx.restore();
  }

  /**
   * Rysuje siatkę debugowania.
   */
  _drawGrid(camX, startCol, endCol) {
    const ctx = this.ctx;
    const T   = CONFIG.CANVAS.TILE_SIZE;
    const H   = CONFIG.CANVAS.HEIGHT;

    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 0.5;

    for (let col = startCol; col <= endCol; col++) {
      const px = col * T - camX;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
      ctx.stroke();
    }
    for (let row = 0; row < this.mapHeight; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * T);
      ctx.lineTo(CONFIG.CANVAS.WIDTH, row * T);
      ctx.stroke();
    }
  }
}
