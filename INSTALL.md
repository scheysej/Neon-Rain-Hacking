# Installation & Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Git (optional)

## Quick Start

1. **Install all dependencies:**
```bash
npm run install:all
```

This will install dependencies for:
- Root workspace
- Backend (Express, Socket.IO, SQLite)
- Frontend (React, Vite, xterm.js)

2. **Start development servers:**
```bash
npm run dev
```

This starts both:
- Backend server on http://localhost:3000
- Frontend dev server on http://localhost:5173

3. **Access the application:**
- Open http://localhost:5173 in your browser
- Login with default admin: `admin` / `admin123`
- Or register a new player account

## Manual Setup (if needed)

### Backend Setup
```bash
cd backend
npm install
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Database

The SQLite database is automatically created at `backend/data/neonrain.db` on first run.

Default admin account is created automatically:
- Username: `admin`
- Password: `admin123`

## Troubleshooting

### Port already in use
- Backend: Change `PORT` in `.env` or edit `backend/src/server.js` (default: 3010)
- Frontend: Change port in `frontend/vite.config.js`

### Database errors
- Delete `backend/data/neonrain.db` to reset
- The database will be recreated on next start

### Socket.IO connection issues
- Ensure backend is running on port 3010
- Check CORS settings in `backend/src/server.js`
- Verify frontend TerminalUI.jsx connects to correct port

## Production Build

```bash
# Build frontend
cd frontend
npm run build

# Start backend (production)
cd backend
npm start
```

The built frontend will be in `frontend/dist/` - serve it with a static file server or configure Express to serve it.
