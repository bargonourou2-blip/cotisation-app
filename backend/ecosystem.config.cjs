/* ==========================================================================
   BâtiPlus — PM2 : redémarrage automatique de l'API (étape 14)
   Démarrage : pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
   Les secrets restent dans backend/.env (lu par serveur.js) : RIEN de secret ici.
   ========================================================================== */
module.exports = {
  apps: [
    {
      name: "batiplus-api",
      script: "serveur.js",
      cwd: __dirname,
      node_args: "--disable-warning=ExperimentalWarning",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 50,
      min_uptime: "10s",
      restart_delay: 2000,
      exp_backoff_restart_delay: 200,
      max_memory_restart: "400M",
      kill_timeout: 8000,
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
