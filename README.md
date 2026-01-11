# Neon Rain — Cyberpunk Hacking Simulation

A lightweight, immersive web-based hacking simulation game for tabletop RPG one-shots.

## Features

- Per-player login with isolated game sessions
- Terminal-style UI with virtual filesystem
- Puzzle system (encryption, file recovery, filesystem maze, AI interrogation)
- Admin dashboard for live observation and manipulation
- Security AI with reactive behavior

## Tech Stack

- **Frontend**: React + Vite + xterm.js
- **Backend**: Node.js + Express + Socket.IO
- **Storage**: SQLite (better-sqlite3)

## Quick Start

1. Install dependencies:
```bash
npm run install:all
```

2. Start development servers:
```bash
npm run dev
```

3. Access the application:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3010

## Default Accounts

- **Admin**: username: `admin`, password: `admin123`
- **Player**: Create account via login page

## Documentation

- See [QUICKSTART.md](./QUICKSTART.md) for gameplay guide
- See [INSTALL.md](./INSTALL.md) for detailed setup instructions

## Project Structure

```
neon-rain/
├── backend/          # Express server + Socket.IO
├── frontend/         # React app with xterm.js
└── content/          # Game content (puzzles, filesystems, logs)
```

## Development

- Backend runs on port 3010
- Frontend runs on port 5173 (Vite default)
- SQLite database is created automatically on first run

## License

MIT
