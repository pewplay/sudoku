# Sudoku for PewPlay

This directory contains the original static game adapted for the PewPlay game template. Open `index.html` to play.

`game.json` holds the game page text. `preview.png` and `cover.png` provide the page images. The PewPlay workflow checks pushes to `preview` and `main`. The game remains a draft until you remove `"draft": true` after reviewing it.

Game controls: Fill the grid so each row, column and 3 × 3 box contains each digit from 1 to 9 once.

## Update (October 2026)

- Rewritten in plain JavaScript (jQuery removed): same game, cleaner and faster.
- Responsive layout that keeps the board as large as possible: board + pad stacked in portrait, side panel in landscape.
- Permanent on-screen number pad (no popup, no mobile keyboard), Undo, Erase, Notes with 9 pencil marks per cell, remaining-digit counters.
- Keyboard play on desktop (arrows, 1–9, Shift+1–9 notes, N, Delete, Ctrl+Z).
- Generator now makes puzzles with a single solution at four difficulty levels; conflicts shown in red.
- In-page win screen with time and best time; game auto-saved (`sudoku:save`, `sudoku:best`, `sudoku:difficulty`).
- New cover and screenshots; preview icon rescaled into the safe central area.
