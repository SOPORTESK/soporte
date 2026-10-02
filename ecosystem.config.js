module.exports = {
  apps: [{
    name: "sekunet-frontend",
    script: "./server.js",
    cwd: __dirname,
    instances: 1,
    exec_mode: "fork",
    node_args: "--max-old-space-size=2048",
    autorestart: true,
    max_memory_restart: "1500M",
    env: {
      NODE_ENV: "production",
      PORT: "3100",
      NEXT_TELEMETRY_DISABLED: "1"
    }
  }]
};
