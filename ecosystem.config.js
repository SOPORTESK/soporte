module.exports = {
  apps: [
    {
      name: "sekunet-chat",
      script: "node_modules/.bin/next",
      args: "dev -p 3100",
      cwd: "c:\\Users\\Taller SK\\Documents\\PROYECTOS\\Chat de Atención Sekunet",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "development",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
    },
  ],
};
