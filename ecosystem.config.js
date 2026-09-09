module.exports = {
  apps: [{
    name: "sekunet-frontend",
    script: "./server.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: "3100",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }]
};
