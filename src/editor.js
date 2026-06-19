/**
 * editor.js - Moduł edytora poziomów dla gry Super Marian Delux
 *
 * Odpowiada za:
 * - Wizualną edycję siatki kafelków (15 wierszy x N kolumn)
 * - Rozmieszczanie wrogów (goomba, koopa) i edycję ich stref patrolu
 * - Zapisywanie modyfikacji w localStorage w celu natychmiastowego testowania w grze
 * - Eksportowanie poziomu jako plik JS kompatybilny z domyślnym formatem maps/levelX.js
 * - Importowanie pliku JSON poziomu
 * - Zmianę parametrów poziomu (szerokość mapy, czas)
 */

class LevelEditor {
  constructor() {
    // Referencje do elementów DOM
    this.canvas = document.getElementById('editorCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.viewport = document.getElementById('editor-viewport');

    // UI Kontrolki
    this.levelSelect = document.getElementById('editor-level-select');
    this.timeLimitInput = document.getElementById('editor-time-limit');
    this.mapColsInput = document.getElementById('editor-map-cols');
    
    this.btnSave = document.getElementById('editor-btn-save');
    this.btnPlay = document.getElementById('editor-btn-play');
    this.btnExport = document.getElementById('editor-btn-export');
    this.btnReset = document.getElementById('editor-btn-reset');
    
    this.btnImportTrigger = document.getElementById('editor-btn-import-btn');
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,.js';
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.toolPencil = document.getElementById('tool-pencil');
    this.toolEraser = document.getElementById('tool-eraser');
    
    this.statusCoords = document.getElementById('editor-status-coords');

    // Stan edytora
    this.currentLevelIndex = 0;
    this.timeLimit = 300;
    this.mapCols = 80;
    this.tileMap = [];
    this.enemies = [];
    
    this.activeTool = 'pencil'; // 'pencil' | 'eraser'
    this.selectedElement = { type: 'tile', id: 1 }; // tile (1-12) lub enemy ('goomba'/'koopa')

    this.isDrawing = false;
    this.selectedEnemyForPatrol = null; // wróg, którego patrol właśnie edytujemy

    // Rozmiar kafelka w pikselach
    this.TILE_SIZE = 32;
    this.MAP_ROWS = 15; // Sztywna wysokość poziomu zgodna z silnikiem gry

    // Dane kafelków (kopia z level.js)
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

  /** Inicjalizuje edytor i podłącza eventy */
  init() {
    this._createPaletteUI();
    this._bindEvents();
    this.loadLevel(0);
  }

  /** Dynamiczne generowanie przycisków w palecie */
  _createPaletteUI() {
    const tilesContainer = document.getElementById('palette-tiles');
    const enemiesContainer = document.getElementById('palette-enemies');

    tilesContainer.innerHTML = '';
    enemiesContainer.innerHTML = '';

    // Elementy kafelków (od 1 do 12, pomijamy 0 bo to powietrze/gumka)
    const activeTiles = [1, 2, 3, 4, 12, 13, 5, 6, 7, 10, 11, 8, 9];
    activeTiles.forEach(id => {
      const tile = this.TILE_TYPES[id];
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.dataset.type = 'tile';
      btn.dataset.id = id;
      btn.title = tile.label;

      // Wizualny podgląd (mały rysunek)
      const preview = document.createElement('div');
      preview.className = `tile-preview tile-${id}`;
      
      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = tile.label;

      btn.appendChild(preview);
      btn.appendChild(label);
      
      if (id === 1) btn.classList.add('active'); // Domyślnie zaznaczona ziemia

      btn.addEventListener('click', () => this._selectPaletteElement(btn));
      tilesContainer.appendChild(btn);
    });

    // Elementy przeciwników
    const enemiesList = [
      { id: 'goomba', label: 'Goomba' },
      { id: 'koopa', label: 'Koopa' }
    ];
    enemiesList.forEach(enemy => {
      const btn = document.createElement('button');
      btn.className = 'palette-btn';
      btn.dataset.type = 'enemy';
      btn.dataset.id = enemy.id;
      btn.title = enemy.label;

      const preview = document.createElement('div');
      preview.className = `enemy-preview enemy-${enemy.id}`;

      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = enemy.label;

      btn.appendChild(preview);
      btn.appendChild(label);

      btn.addEventListener('click', () => this._selectPaletteElement(btn));
      enemiesContainer.appendChild(btn);
    });
  }

  /** Zaznacza element palety */
  _selectPaletteElement(btn) {
    document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Przełącz na ołówek przy wyborze elementu
    this._setTool('pencil');

    this.selectedElement = {
      type: btn.dataset.type,
      id: btn.dataset.type === 'tile' ? parseInt(btn.dataset.id) : btn.dataset.id
    };
  }

  /** Przełącza aktywne narzędzie */
  _setTool(tool) {
    this.activeTool = tool;
    this.toolPencil.classList.toggle('active', tool === 'pencil');
    this.toolEraser.classList.toggle('active', tool === 'eraser');
  }

  /** Podłącza listenery */
  _bindEvents() {
    // Wybór poziomu
    this.levelSelect.addEventListener('change', (e) => {
      this.loadLevel(parseInt(e.target.value));
    });

    // Wymiary i właściwości poziomu
    this.timeLimitInput.addEventListener('change', (e) => {
      this.timeLimit = Math.max(10, parseInt(e.target.value) || 300);
    });

    this.mapColsInput.addEventListener('change', (e) => {
      this._resizeMapCols(Math.max(25, Math.min(250, parseInt(e.target.value) || 80)));
    });

    // Przyciski narzędzi
    this.toolPencil.addEventListener('click', () => this._setTool('pencil'));
    this.toolEraser.addEventListener('click', () => this._setTool('eraser'));

    // Przyciski akcji
    this.btnSave.addEventListener('click', () => this.saveToLocalStorage());
    this.btnPlay.addEventListener('click', () => this.playtestLevel());
    this.btnExport.addEventListener('click', () => this.exportLevel());
    this.btnReset.addEventListener('click', () => this.resetLevel());
    
    // Obsługa importu pliku
    this.btnImportTrigger.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.importLevel(e));

    // Interakcja z płótnem
    this.canvas.addEventListener('mousedown', (e) => this._onCanvasMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this._onCanvasMouseMove(e));
    window.addEventListener('mouseup', () => { this.isDrawing = false; });

    // Wyłączenie menu kontekstowego na prawoklik
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Prawy przycisk myszy działa jak gumka na jedno kliknięcie
      this._eraseAtMouse(e);
    });
  }

  /** Wczytuje poziom z localStorage lub wbudowanych danych */
  loadLevel(index) {
    this.currentLevelIndex = index;
    this.levelSelect.value = index;

    const path = `maps/level${index + 1}.json`;
    const overrideKey = `marian_delux_level_${path}`;
    const localData = localStorage.getItem(overrideKey);

    let parsedData = null;

    if (localData) {
      try {
        parsedData = JSON.parse(localData);
      } catch (err) {
        console.error("Błąd wczytywania z localStorage:", err);
      }
    }

    if (!parsedData && window.LEVEL_DATA && window.LEVEL_DATA[path]) {
      // Kopia wbudowanych danych
      parsedData = window.LEVEL_DATA[path];
    }

    if (!parsedData) {
      // Awaryjny pusty poziom
      parsedData = {
        timeLimit: 300,
        tileMap: Array.from({ length: this.MAP_ROWS }, () => Array(80).fill(0)),
        enemies: [],
        pipes: []
      };
      // Ustaw podstawową ziemię i punkt startowy
      parsedData.tileMap[13].fill(1);
      parsedData.tileMap[14].fill(1);
      parsedData.tileMap[12][2] = 8; // spawn
      parsedData.tileMap[12][75] = 9; // flaga
    }

    // Skopiuj wartości głęboko do stanu edytora
    this.timeLimit = parsedData.timeLimit || 300;
    this.tileMap = JSON.parse(JSON.stringify(parsedData.tileMap));
    
    // Konwertuj współrzędne wrogów z pikseli na kafelki jeśli zachodzi taka potrzeba
    // W JSON przeciwnicy mają pozycje w kafelkach.
    this.enemies = [];
    if (parsedData.enemies) {
      parsedData.enemies.forEach(e => {
        this.enemies.push({
          type: e.type || 'goomba',
          x: e.x,
          y: e.y,
          patrolMin: e.patrolMin !== undefined ? e.patrolMin : Math.max(0, e.x - 4),
          patrolMax: e.patrolMax !== undefined ? e.patrolMax : Math.min(this.tileMap[0].length - 1, e.x + 4)
        });
      });
    }

    this.mapCols = this.tileMap[0].length;

    // Zaktualizuj UI kontrolek
    this.timeLimitInput.value = this.timeLimit;
    this.mapColsInput.value = this.mapCols;

    this.selectedEnemyForPatrol = null;

    // Przeskaluj canvas i narysuj
    this._resizeCanvas();
    this.draw();
  }

  /** Zmiana szerokości mapy w kolumnach */
  _resizeMapCols(newCols) {
    if (newCols === this.mapCols) return;

    for (let r = 0; r < this.MAP_ROWS; r++) {
      if (newCols > this.mapCols) {
        // Dodaj puste kolumny (powietrze)
        const diff = newCols - this.mapCols;
        const fillVal = (r >= 13) ? 1 : 0; // na dole dodaj grunt
        this.tileMap[r].push(...Array(diff).fill(fillVal));
      } else {
        // Odetnij kolumny
        this.tileMap[r] = this.tileMap[r].slice(0, newCols);
      }
    }

    // Przesiej wrogów poza zakresem mapy
    this.enemies = this.enemies.filter(e => e.x < newCols);
    this.enemies.forEach(e => {
      if (e.patrolMax >= newCols) e.patrolMax = newCols - 1;
      if (e.patrolMin >= newCols) e.patrolMin = 0;
    });

    this.mapCols = newCols;
    this.mapColsInput.value = newCols;

    this._resizeCanvas();
    this.draw();
  }

  _resizeCanvas() {
    this.canvas.width = this.mapCols * this.TILE_SIZE;
    this.canvas.height = this.MAP_ROWS * this.TILE_SIZE;
  }

  /** Rysowanie edytora */
  draw() {
    const ctx = this.ctx;
    const T = this.TILE_SIZE;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 1. Tło nieba
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#5C94FC');
    gradient.addColorStop(1, '#8CB8FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // 2. Chmury w tle (statyczne co 300px)
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let cx = 80; cx < W; cx += 280) {
      ctx.beginPath();
      ctx.arc(cx, 60, 20, 0, Math.PI * 2);
      ctx.arc(cx + 20, 55, 16, 0, Math.PI * 2);
      ctx.arc(cx - 15, 63, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Kafelki z siatki
    for (let r = 0; r < this.MAP_ROWS; r++) {
      for (let c = 0; c < this.mapCols; c++) {
        const id = this.tileMap[r][c];
        if (id === 0) continue;

        const px = c * T;
        const py = r * T;

        this._drawTile(id, px, py);
      }
    }

    // 4. Siatka linii pomocniczych
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= this.mapCols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * T, 0);
      ctx.lineTo(c * T, H);
      ctx.stroke();
    }
    for (let r = 0; r <= this.MAP_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * T);
      ctx.lineTo(W, r * T);
      ctx.stroke();
    }

    // 5. Rysowanie wrogów i ich stref patrolu
    this.enemies.forEach(e => {
      const px = e.x * T + T / 2;
      const py = e.y * T + T / 2;

      // Linia patrolu na dole
      ctx.save();
      ctx.strokeStyle = (this.selectedEnemyForPatrol === e) ? '#FFD700' : 'rgba(255, 68, 68, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      
      // Lewa granica
      ctx.beginPath();
      ctx.moveTo(e.patrolMin * T, py + T / 2);
      ctx.lineTo(e.patrolMin * T, py - 4);
      ctx.stroke();

      // Prawa granica
      ctx.beginPath();
      ctx.moveTo((e.patrolMax + 1) * T, py + T / 2);
      ctx.lineTo((e.patrolMax + 1) * T, py - 4);
      ctx.stroke();

      // Łącząca linia
      ctx.beginPath();
      ctx.moveTo(e.patrolMin * T, py + 8);
      ctx.lineTo((e.patrolMax + 1) * T, py + 8);
      ctx.stroke();
      ctx.restore();

      // Rysunek wroga
      this._drawEnemy(e.type, e.x * T, e.y * T);

      // Etykieta patrolu (jeśli zaznaczony)
      if (this.selectedEnemyForPatrol === e) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("PATROL", px, e.y * T - 8);
      }
    });
  }

  /** Rysuje konkretny kafelek o podanym ID */
  _drawTile(id, px, py) {
    const ctx = this.ctx;
    const T = this.TILE_SIZE;

    // Próbuj pobrać sprite z silnika gry
    const type = this.TILE_TYPES[id];
    if (type && type.sprite && window._game && window._game.sprites.has(type.sprite)) {
      ctx.drawImage(window._game.sprites.get(type.sprite), px, py, T, T);
      return;
    }

    // Fallback rysowania wektorowego (kopia z level.js)
    switch (id) {
      case 1: // Ziemia z trawą
        ctx.fillStyle = '#C84C0C';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#943A0A';
        for (let y = 10; y < T; y += 8) {
          for (let x = (y % 16 === 0 ? 0 : 4); x < T; x += 8) {
            ctx.fillRect(px + x, py + y, 3, 3);
          }
        }
        ctx.fillStyle = '#58A848';
        ctx.fillRect(px, py, T, 6);
        ctx.fillStyle = '#7CE468';
        ctx.fillRect(px, py, T, 2);
        ctx.fillStyle = '#58A848';
        for (let x = 0; x < T; x += 4) {
          const h = (x % 8 === 0 ? 4 : 2);
          ctx.fillRect(px + x, py + 6, 2, h);
        }
        break;

      case 2: // Cegła
        ctx.fillStyle = '#C84C0C';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#A03808';
        ctx.fillRect(px,      py,      T / 2 - 1, T / 2 - 1);
        ctx.fillRect(px + T / 2, py + T / 2, T / 2 - 1, T / 2 - 1);
        ctx.strokeStyle = '#703008';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;

      case 3: // Blok ?
        ctx.fillStyle = '#F8B800';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#D09000';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', px + T / 2, py + T / 2 + 1);
        break;

      case 4: // Ziemia twarda
        ctx.fillStyle = '#C84C0C';
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
        break;

      case 5: // Rura góra
        ctx.fillStyle = '#2A8028';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#38A038';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        ctx.fillStyle = '#50C050';
        ctx.fillRect(px - 1, py + 4, T + 2, 8);
        break;

      case 6: // Rura dół
        ctx.fillStyle = '#2A8028';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#38A038';
        ctx.fillRect(px + 4, py, T - 8, T);
        break;

      case 7: // Moneta
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(px + T / 2, py + T / 2, T / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#C09000';
        ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', px + T / 2, py + T / 2);
        break;

      case 8: // Spawn gracza (START)
        // Rysuj uroczy mały czerwony kombinezon i czapkę
        ctx.fillStyle = 'rgba(232, 48, 48, 0.4)';
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = '#E83030';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);

        // Narysuj postać gracza jeśli sprite jest gotowy
        if (window._game && window._game.sprites.has('player_idle_right')) {
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.drawImage(window._game.sprites.get('player_idle_right'), px, py, T, T);
          ctx.restore();
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9px "Press Start 2P", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('START', px + T / 2, py + T / 2);
        }
        break;

      case 9: // Cel flagi
        // Maszt
        ctx.fillStyle = '#D8D8D8';
        ctx.fillRect(px + T / 2 - 2, py, 4, T);
        // Flaga
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(px + T / 2 + 2, py + 4, 16, 10);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(px + T / 2 + 2, py + 4, 16, 5);
        break;

      case 10: // Zużyty blok
        ctx.fillStyle = '#C08000';
        ctx.fillRect(px, py, T, T);
        ctx.fillStyle = '#A07000';
        ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
        break;

      case 11: // Chmura
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(px + T / 2, py + T / 2, T / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 12: // Ziemia podziemna
        ctx.fillStyle = '#8A3E18';
        ctx.fillRect(px, py, T, T);
        ctx.strokeStyle = '#5E260A';
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

  _drawEnemy(type, px, py) {
    const ctx = this.ctx;
    const T = this.TILE_SIZE;

    // Próbuj pobrać sprite z silnika gry
    const spriteName = `enemy_${type}`;
    if (window._game && window._game.sprites.has(spriteName)) {
      ctx.drawImage(window._game.sprites.get(spriteName), px, py, T, T);
      return;
    }

    ctx.save();
    if (type === 'goomba') {
      // Brązowa głowa
      ctx.fillStyle = '#A84000';
      ctx.beginPath();
      ctx.arc(px + T / 2, py + T / 2 - 2, 10, 0, Math.PI * 2);
      ctx.fill();
      // Oczy i złe brwi
      ctx.fillStyle = '#FFF';
      ctx.fillRect(px + T / 2 - 6, py + T / 2 - 6, 3, 4);
      ctx.fillRect(px + T / 2 + 3, py + T / 2 - 6, 3, 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(px + T / 2 - 5, py + T / 2 - 5, 2, 3);
      ctx.fillRect(px + T / 2 + 3, py + T / 2 - 5, 2, 3);
      // Brwi
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px + T / 2 - 8, py + T / 2 - 8);
      ctx.lineTo(px + T / 2 - 2, py + T / 2 - 5);
      ctx.moveTo(px + T / 2 + 8, py + T / 2 - 8);
      ctx.lineTo(px + T / 2 + 2, py + T / 2 - 5);
      ctx.stroke();
      // Nogi
      ctx.fillStyle = '#502000';
      ctx.fillRect(px + 6, py + T - 8, 7, 8);
      ctx.fillRect(px + T - 13, py + T - 8, 7, 8);
    } else if (type === 'koopa') {
      // Zielona skorupa
      ctx.fillStyle = '#30A030';
      ctx.beginPath();
      ctx.arc(px + T / 2, py + T / 2 + 2, 10, 0, Math.PI * 2);
      ctx.fill();
      // Głowa
      ctx.fillStyle = '#50C050';
      ctx.beginPath();
      ctx.arc(px + T / 2 - 4, py + T / 2 - 8, 7, 0, Math.PI * 2);
      ctx.fill();
      // Wzór na muszli
      ctx.strokeStyle = '#206020';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + T / 2 - 6, py + T / 2 - 4, 12, 12);
      // Oko
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(px + T / 2 - 6, py + T / 2 - 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Zwraca współrzędne kafelka pod kursorem myszy */
  _getMouseCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    // Skalowanie pozycji myszy względem rzeczywistej szerokości canvasu w CSS
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const col = Math.floor(x / this.TILE_SIZE);
    const row = Math.floor(y / this.TILE_SIZE);

    return { col, row };
  }

  /** Aktualizuje licznik pozycji pod kursorem */
  updateCoords(e) {
    const { col, row } = this._getMouseCoords(e);
    if (col >= 0 && col < this.mapCols && row >= 0 && row < this.MAP_ROWS) {
      this.statusCoords.textContent = `Kursor: kolumna ${col + 1}, rząd ${row + 1}`;
    } else {
      this.statusCoords.textContent = `Kursor: --`;
    }
  }

  _onCanvasMouseDown(e) {
    const { col, row } = this._getMouseCoords(e);
    if (col < 0 || col >= this.mapCols || row < 0 || row >= this.MAP_ROWS) return;

    // Prawy przycisk myszy / Ctrl+Klik lub aktywna gumka -> Wymazywanie
    if (e.button === 2 || this.activeTool === 'eraser') {
      this._eraseAt(col, row);
      this.isDrawing = true;
      this.draw();
      return;
    }

    // Kliknięcie lewym przyciskiem myszy
    if (e.button === 0) {
      // Sprawdź czy kliknięto na istniejącego wroga
      const clickedEnemy = this.enemies.find(en => en.x === col && en.y === row);
      
      if (clickedEnemy) {
        // Zaznaczamy wroga, aby móc edytować jego patrol za pomocą suwaków lub przycisków
        if (this.selectedEnemyForPatrol === clickedEnemy) {
          // Kliknięty ponownie -> odznacz
          this.selectedEnemyForPatrol = null;
        } else {
          this.selectedEnemyForPatrol = clickedEnemy;
        }
        this.draw();
        return;
      }

      // Jeśli zaznaczony jest wróg do patrolu, a kliknęliśmy gdzie indziej na linii stóp:
      if (this.selectedEnemyForPatrol && row === this.selectedEnemyForPatrol.y) {
        // Przesuń granice patrolu do klikniętej kolumny!
        const enemy = this.selectedEnemyForPatrol;
        if (col < enemy.x) {
          enemy.patrolMin = col;
        } else if (col > enemy.x) {
          enemy.patrolMax = col;
        }
        this.draw();
        return;
      }

      // W przeciwnym razie, odznacz wroga i rysuj
      this.selectedEnemyForPatrol = null;
      this._paintAt(col, row);
      this.isDrawing = true;
      this.draw();
    }
  }

  _onCanvasMouseMove(e) {
    this.updateCoords(e);
    if (!this.isDrawing) return;

    const { col, row } = this._getMouseCoords(e);
    if (col < 0 || col >= this.mapCols || row < 0 || row >= this.MAP_ROWS) return;

    if (this.activeTool === 'eraser') {
      this._eraseAt(col, row);
    } else {
      this._paintAt(col, row);
    }
    this.draw();
  }

  /** Rysuje wybrany element na podanej pozycji */
  _paintAt(col, row) {
    // Zapobiegaj rysowaniu elementów w rzędach poza dopuszczalnymi (np. spawn na samym niebie)
    if (this.selectedElement.type === 'tile') {
      const id = this.selectedElement.id;

      // Sprawdź limit: tylko jeden spawn (8) na mapie
      if (id === 8) {
        this._removeTileOccurrences(8);
      }
      // Sprawdź limit: tylko jedna flaga (9) na mapie
      if (id === 9) {
        this._removeTileOccurrences(9);
      }

      this.tileMap[row][col] = id;

      // Usuń przeciwnika z tego pola, jeśli jakiś tu stał
      this._removeEnemyAt(col, row);
    } else if (this.selectedElement.type === 'enemy') {
      // Najpierw wyczyść kafelek (postaw powietrze)
      this.tileMap[row][col] = 0;
      
      // Usuń istniejącego wroga na tej samej komórce
      this._removeEnemyAt(col, row);

      // Dodaj nowego wroga z domyślnym patrolem +- 4 kolumny
      this.enemies.push({
        type: this.selectedElement.id,
        x: col,
        y: row,
        patrolMin: Math.max(0, col - 4),
        patrolMax: Math.min(this.mapCols - 1, col + 4)
      });
    }
  }

  /** Ścieranie (gumka) z podanej pozycji */
  _eraseAt(col, row) {
    this.tileMap[row][col] = 0;
    this._removeEnemyAt(col, row);
    this.selectedEnemyForPatrol = null;
  }

  _eraseAtMouse(e) {
    const { col, row } = this._getMouseCoords(e);
    if (col >= 0 && col < this.mapCols && row >= 0 && row < this.MAP_ROWS) {
      this._eraseAt(col, row);
      this.draw();
    }
  }

  /** Usuwa wroga z podanej pozycji */
  _removeEnemyAt(col, row) {
    const beforeLength = this.enemies.length;
    this.enemies = this.enemies.filter(e => !(e.x === col && e.y === row));
    if (this.enemies.length !== beforeLength) {
      this.selectedEnemyForPatrol = null;
    }
  }

  /** Usuwa wszystkie wystąpienia kafelka o ID w całej mapie (do limitów) */
  _removeTileOccurrences(tileId) {
    for (let r = 0; r < this.MAP_ROWS; r++) {
      for (let c = 0; c < this.mapCols; c++) {
        if (this.tileMap[r][c] === tileId) {
          this.tileMap[r][c] = 0;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  AKCJE PLIKÓW I PERSYSTENCJI
  // ─────────────────────────────────────────────────────────────

  /** Przygotowuje czysty obiekt poziomu do serializacji */
  _serializeLevel() {
    // Sortuj wrogów według kolumny X dla porządku w pliku
    const sortedEnemies = [...this.enemies].sort((a, b) => a.x - b.x);

    return {
      timeLimit: this.timeLimit,
      tileMap: this.tileMap,
      enemies: sortedEnemies,
      pipes: []
    };
  }

  /** Zapisuje do localStorage pod kluczem dla danej ścieżki */
  saveToLocalStorage(silent = false) {
    const path = `maps/level${this.currentLevelIndex + 1}.json`;
    const overrideKey = `marian_delux_level_${path}`;
    const levelData = this._serializeLevel();

    try {
      localStorage.setItem(overrideKey, JSON.stringify(levelData));
      if (!silent) {
        this.showToast("ZAPISANO POZIOM W PRZEGLĄDARCE!");
      }
    } catch (err) {
      console.error(err);
      this.showToast("BŁĄD ZAPISU!", true);
    }
  }

  /** Uruchamia natychmiastowy playtest poziomu w grze */
  playtestLevel() {
    // Zapisz najpierw stan z edytora do pamięci
    this.saveToLocalStorage(true);

    // Przełącz zakładkę na grę
    const tabGame = document.getElementById('tab-game');
    if (tabGame) {
      tabGame.click();
    }

    // Jeśli gra istnieje w oknie globalnym, załaduj ten poziom
    if (window._game) {
      window._game.loadLevel(this.currentLevelIndex);
      // Przekieruj focus na canvas gry
      setTimeout(() => {
        window._game.canvas.focus();
      }, 100);
    }
  }

  /** Przywraca domyślny wygląd poziomu */
  resetLevel() {
    const confirmed = confirm("Czy na pewno chcesz zresetować ten poziom do ustawień fabrycznych? Utracisz wszystkie własne zmiany.");
    if (!confirmed) return;

    const path = `maps/level${this.currentLevelIndex + 1}.json`;
    const overrideKey = `marian_delux_level_${path}`;
    localStorage.removeItem(overrideKey);

    this.loadLevel(this.currentLevelIndex);
    this.showToast("PRZYWRÓCONO DOMYŚLNY POZIOM!");
  }

  /** Eksportuje poziom do pliku JavaScript kompatybilnego z maps/levelX.js */
  exportLevel() {
    const levelData = this._serializeLevel();
    const idx = this.currentLevelIndex + 1;
    
    const jsContent = `/**
 * level${idx}.js – Dane poziomu ${idx} jako obiekt JavaScript
 * Wygenerowano automatycznie przez Edytor Poziomów.
 */
window.LEVEL_DATA = window.LEVEL_DATA || {};

window.LEVEL_DATA['maps/level${idx}.json'] = {
  timeLimit: ${levelData.timeLimit},
  tileMap: [
${levelData.tileMap.map(row => '    [' + row.join(',') + ']').join(',\n')}
  ],
  enemies: [
${levelData.enemies.map(e => `    { type: '${e.type}', x: ${e.x}, y: ${e.y}, patrolMin: ${e.patrolMin}, patrolMax: ${e.patrolMax} }`).join(',\n')}
  ],
  pipes: []
};
`;

    const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `level${idx}.js`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.showToast("POBRANO PLIK level" + idx + ".js!");
  }

  /** Importuje poziom z pliku JSON lub wyodrębnia ze struktury JS */
  importLevel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      let data = null;

      if (file.name.endsWith('.json')) {
        try {
          data = JSON.parse(content);
        } catch (err) {
          this.showToast("BŁĄD PARSOWANIA JSON!", true);
          return;
        }
      } else if (file.name.endsWith('.js')) {
        // Spróbuj wyodrębnić dane z kodu JS za pomocą prostego regexa lub parse'owania
        // W pliku JS szukamy klucza "LEVEL_DATA['maps/levelX.json'] = { ... }"
        try {
          const match = content.match(/window\.LEVEL_DATA\[['"]maps\/level\d\.json['"]\]\s*=\s*(\{[\s\S]*\});\s*$/m) ||
                        content.match(/LEVEL_DATA\[['"]maps\/level\d\.json['"]\]\s*=\s*(\{[\s\S]*\});?\s*$/m) ||
                        content.match(/=\s*(\{[\s\S]*\});?\s*$/m); // fallback
          if (match && match[1]) {
            // Bezpieczna ewaluacja obiektu za pomocą Function, ponieważ w JS mogą być komentarze i brak cudzysłowów
            data = new Function(`return ${match[1]};`)();
          } else {
            throw new Error("Nie znaleziono struktury danych");
          }
        } catch (err) {
          this.showToast("BŁĄD PARSOWANIA PLIKU JS!", true);
          return;
        }
      }

      if (data && data.tileMap && Array.isArray(data.tileMap) && data.tileMap.length === this.MAP_ROWS) {
        this.timeLimit = data.timeLimit || 300;
        this.tileMap = JSON.parse(JSON.stringify(data.tileMap));
        this.mapCols = this.tileMap[0].length;
        this.enemies = [];

        if (data.enemies) {
          data.enemies.forEach(e => {
            this.enemies.push({
              type: e.type || 'goomba',
              x: e.x,
              y: e.y,
              patrolMin: e.patrolMin !== undefined ? e.patrolMin : Math.max(0, e.x - 4),
              patrolMax: e.patrolMax !== undefined ? e.patrolMax : Math.min(this.mapCols - 1, e.x + 4)
            });
          });
        }

        this.timeLimitInput.value = this.timeLimit;
        this.mapColsInput.value = this.mapCols;
        this.selectedEnemyForPatrol = null;

        this._resizeCanvas();
        this.draw();
        this.showToast("POMYŚLNIE ZAIMPORTOWANO POZIOM!");
      } else {
        this.showToast("NIEPRAWIDŁOWA STRUKTURA POZIOMU!", true);
      }
    };
    reader.readAsText(file);
    // Resetuj input, żeby można było wgrać ten sam plik ponownie
    this.fileInput.value = '';
  }

  /** Wyświetla ładny komunikat Toast (popup) */
  showToast(message, isError = false) {
    let toast = document.getElementById('editor-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'editor-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `editor-toast-visible ${isError ? 'error' : ''}`;
    
    // Ukryj po 3 sekundach
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.className = '';
    }, 2500);
  }
}

// Globalne udostępnienie edytora
window._editor = new LevelEditor();
