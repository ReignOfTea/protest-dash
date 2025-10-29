module.exports = {
  apps: [{
    name: 'protest-dash',
    script: './server/index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      // Load from .env file
      // PM2 will also read from .env if using pm2 ecosystem or pm2 start with --env-file
    },
    // PM2 can also load .env automatically with:
    // pm2 start ecosystem.config.js --env-file .env
    // or you can specify individual env vars here
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};

