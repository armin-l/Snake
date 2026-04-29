# Snake

A browser-based Snake game with levelling, perks, combos, and an online leaderboard.

## How to play

Open `index.html` in any modern browser — no build step or server required.

| Control | Action |
|---------|--------|
| Arrow keys / WASD | Move the snake |
| P | Pause / resume |
| On-screen buttons | Mobile touch controls |

## Features

- **Levels & XP** – eat food to fill the XP bar; each level-up lets you pick a permanent perk.
- **Perks** – five rarity tiers (Common → Legendary, plus Cursed). Perks grant bonuses like body shrinks, bonus score per food, self-collision survival, wall passes, and more.
- **Combo multiplier** – eat consecutive food within the combo window to multiply your score.
- **Global leaderboard** – top scores are stored and fetched from a Supabase backend.
- **Local high scores** – best score is also persisted in `localStorage`.

## File overview

| File | Purpose |
|------|---------|
| `index.html` | Game markup and UI structure |
| `snake.css` | Styling |
| `snake.js` | Main game loop, rendering, and input handling |
| `snake-logic.js` | Pure game logic (XP, scoring, movement, collision) |
| `perks.js` | Perk definitions and perk-selection logic |
| `snake-api.js` | Supabase API helpers (fetch & post scores) |
| `snake.tests.js` | Unit tests |
| `snake.tests.html` | Test runner (open in browser to run 20 tests) |

## Running the tests

Open `snake.tests.html` in a browser. All 37 tests should pass.
