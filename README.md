---
title: NBA Draft Showdown
emoji: 🏀
colorFrom: purple
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# 🏀 NBA Draft Showdown


Multiplayer NBA Draft & Battle game — spin the wheel to get a random NBA team, draft an active player from their roster, and let Gemini AI evaluate who built the better squad.

This app is designed to run self-contained and is ready for easy deployment to **Hugging Face Spaces** (via Docker) or running locally.

## Features

- **No external DB dependencies**: Pulls active rosters directly from the public ESPN API and caches them in a local JSON database.
- **Dynamic updates**: Backed by a Python Flask server that automatically fetches latest rosters on startup/on-demand.
- **Keyless client-side AI**: Gemini evaluation is proxied securely through the backend server using your Hugging Face secret key (`GEMINI_API_KEY`), keeping your credentials private.
- **Premium dark-themed visual design**: Glassmorphic UI, high-contrast typography, and a custom canvas-based Lucky Wheel.

---

## Quick Start (Local)

1. **Install Flask**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Run Server**:
   ```bash
   python server.py
   ```
3. **Play**: Open `http://localhost:8080` in your web browser.

---

## Deploy to Hugging Face Spaces (Docker)

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Choose **Blank** or **Docker** as the SDK.
3. Commit and push this repository to your Space.
4. Set the following Space secret under **Settings** → **Variables and Secrets**:
   - `GEMINI_API_KEY`: Your Gemini API key from Google AI Studio.

---

## Game Rules

1. **Setup** — Choose 2–4 players, enter names.
2. **Draft** (5 rounds, snake order):
   - Current player **spins the wheel** → gets a random NBA team.
   - Player grid shows **only that team's roster**.
   - Pick **ONE player** from the roster.
   - Next player's turn → spin again → pick → repeat.
   - Each player drafts **5 total players** from various teams.
3. **Evaluate** — Gemini AI analyzes both rosters and declares a winner.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | HTML5, Tailwind CSS (CDN), Vanilla JS (ES Modules) |
| Wheel | HTML5 Canvas with ease-out animation |
| Backend | Flask (Python) serving local static files |
| Data Source | Live ESPN roster APIs + BBGM historic matches |
| AI Evaluation | Gemini `gemini-3.1-flash-lite` secure backend proxy |
| Markdown | `marked.js` for Gemini response rendering |

---

## File Structure

```
nba-draft-showdown/
├── index.html          # SPA shell (3 screens)
├── app.js              # Game engine + backend proxy integration
├── wheel.js            # Canvas Lucky Wheel component
├── style.css           # Custom CSS (contrast optimized)
├── server.py           # Flask backend server (handles data & Gemini API)
├── generate_rosters.py # CLI utility to manually fetch rosters
├── requirements.txt    # Python dependencies (Flask)
├── Dockerfile          # HF Spaces Docker configuration
├── .gitignore          # Excludes local files
└── README.md           # This file
```

## License

MIT
