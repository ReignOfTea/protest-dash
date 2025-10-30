const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const fs = require('fs');
const path = require('path');

// Load .env file from project root (one level up from server directory)
// This ensures PM2 and other process managers can find it
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Logging setup (LOG_LEVEL: debug | info | warn | error)
const LOG_LEVEL = (process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug')).toLowerCase();
const LEVEL_RANK = { debug: 10, info: 20, warn: 30, error: 40 };
const currentRank = LEVEL_RANK[LOG_LEVEL] || LEVEL_RANK.info;
function shouldLog(level) { return (LEVEL_RANK[level] || 999) >= currentRank; }
function ts() { return new Date().toISOString(); }
const logger = {
  debug: (...args) => { if (shouldLog('debug')) console.debug(`[${ts()}] [DEBUG]`, ...args); },
  info:  (...args) => { if (shouldLog('info'))  console.info(`[${ts()}] [INFO ]`, ...args); },
  warn:  (...args) => { if (shouldLog('warn'))  console.warn(`[${ts()}] [WARN ]`, ...args); },
  error: (...args) => { if (shouldLog('error')) console.error(`[${ts()}] [ERROR]`, ...args); },
};

// Development bypass mode - skip Discord OAuth
const DEV_BYPASS_AUTH = !isProduction && process.env.DEV_BYPASS_AUTH === 'true';
if (DEV_BYPASS_AUTH) {
  logger.warn('DEVELOPMENT MODE: Authentication bypass enabled');
  logger.warn('This should NEVER be enabled in production!');
}

// Validate required environment variables
// In development, Discord OAuth is optional if DEV_BYPASS_AUTH is enabled
const requiredEnvVars = ['GITHUB_TOKEN', 'SESSION_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables:', missingEnvVars.join(', '));
  logger.error('Please check your .env file.');
  process.exit(1);
}

// Trust proxy headers (important when behind Nginx Proxy Manager)
// This ensures req.protocol and req.get('host') are correct for redirects
app.set('trust proxy', true);

// FRONTEND_URL is only needed for development redirects to Vite dev server
// In production, URLs are constructed from the request
const FRONTEND_URL = process.env.FRONTEND_URL || (isProduction ? undefined : 'http://localhost:5173');

// Session configuration
// Use a session store to ensure persistence across requests
const sessionStore = new (require('express-session').MemoryStore)();

// Determine if we should use secure cookies and sameSite settings
// Only use secure cookies when actually using HTTPS, not just when NODE_ENV=production
// Browsers will reject secure cookies on HTTP connections (like localhost)
// Also, sameSite: 'none' REQUIRES secure: true, so we can't use 'none' with HTTP
const useSecureCookies = isProduction && process.env.USE_HTTPS === 'true';
const sameSiteSetting = useSecureCookies ? 'none' : 'lax'; // 'none' requires secure: true

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true, // Force save session even if not modified (helps with Passport)
  saveUninitialized: false,
  store: sessionStore, // Use in-memory store for development (consider Redis for production)
  name: 'connect.sid', // Explicit session name
  cookie: { 
    secure: useSecureCookies, // Only true when actually using HTTPS
    httpOnly: true,
    sameSite: sameSiteSetting, // 'none' requires secure: true, so use 'lax' for HTTP
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/', // Ensure cookie is available for all paths
    domain: undefined, // Don't restrict domain - let browser decide
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

// Permissions helpers
function loadUsersFile() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
      return [];
    }
    const fileContent = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(fileContent);
    if (Array.isArray(parsed)) {
      // Back-compat: if array of strings, treat as editor users
      if (parsed.length === 0) return [];
      if (typeof parsed[0] === 'string') {
        return parsed.map(id => ({ id: String(id), role: 'editor' }));
      }
      // Normalize objects
      return parsed.map(u => ({
        id: String(u.id),
        role: u.role === 'admin' ? 'admin' : 'editor',
        username: u.username ? String(u.username) : undefined,
        discriminator: u.discriminator ? String(u.discriminator) : undefined,
        avatar: u.avatar ? String(u.avatar) : undefined,
        anonHash: u.anonHash ? String(u.anonHash) : undefined,
      }));
    }
    return [];
  } catch (err) {
    logger.error('Failed to read users.json:', err.message);
    return [];
  }
}

function saveUsersFile(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return true;
  } catch (err) {
    logger.error('Failed to write users.json:', err.message);
    return false;
  }
}

function getUserRecord(discordId) {
  const users = loadUsersFile();
  const idStr = String(discordId);
  const rec = users.find(u => String(u?.id) === idStr || String(u) === idStr);
  if (!rec) return null;
  if (typeof rec === 'string') return { id: idStr, role: 'editor' };
  return {
    id: String(rec.id),
    role: rec.role === 'admin' ? 'admin' : 'editor',
    username: rec.username,
    discriminator: rec.discriminator,
    avatar: rec.avatar,
    anonHash: rec.anonHash,
  };
}

function upsertUserProfile({ id, username, discriminator, avatar }) {
  const idStr = String(id);
  const users = loadUsersFile();
  const normalized = users.map(u => (typeof u === 'string' ? { id: String(u), role: 'editor' } : u));
  let found = false;
  for (let i = 0; i < normalized.length; i++) {
    if (String(normalized[i].id) === idStr) {
      found = true;
      normalized[i] = {
        id: idStr,
        role: normalized[i].role === 'admin' ? 'admin' : 'editor',
        username: username || normalized[i].username,
        discriminator: discriminator || normalized[i].discriminator,
        avatar: avatar || normalized[i].avatar,
        anonHash: normalized[i].anonHash || generateAnonHash(),
      };
      break;
    }
  }
  if (!found) {
    normalized.push({
      id: idStr,
      role: 'editor',
      username,
      discriminator,
      avatar,
      anonHash: generateAnonHash(),
    });
  }
  saveUsersFile(normalized);
}

function generateAnonHash() {
  const crypto = require('crypto');
  return crypto.randomBytes(8).toString('hex'); // 16 hex chars
}

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
  const rec = getUserRecord(discordId);
  return !!rec;
}

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Discord OAuth Strategy - only configure if not in bypass mode
if (!DEV_BYPASS_AUTH) {
  passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3001/auth/discord/callback',
    scope: ['identify']
  }, async (accessToken, refreshToken, profile, done) => {
  try {
    const rec = getUserRecord(profile.id);
    if (!rec) {
      // Store the user ID in the error info so we can pass it to the frontend
      return done(null, false, { message: 'User not authorized', userId: profile.id });
    }
    // Update stored profile and ensure anon hash exists
    upsertUserProfile({ id: profile.id, username: profile.username, discriminator: profile.discriminator, avatar: profile.avatar });
    return done(null, {
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      avatar: profile.avatar,
      isAdmin: rec.role === 'admin'
    });
  } catch (err) {
    return done(err);
  }
  }));
}

// Auth middleware
function requireAuth(req, res, next) {
  // In development bypass mode, allow all requests
  if (DEV_BYPASS_AUTH) {
    return next();
  }
  
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Simple helper to hit GitHub REST
async function ghGet(url) {
  logger.debug('GitHub GET', { url });
  return axios.get(url, { headers: getGithubHeaders() });
}

// Utility to fetch a file's JSON content and sha from GitHub
async function fetchJsonFile(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;
  const response = await axios.get(url, { headers: getGithubHeaders() });
  const contentBase64 = response.data.content;
  const jsonText = Buffer.from(contentBase64, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonText);
  logger.debug('Fetched JSON from GitHub', { path, sha: response.data.sha });
  return { sha: response.data.sha, content: parsed };
}

// ===== AUTH ROUTES =====
app.get('/api/auth/me', (req, res) => {
  // In development bypass mode, return a mock user
  if (DEV_BYPASS_AUTH) {
    return res.json({
      user: {
        id: 'dev-user-123',
        username: 'dev-user',
        discriminator: '0',
        avatar: null,
        isAdmin: true
      }
    });
  }
  
  logger.debug('Auth check', {
    sessionId: req.sessionID,
    isAuthenticated: req.isAuthenticated(),
    user: req.user,
    hasCookie: !!req.headers.cookie,
  });
  
  // Check if session exists in store (async, but log anyway)
  if (req.sessionID) {
    sessionStore.get(req.sessionID, (err, session) => {
      if (err) {
        logger.error('Error checking session store:', err);
      } else {
        logger.debug('Session in store check', { sessionId: req.sessionID, found: !!session });
      }
    });
  }
  
  if (req.isAuthenticated()) {
    // Attach latest isAdmin in case roles changed after login
    const rec = getUserRecord(req.user?.id);
    const userOut = {
      ...(req.user || {}),
      isAdmin: !!rec && rec.role === 'admin'
    };
    return res.json({ user: userOut });
  }
  return res.json({ user: null });
});

// Discord OAuth routes - only register if not in bypass mode
if (!DEV_BYPASS_AUTH) {
  app.get('/auth/discord', passport.authenticate('discord'));
  
  app.get('/auth/discord/callback', (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      logger.error('Discord OAuth error:', err);
      return next(err);
    }
    if (!user) {
      // Extract userId from info if available
      const userId = info?.userId || '';
      let redirectUrl;
      if (isProduction && !FRONTEND_URL) {
        // Auto-detect from request
        const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
        const host = req.get('host') || req.get('x-forwarded-host') || 'localhost';
        redirectUrl = `${protocol}://${host}?error=unauthorized${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
      } else {
        redirectUrl = `${FRONTEND_URL}?error=unauthorized${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
      }
      return res.redirect(redirectUrl);
    }
    req.logIn(user, (err) => {
      if (err) {
        logger.error('Login error:', err);
        return next(err);
      }
      
      // Passport stores user in req.session.passport.user via serialization
      // Ensure session is saved - Passport should have already modified it via logIn
      req.session.save((err) => {
        if (err) {
          logger.error('Session save error:', err);
          return next(err);
        }
        
        // Verify session is saved in the store
        const savedSessionId = req.sessionID;
        sessionStore.get(savedSessionId, (err, session) => {
          if (err) {
            logger.error('Error checking session store:', err);
          } else {
            logger.debug('Session in store:', { found: !!session });
          }
          
          logger.info('OAuth success', { sessionId: savedSessionId, user: req.user && { id: req.user.id, username: req.user.username } });
          
          let redirectUrl;
          if (isProduction && !FRONTEND_URL) {
            // Auto-detect from request
            const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
            const host = req.get('host') || req.get('x-forwarded-host') || 'localhost';
            redirectUrl = `${protocol}://${host}`;
          } else {
            // In development, use the request origin if accessing directly, otherwise use FRONTEND_URL
            if (!FRONTEND_URL || req.get('host')?.includes('localhost')) {
              const protocol = req.protocol;
              const host = req.get('host') || 'localhost:3001';
              redirectUrl = `${protocol}://${host}`;
            } else {
              redirectUrl = FRONTEND_URL;
            }
          }
          
          logger.debug('OAuth redirect', { redirectUrl });
          
          // express-session automatically sets the cookie when we save
          // The redirect response should include the Set-Cookie header
          logger.debug('OAuth final session', { sessionId: savedSessionId });
          
          return res.redirect(302, redirectUrl);
        });
      });
    });
  })(req, res, next);
  });
}

app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ ok: true });
  });
});

// ===== ADMIN ROUTES =====
function requireAdmin(req, res, next) {
  if (DEV_BYPASS_AUTH) return next();
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
  const rec = getUserRecord(req.user?.id);
  if (rec && rec.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

// List users (normalized)
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = loadUsersFile().map(u => {
    if (typeof u === 'string') return { id: String(u), role: 'editor' };
    return {
      id: String(u.id),
      role: u.role === 'admin' ? 'admin' : 'editor',
      username: u.username,
      discriminator: u.discriminator,
      avatar: u.avatar,
    };
  });
  res.json({ users });
});

// Add user { id, role }
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { id, role } = req.body || {};
  const userId = String(id || '').trim();
  const userRole = role === 'admin' ? 'admin' : 'editor';
  if (!userId) return res.status(400).json({ error: 'Missing id' });
  const users = loadUsersFile().map(u => (typeof u === 'string' ? { id: String(u), role: 'editor' } : { id: String(u.id), role: u.role === 'admin' ? 'admin' : 'editor' }));
  if (users.some(u => u.id === userId)) return res.status(409).json({ error: 'User already exists' });
  users.push({ id: userId, role: userRole });
  if (!saveUsersFile(users)) return res.status(500).json({ error: 'Failed to save users' });
  res.json({ ok: true });
});

// Update role
app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.params.id || '').trim();
  const { role } = req.body || {};
  const userRole = role === 'admin' ? 'admin' : 'editor';
  const users = loadUsersFile().map(u => (typeof u === 'string' ? { id: String(u), role: 'editor' } : { id: String(u.id), role: u.role === 'admin' ? 'admin' : 'editor' }));
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  users[idx].role = userRole;
  if (!saveUsersFile(users)) return res.status(500).json({ error: 'Failed to save users' });
  res.json({ ok: true });
});

// Remove user
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.params.id || '').trim();
  let users = loadUsersFile().map(u => (typeof u === 'string' ? { id: String(u), role: 'editor' } : { id: String(u.id), role: u.role === 'admin' ? 'admin' : 'editor' }));
  const before = users.length;
  users = users.filter(u => u.id !== userId);
  if (users.length === before) return res.status(404).json({ error: 'Not found' });
  if (!saveUsersFile(users)) return res.status(500).json({ error: 'Failed to save users' });
  res.json({ ok: true });
});

// ===== PROTECTED ROUTES =====
// GET current about.json content (legacy route for back-compat)
app.get('/api/about', requireAuth, async (req, res) => {
  try {
    logger.debug('GET /api/about', { userId: req.user?.id });
    const data = await fetchJsonFile(`${FILE_DIR}/about.json`);
    return res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    logger.error('Failed to fetch about.json', { status, message });
    return res.status(status).json({ error: 'Failed to fetch about.json', details: message });
  }
});

// POST updated about.json content (legacy single-file update)
// Body: { content: object, commitMessage?: string, baseSha?: string }
app.post('/api/about', requireAuth, async (req, res) => {
  try {
    logger.info('POST /api/about', { userId: req.user?.id });
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

    logger.info('about.json updated', { commitSha: putResp.data.commit?.sha });
    return res.json({ ok: true, commit: putResp.data.commit });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    logger.error('Failed to update about.json', { status, message });
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
    logger.debug('GET /api/file/:name', { userId: req.user?.id, name });
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
      logger.info('File not found on GitHub, returning default', { name });
      return res.json({ sha: null, content: defaultContent, notFound: true });
    }
    const message = err.response?.data || { message: err.message };
    logger.error('Failed to fetch file', { name: req.params.name, status, message });
    return res.status(status).json({ error: 'Failed to fetch file', details: message });
  }
});

// List editable files (static for now)
app.get('/api/files', requireAuth, async (req, res) => {
  logger.debug('GET /api/files', { userId: req.user?.id });
  return res.json({ files: ['about.json', 'attend.json', 'more.json', 'locations.json', 'times.json', 'repeating-events.json', 'live.json'] });
});

// Helper function to generate detailed change report
function generateChangeReport(oldContent, newContent, filePath) {
  const fileName = filePath.split('/').pop();
  const report = [];
  
  // Compare arrays (for locations.json, times.json, etc.)
  if (Array.isArray(oldContent) && Array.isArray(newContent)) {
    const oldCount = oldContent.length;
    const newCount = newContent.length;
    
    if (oldCount !== newCount) {
      report.push(`  - ${fileName}: ${oldCount} → ${newCount} entries`);
      if (oldCount < newCount) {
        report.push(`    • Added ${newCount - oldCount} new ${newCount - oldCount === 1 ? 'entry' : 'entries'}`);
      } else {
        report.push(`    • Removed ${oldCount - newCount} ${oldCount - newCount === 1 ? 'entry' : 'entries'}`);
      }
    } else {
      // Same count, check for modifications
      let modified = 0;
      for (let i = 0; i < oldCount; i++) {
        if (JSON.stringify(oldContent[i]) !== JSON.stringify(newContent[i])) {
          modified++;
        }
      }
      if (modified > 0) {
        report.push(`  - ${fileName}: Modified ${modified} ${modified === 1 ? 'entry' : 'entries'}`);
      } else {
        report.push(`  - ${fileName}: No changes detected`);
      }
    }
  } else if (typeof oldContent === 'object' && typeof newContent === 'object') {
    // Compare objects (for about.json, attend.json, more.json)
    const oldTitle = oldContent.title || '';
    const newTitle = newContent.title || '';
    const oldSections = oldContent.sections || [];
    const newSections = newContent.sections || [];
    
    const changes = [];
    if (oldTitle !== newTitle) {
      changes.push('title');
    }
    if (oldSections.length !== newSections.length) {
      changes.push(`${oldSections.length} → ${newSections.length} sections`);
    } else {
      const modifiedSections = oldSections.filter((oldSection, idx) => {
        return JSON.stringify(oldSection) !== JSON.stringify(newSections[idx]);
      });
      if (modifiedSections.length > 0) {
        changes.push(`${modifiedSections.length} modified ${modifiedSections.length === 1 ? 'section' : 'sections'}`);
      }
    }
    
    if (changes.length > 0) {
      report.push(`  - ${fileName}: ${changes.join(', ')}`);
    } else {
      report.push(`  - ${fileName}: No changes detected`);
    }
  }
  
  return report.length > 0 ? report : [`  - ${fileName}: Updated`];
}

// Batch update multiple files in a single commit using Git Data API
// Body: { files: [{ path: string, content: object }], commitMessage?: string }
app.post('/api/batch', requireAuth, async (req, res) => {
  try {
    const { files, commitMessage } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    
    // Get user info
    const user = req.user;
    const userId = user?.id || 'unknown';
    const rec = getUserRecord(userId);
    const anon = rec?.anonHash || 'unknown';
    logger.info('POST /api/batch', { userId, anon, fileCount: files.length });
    
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

    // Fetch old versions of files for comparison
    const oldContents = await Promise.all(files.map(async (file) => {
      try {
        const response = await axios.get(
          `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(file.path)}?ref=${encodeURIComponent(BRANCH)}`,
          { headers }
        );
        const contentBase64 = response.data.content;
        const jsonText = Buffer.from(contentBase64, 'base64').toString('utf8');
        return { path: file.path, content: JSON.parse(jsonText) };
      } catch (err) {
        // File doesn't exist yet - return appropriate default
        const fileName = file.path.split('/').pop();
        if (fileName === 'locations.json' || fileName === 'times.json' || 
            fileName === 'repeating-events.json' || fileName === 'live.json') {
          return { path: file.path, content: [] };
        }
        return { path: file.path, content: { title: '', sections: [] } };
      }
    }));

    // Generate detailed change report
    const changeReports = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const oldContent = oldContents[i]?.content;
      const report = generateChangeReport(oldContent, file.content, file.path);
      changeReports.push(...report);
    }

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

    // Build detailed commit message
    let fullCommitMessage = commitMessage || 'Update files via dashboard';
    
    // Add user info (anonymous)
    fullCommitMessage += `\n\nUser: ${anon}`;
    
    // Add detailed change report
    if (changeReports.length > 0) {
      fullCommitMessage += '\n\nChanges:';
      fullCommitMessage += '\n' + changeReports.join('\n');
    }

    // 5) Create a commit
    const newCommitResp = await axios.post(
      `https://api.github.com/repos/${OWNER}/${REPO}/git/commits`,
      {
        message: fullCommitMessage,
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

    logger.info('Batch commit successful', { commitSha: newCommitSha });
    return res.json({ ok: true, commitSha: newCommitSha });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data || { message: err.message };
    logger.error('Batch update failed', { status, message });
    return res.status(status).json({ error: 'Batch update failed', details: message });
  }
});

// Latest Actions run (e.g. pages build) with jobs
app.get('/api/actions/latest', requireAuth, async (req, res) => {
  try {
    logger.debug('GET /api/actions/latest', { userId: req.user?.id });
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
    logger.error('Failed to fetch actions status', { status, message });
    return res.status(status).json({ error: 'Failed to fetch actions status', details: message });
  }
});

// Serve static files and handle SPA routing (must be after all API routes)
// Check if dist folder exists - if it does, serve it regardless of NODE_ENV
const distPath = path.join(__dirname, '../web/dist');
const distExists = fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'));

if (isProduction || distExists) {
  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath));
  
  // Catch-all route: serve index.html for client-side routing
  // In Express 5, use app.use() to catch all unmatched routes
  app.use((req, res) => {
    // API and auth routes should have been handled above, so if we reach here
    // and it's an API/auth route, return 404
    if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
      return res.status(404).json({ error: 'Not found' });
    }
    // For all other routes, serve the SPA
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // In development without dist folder, redirect to Vite dev server (requires FRONTEND_URL)
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
  logger.info(`Server listening on http://localhost:${port}`);
  if (isProduction || distExists) {
    logger.info(`Serving production build from: ${distPath}`);
  } else {
    logger.info(`Redirecting to frontend dev server: ${FRONTEND_URL}`);
  }
});


