=============================================
  TILE TEXTURES FOR LEVEL.JS
=============================================

Place your tile texture PNG files here.
Each file should be a 32x32 pixel PNG image
(matching the TILE_SIZE in config.js).

Expected filenames:
  tile_ground.png    - Ground/earth tile (ID 1 & 4)
  tile_brick.png     - Breakable brick (ID 2)
  tile_question.png  - Question mark block (ID 3)
  tile_used.png      - Used/spent block (ID 10)
  tile_pipe_top.png  - Pipe top section (ID 5)
  tile_pipe_variant.png - New pipe variant (ID 13)

+/* pipe variant preview */
+.tile-13 {
+  background: url('../assets/textures/tiles/pipe_variant.png');
+  background-size: contain;
+  background-repeat: no-repeat;
+  background-position: center;
+}

  tile_cloud.png     - Cloud decoration (ID 11)
  tile_coin.png      - Coin collectible (ID 7)

If a file is missing, the game will
automatically generate a fallback sprite.
