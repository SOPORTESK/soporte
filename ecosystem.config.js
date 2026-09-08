module.exports = {
  apps: [{
    name: "sekunet-frontend",
    script: "./server.js",
    env: {
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      FORCE_COLOR: "0"
    }
  }]
};
