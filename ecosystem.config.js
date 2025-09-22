module.exports = {
  apps: [
    {
      name: 'kyle',
      script: 'bun',
      args: 'run src/index.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // Logging
      out_file: './logs/kyle-out.log',
      error_file: './logs/kyle-error.log',
      log_file: './logs/kyle-combined.log',
      time: true,

      // Process management
      kill_timeout: 3000,
      listen_timeout: 3000,

      // Health monitoring
      min_uptime: '10s',
      max_restarts: 10,

      // Advanced settings
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env_production: {
        NODE_ENV: "production",
      },
    }
  ],
  deploy: {
    production: {
      "user": "jasonvh",
      "host": ["rigel.usbx.me"],
      "ref": "origin/main",
      "repo": "https://github.com/Jason-vh/kyle",
      "path": "/home/jasonvh/kyle",
      "post-deploy": "/home/jasonvh/.bun/bin/bun ci && /home/jasonvh/.bun/bin/bunx pm2 startOrRestart ecosystem.config.js --env production",
    }
  }
};
