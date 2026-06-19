module.exports = {
  apps: [{
    name: "sekunet-frontend",
    script: "./server.js",
    env: {
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      FORCE_COLOR: "0"
    }
  }]
};
