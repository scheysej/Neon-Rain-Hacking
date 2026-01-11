# Neon Rain - Quick Start Guide

## What is Neon Rain?

Neon Rain is a cyberpunk hacking simulation game for tabletop RPG one-shots. Players log into simulated terminals with virtual filesystems, solve puzzles, and interact with a security AI while the GM/admin observes and manipulates sessions in real-time.

## Features

✅ **Per-player isolated sessions** - Each player gets their own filesystem  
✅ **Terminal interface** - Real xterm.js terminal with full command support  
✅ **Puzzle system** - Encryption, file recovery, and more  
✅ **Security AI** - Reactive AI that responds to player actions  
✅ **Admin dashboard** - Real-time observation and control  
✅ **Virtual filesystem** - JSON-backed filesystem with encryption support  

## Getting Started

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Start the Servers
```bash
npm run dev
```

This starts:
- Backend on http://localhost:3010
- Frontend on http://localhost:5173

### 3. Login

**Default Admin Account:**
- Username: `admin`
- Password: `admin123`

Or register a new player account from the login page.

## How to Play

### As a Player

1. **Register/Login** - Create an account or login
2. **Boot Sequence** - Watch the boot animation
3. **Explore** - Use terminal commands:
   - `ls` - List files
   - `cd <path>` - Change directory
   - `cat <file>` - Read file
   - `search <pattern>` - Search files
   - `decrypt <file> --key <key>` - Decrypt files
   - `help` - Show all commands

4. **Solve Puzzles** - Find clues, decrypt files, navigate the filesystem
5. **Avoid AI Detection** - The security AI monitors your actions!

### As an Admin/GM

1. **Login as Admin** - Use the admin account
2. **View Sessions** - See all active player sessions
3. **Observe** - Watch live terminal activity
4. **Control** - Push files, lock directories, send messages
5. **Manipulate** - Freeze terminals, escalate AI, inject content

## Example Puzzle Walkthrough

1. Player logs in and sees boot sequence
2. Player runs `ls` to see directory structure
3. Player runs `cat /home/notes.txt` - finds hint about ASCII art
4. Player runs `cat /home/ascii-art.txt` - finds key "42"
5. Player runs `decrypt /sec/secret.bin --key 42`
6. Puzzle solved! File is decrypted and flag file is added

## Admin Controls

- **Push File** - Add files to player's filesystem
- **Lock/Unlock** - Lock directories to block access
- **Send Message** - Send system messages to players
- **Freeze/Unfreeze** - Temporarily disable player input
- **View Logs** - See all commands executed

## Project Structure

```
neon-rain/
├── backend/          # Express + Socket.IO server
│   └── src/
│       ├── server.js
│       ├── services/    # VFS, puzzles, AI engines
│       └── db/          # Database setup
├── frontend/        # React + Vite app
│   └── src/
│       ├── pages/       # Login, Terminal, Admin
│       └── components/  # TerminalUI, BootSeq
└── content/         # Game content
    ├── filesystems/  # Campaign seed data
    └── puzzles/      # Puzzle definitions
```

## Customization

### Adding Puzzles

Create JSON files in `content/puzzles/`:

```json
{
  "id": "my-puzzle",
  "desc": "Description for GM",
  "triggers": [{"type": "open", "path": "/path/to/file"}],
  "validate": "key:123",
  "onSuccess": [{"action": "addFile", "target": "/flag.txt", "contents": "You win!"}]
}
```

### Modifying Filesystem

Edit `content/filesystems/campaign_seed.json` to change the initial filesystem structure.

### Styling

Edit `frontend/src/styles/index.css` and Tailwind config for theme changes.

## Troubleshooting

**Backend won't start:**
- Check if port 3000 is available
- Ensure SQLite database directory exists

**Frontend won't connect:**
- Verify backend is running
- Check browser console for errors
- Ensure CORS settings are correct

**Puzzles not triggering:**
- Check puzzle JSON syntax
- Verify trigger paths match filesystem
- Check backend console for errors

## Next Steps

- Add more puzzles to `content/puzzles/`
- Customize the filesystem in `content/filesystems/campaign_seed.json`
- Modify AI behavior in `backend/src/services/aiEngine.js`
- Add new commands in `backend/src/services/commandParser.js`

Enjoy your cyberpunk hacking simulation!
