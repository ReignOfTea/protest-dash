const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['GITHUB_TOKEN', 'SESSION_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file.');
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';
// FRONTEND_URL is only needed for development redirects to Vite dev server
// In production, URLs are constructed from the request
const FRONTEND_URL = process.env.FRONTEND_URL || (isProduction ? undefined : 'http://localhost:5173');

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction, // Use secure cookies in production (HTTPS only)
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// CORS with credentials
app.use(cors({
  origin: isProduction 
    ? (origin, callback) => {
        // In production, allow requests from the same origin (when serving from same domain)
        // If you need to allow specific origins, set FRONTEND_URL
        if (!origin || !FRONTEND_URL) {
          callback(null, true); // Allow same-origin requests
        } else {
          callback(null, origin === FRONTEND_URL);
        }
      }
    : FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));

// API and auth routes will be defined below, before static file serving

// Config for the target repo and path
const OWNER = 'ReignOfTea';
const REPO = 'migrant_hotel_protests';
const BRANCH = 'master';
const FILE_DIR = 'data';
const USERS_FILE = path.join(__dirname, 'users.json');

function getGithubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN in environment');
  }
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

// Check if user ID is allowed (from local users.json)
async function isUserAllowed(discordId) {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      console.warn('users.json not found, creating empty file');
      fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
      return false;
    }
    const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
    const allowedIds = JSON.parse(fileContent);
    if (!Array.isArray(allowedIds)) {
      console.error('users.json must contain an array of Discord user IDs');
      return false;
    }
    return allowedIds.map(id => String(id)).includes(String(discordId));
  } catch (err) {
    console.error('Failed to check users.json:', err.message);
    return false;
  }
}

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Discord OAuth Strategy
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3001/auth/discord/callback',
  scope: ['identify']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const allowed = await isUserAllowed(profile.id);
    if (!allowed) {
      // Store the user ID in the error info so we can pass it to the frontend
      return done(null, false, { message: 'User not authorized', userId: profile.id });
    }
    return done(null, {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar
    });
  } catch (err) {
    return done(err);
  }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Simple helper to hit GitHub REST
async function ghGet(url) {
  return axios.get(url, { headers: getGithubHeaders() });
}

// Utility to fetch a file's JSON content and sha from GitHub
async function fetchJsonFile(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const response = await axios.get(url, { headers: getGithubHeaders() });
  const contentBase64 = response.data.content;
  const jsonText = Buffer.from(contentBase64, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonText);
  return { sha: response.data.sha, content: parsed };
}

// ===== AUTH ROUTES =====
app.get('/api/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({ user: req.user });
  }
  return res.json({ user: null });
});

app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      // Extract userId from info if available
      const userId = info?.userId || '';
      const redirectUrl = isProduction && !FRONTEND_URL
        ? `${req.protocol}://${req.get('host')}?error=unauthorized${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`
        : `${FRONTEND_URL}?error=unauthorized${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
      return res.redirect(redirectUrl);
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      const redirectUrl = isProduction && !FRONTEND_URL
        ? `${req.protocol}://${req.get('host')}`
        : FRONTEND_URL;
      return res.redirect(redirectUrl);
    });
  })(req, res, next);
});

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

// ===== PROTECTED ROUTES =====
// GET current about.json content (legacy route for back-compat)
app.get('/api/about', requireAuth, async (req, res) => {
  try {
    const data = await fetchJsonFile(`${FILE_DIR}/about.json`);
    return res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    return res.status(status).json({ error: 'Failed to fetch about.json', details: message });
  }
});

// POST updated about.json content (legacy single-file update)
// Body: { content: object, commitMessage?: string, baseSha?: string }
app.post('/api/about', requireAuth, async (req, res) => {
  try {
    const { content, commitMessage, baseSha } = req.body || {};
    if (!content || typeof content !== 'object') {
      return res.status(400).json({ error: 'Invalid content payload' });
    }

    const jsonText = JSON.stringify(content, null, 4);
    const contentBase64 = Buffer.from(jsonText, 'utf8').toString('base64');

    // If baseSha is not provided, fetch current sha
    let currentSha = baseSha;
    if (!currentSha) {
      const head = await axios.get(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(`${FILE_DIR}/about.json`)}?ref=${encodeURIComponent(BRANCH)}`,
        { headers: getGithubHeaders() }
      );
      currentSha = head.data.sha;
    }

    const putResp = await axios.put(
      `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(`${FILE_DIR}/about.json`)}`,
      {
        message: commitMessage || 'Update about.json via dashboard',
        content: contentBase64,
        sha: currentSha,
        branch: BRANCH
      },
      { headers: getGithubHeaders() }
    );

    return res.json({ ok: true, commit: putResp.data.commit });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    return res.status(status).json({ error: 'Failed to update about.json', details: message });
  }
});

// Generic: GET a JSON file under data/
app.get('/api/file/:name', requireAuth, async (req, res) => {
  try {
    const name = req.params.name;
    if (!name || /\//.test(name)) {
      return res.status(400).json({ error: 'Invalid file name' });
    }
    const data = await fetchJsonFile(`${FILE_DIR}/${name}`);
    return res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    if (status === 404) {
      // File doesn't exist yet; return a default skeleton so the UI can create it
      const name = req.params.name;
      let defaultContent;
      if (name === 'locations.json') defaultContent = [];
      else if (name === 'times.json') defaultContent = [];
      else if (name === 'repeating-events.json') defaultContent = [];
      else if (name === 'live.json') defaultContent = [];
      else defaultContent = { title: '', sections: [] };
      return res.json({ sha: null, content: defaultContent, notFound: true });
    }
    const message = err.response?.data || { message: err.message };
    return res.status(status).json({ error: 'Failed to fetch file', details: message });
  }
});

// List editable files (static for now)
app.get('/api/files', requireAuth, async (req, res) => {
  return res.json({ files: ['about.json', 'attend.json', 'more.json', 'locations.json', 'times.json', 'repeating-events.json', 'live.json'] });
});

// Batch update multiple files in a single commit using Git Data API
// Body: { files: [{ path: string, content: object }], commitMessage?: string }
app.post('/api/batch', requireAuth, async (req, res) => {
  try {
    const { files, commitMessage } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const headers = getGithubHeaders();

    // 1) Get ref heads/BRANCH
    const refResp = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`,
      { headers }
    );
    const latestCommitSha = refResp.data.object.sha;

    // 2) Get the commit to find current tree
    const commitResp = await axios.get(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/commits/${latestCommitSha}`,
      { headers }
    );
    const baseTreeSha = commitResp.data.tree.sha;

    // 3) Create blobs for each file
    const blobPromises = files.map(async (file) => {
      const jsonText = JSON.stringify(file.content, null, 4);
      const blob = await axios.post(
        `https://api.github.com/repos/${OWNER}/${REPO}/git/blobs`,
        { content: jsonText, encoding: 'utf-8' },
        { headers }
      );
      return { path: file.path, sha: blob.data.sha };
    });
    const blobs = await Promise.all(blobPromises);

    // 4) Create a new tree
    const treeResp = await axios.post(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/trees`,
      {
        base_tree: baseTreeSha,
        tree: blobs.map(b => ({
          path: b.path,
          mode: '100644',
          type: 'blob',
          sha: b.sha,
        })),
      },
      { headers }
    );
    const newTreeSha = treeResp.data.sha;

    // 5) Create a commit
    const newCommitResp = await axios.post(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/commits`,
      {
        message: commitMessage || 'Update files via dashboard',
        tree: newTreeSha,
        parents: [latestCommitSha],
      },
      { headers }
    );
    const newCommitSha = newCommitResp.data.sha;

    // 6) Update the ref to point to the new commit
    await axios.patch(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`,
      { sha: newCommitSha, force: false },
      { headers }
    );

    return res.json({ ok: true, commitSha: newCommitSha });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    return res.status(status).json({ error: 'Batch update failed', details: message });
  }
});

// Latest Actions run (e.g. pages build) with jobs
app.get('/api/actions/latest', requireAuth, async (req, res) => {
  try {
    const perPage = 1;
    const runsResp = await ghGet(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?branch=${encodeURIComponent(BRANCH)}&per_page=${perPage}`);
    const run = runsResp.data?.workflow_runs?.[0];
    if (!run) return res.json({ run: null, jobs: [] });
    const jobsResp = await ghGet(`https://api.github.com/repos/${OWNER}/${REPO}/actions/runs/${run.id}/jobs?per_page=20`);
    return res.json({
      run: {
        id: run.id,
        name: run.name,
        event: run.event,
        status: run.status, // queued | in_progress | completed
        conclusion: run.conclusion, // success | failure | cancelled | null
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
      },
      jobs: (jobsResp.data?.jobs || []).map(j => ({
        id: j.id,
        name: j.name,
        status: j.status,
        conclusion: j.conclusion,
        started_at: j.started_at,
        completed_at: j.completed_at,
        html_url: j.html_url,
      })),
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    return res.status(status).json({ error: 'Failed to fetch actions status', details: message });
  }
});

// Serve static files and handle SPA routing (must be after all API routes)
if (isProduction) {
  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(path.join(__dirname, '../web/dist')));
  
  // Catch-all route: serve index.html for client-side routing
  // In Express 5, use app.use() to catch all unmatched routes
  app.use((req, res) => {
    // API and auth routes should have been handled above, so if we reach here
    // and it's an API/auth route, return 404
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return res.status(404).json({ error: 'Not found' });
    }
    // For all other routes, serve the SPA
    res.sendFile(path.join(__dirname, '../web/dist/index.html'));
  });
} else {
  // In development, redirect to Vite dev server (requires FRONTEND_URL)
  app.use((req, res) => {
    // API and auth routes should have been handled above
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!FRONTEND_URL) {
      return res.status(500).json({ error: 'FRONTEND_URL not configured for development' });
    }
    res.redirect(FRONTEND_URL + req.path);
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  if (isProduction) {
    console.log(`Serving production build from: ${path.join(__dirname, '../web/dist')}`);
  } else {
    console.log(`Redirecting to frontend dev server: ${FRONTEND_URL}`);
  }
});


