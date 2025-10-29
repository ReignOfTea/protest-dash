# Protest Dashboard

A dashboard application for managing protest event data stored in a GitHub repository.

## Features

- Edit JSON files directly via a web interface
(Multi-file batch editing)
- Discord OAuth authentication with user allowlist
- GitHub Actions pipeline status monitoring
- Real-time synchronization with GitHub repository

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- GitHub Personal Access Token
- Discord Application (for OAuth)

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd protest-dash
```

2. Install dependencies:
```bash
npm install
cd web && npm install && cd ..
```

3. Create a `.env` file in the root directory (copy from `.env.example`):
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
- `GITHUB_TOKEN`: Your GitHub Personal Access Token with `repo` scope
- `DISCORD_CLIENT_ID`: Your Discord Application Client ID
- `DISCORD_CLIENT_SECRET`: Your Discord Application Client Secret
- `DISCORD_CALLBACK_URL`: Your Discord OAuth callback URL
- `SESSION_SECRET`: A secure random string for session encryption
- `FRONTEND_URL`: The frontend URL (http://localhost:5173 for dev)
- `PORT`: Backend server port (default: 3001)
- `NODE_ENV`: Environment mode (development/production)

5. Create `users.json` in the root directory with authorized Discord user IDs:
```json
[
  "discord_user_id_1",
  "discord_user_id_2"
]
```

## Discord OAuth Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to OAuth2 → General
4. Add redirect URL: `http://localhost:3001/auth/discord/callback` (or your production URL)
5. Copy Client ID and Client Secret to `.env`
6. In OAuth2 → URL Generator, select scope: `identify`

## Development

Run both frontend and backend in development mode:
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Production Deployment

1. Build the frontend:
```bash
cd web
npm run build
cd ..
```

2. Set environment variables for production:
```bash
export NODE_ENV=production
export FRONTEND_URL=https://your-domain.com
export SESSION_SECRET=your-secure-random-secret
export DISCORD_CALLBACK_URL=https://your-domain.com/auth/discord/callback
```

3. Start the production server:

**Option A: Using npm (simple):**
```bash
npm start
```

**Option B: Using PM2 (recommended for production):**
```bash
# Install PM2 globally (if not already installed)
npm install -g pm2

# Start with PM2 using the ecosystem config (automatically loads .env)
pm2 start ecosystem.config.js

# Or start directly with .env file:
pm2 start server/index.js --name protest-dash --env-file .env

# View logs
pm2 logs protest-dash

# Monitor
pm2 monit

# Stop
pm2 stop protest-dash

# Restart
pm2 restart protest-dash

# Delete from PM2
pm2 delete protest-dash

# Save PM2 process list for auto-start on reboot
pm2 save
pm2 startup
```

**Note:** The server automatically loads the `.env` file from the project root. Make sure your `.env` file exists and contains all required variables.

The server will serve the built frontend and handle API requests on the same port.

## Project Structure

```
protest-dash/
├── server/           # Express backend
│   └── index.js     # Main server file
├── web/             # React frontend
│   ├── src/
│   └── dist/        # Built frontend (generated)
├── users.json       # Authorized Discord user IDs (not in git)
├── .env             # Environment variables (not in git)
└── .env.example     # Example environment variables
```

## Security Notes

- Never commit `.env` or `users.json` to version control
- Use strong, random `SESSION_SECRET` in production
- Enable HTTPS in production
- Keep `users.json` up to date with only trusted Discord user IDs

## License

ISC

