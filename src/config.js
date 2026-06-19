/**
 * config.js - Główny plik konfiguracyjny gry
 *
 * Tutaj znajdziesz wszystkie ustawienia gry. Możesz je zmieniać,
 * aby dostosować grę do swoich potrzeb bez konieczności edytowania
 * głównego kodu źródłowego.
 */

const CONFIG = {

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA EKRANU I PŁÓTNA (Canvas)
  // ─────────────────────────────────────────────────────────────
  CANVAS: {
    WIDTH: 800,   // szerokość obszaru gry w pikselach
    HEIGHT: 480,   // wysokość obszaru gry w pikselach
    TILE_SIZE: 32, // rozmiar jednego kafelka (tile) w pikselach
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA FIZYKI
  // ─────────────────────────────────────────────────────────────
  PHYSICS: {
    GRAVITY: 0.55,  // siła grawitacji (piksele/klatkę²)
    MAX_FALL_SPEED: 14,   // maksymalna prędkość opadania
    FRICTION: 0.82,  // tarcie poziome (0 = pełne, 1 = brak)
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA GRACZA
  // ─────────────────────────────────────────────────────────────
  PLAYER: {
    SPRITE_WIDTH: 37,   // visual sprite width in pixels
    SPRITE_HEIGHT: 40,   // visual sprite height in pixels
    WIDTH: 28,   // hitbox width in pixels
    HEIGHT: 32,   // hitbox height in pixels
    MOVE_SPEED: 4.2,  // prędkość chodzenia (piksele/klatkę)
    RUN_SPEED: 7.0,  // prędkość biegu (z wciśniętym Shift)
    JUMP_FORCE: -9.5,  // siła skoku (wartość ujemna = w górę)
    START_LIVES: 3,    // liczba żyć na początku gry
    INVINCIBLE_TIME: 120, // czas nietykalności po uderzeniu (klatki)
    ANIMATION_SPEED: 8,   // co ile klatek zmienia się klatka animacji
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA PRZECIWNIKÓW
  // ─────────────────────────────────────────────────────────────
  ENEMY: {
    GOOMBA_SPEED: 1.4, // prędkość chodzenia goomby
    KOOPA_SPEED: 1.0, // prędkość chodzenia koopy
    SHELL_SPEED: 7.0, // prędkość lecącej skorupy koopy
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA PUNKTACJI
  // ─────────────────────────────────────────────────────────────
  SCORE: {
    COIN: 100,  // punkty za zebranie monety
    KILL_ENEMY: 200,  // punkty za pokonanie przeciwnika
    COMBO_BONUS: 200,  // dodatkowe punkty za kolejne zabicie w powietrzu
    QUESTION_ITEM: 50,  // punkty za uderzenie w blok z pytajnikiem
  },

  // ─────────────────────────────────────────────────────────────
  //  ŚCIEŻKI DO ZASOBÓW
  // ─────────────────────────────────────────────────────────────
  ASSETS: {
    TEXTURES_PATH: 'assets/textures/', // folder z teksturami PNG gracza
    TILES_PATH: 'assets/textures/tiles/', // folder z teksturami kafelków
    SOUNDS_PATH: 'assets/sounds/',   // folder z dźwiękami
    MAPS_PATH: 'maps/',            // folder z plikami JSON poziomów
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA KAMERY / PRZEWIJANIA
  // ─────────────────────────────────────────────────────────────
  CAMERA: {
    LOOKAHEAD: 200, // o ile pikseli kamera wyprzedza gracza
    SMOOTHING: 0.1, // płynność śledzenia kamery (0.05–0.2)
  },

  // ─────────────────────────────────────────────────────────────
  //  USTAWIENIA POZIOMÓW
  // ─────────────────────────────────────────────────────────────
  LEVELS: [
    'maps/level1.json',
    'maps/level2.json',
    'maps/level3.json',
    'maps/level4.json',
    'maps/level5.json',
  ],

  // ─────────────────────────────────────────────────────────────
  //  STEROWANIE
  // ─────────────────────────────────────────────────────────────
  CONTROLS: {
    MOVE_LEFT: ['ArrowLeft', 'KeyA'],
    MOVE_RIGHT: ['ArrowRight', 'KeyD'],
    JUMP: ['ArrowUp', 'KeyW', 'Space'],
    RUN: ['ShiftLeft', 'ShiftRight'],
    PAUSE: ['Escape', 'KeyP'],
  },

  // ─────────────────────────────────────────────────────────────
  //  KOLORY ZASTĘPCZE (gdy brak pliku PNG)
  //  Używane przez system generowania sprite'ów z canvas
  // ─────────────────────────────────────────────────────────────
  COLORS: {
    SKY_TOP: '#7B8FA1', // górna część nieba – typowe polskie niebo (szaro-niebieskie)
    SKY_BOTTOM: '#C4CDD4', // dolna część nieba – jasny horyzont (srebrzysto-szary)
    GROUND: '#C84C0C', // kolor kafelka ziemi
    GROUND_TOP: '#58A848', // zielony wierzch ziemi
    BRICK: '#C84C0C', // kolor cegły
    QUESTION_BLOCK: '#F8B800', // kolor bloku z pytajnikiem
    PLAYER_BODY: '#E83030', // kolor ciała gracza (czapka)
    PLAYER_SKIN: '#F8C060', // kolor skóry gracza
    PLAYER_OVERALLS: '#3080E8', // kolor spodni gracza
    COIN: '#F8D800', // kolor monety
    GOOMBA: '#A84000', // kolor goomby
    KOOPA: '#30A030', // kolor koopy
    PIPE: '#38A038', // kolor rury
    FLAG_POLE: '#D8D8D8', // kolor masztu flagi
    FLAG: '#30D030', // kolor flagi
  },

  // ─────────────────────────────────────────────────────────────
  //  DEBUGOWANIE
  // ─────────────────────────────────────────────────────────────
  DEBUG: {
    SHOW_HITBOXES: false, // rysuj prostokąty kolizji (true = włączone)
    SHOW_FPS: true,  // pokazuj licznik FPS
    SHOW_TILE_GRID: false, // pokazuj siatkę kafelków
    INVINCIBLE_PLAYER: false, // gracz nietykalny (do testowania)
  },
};
