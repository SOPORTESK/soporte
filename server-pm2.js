const { exec } = require("child_process");
console.log("Starting Next.js...");
const nextProcess = exec("npm.cmd run dev");

nextProcess.stdout.on("data", (data) => console.log(data));
nextProcess.stderr.on("data", (data) => console.error(data));

nextProcess.on("exit", (code) => {
  console.log("Next.js process exited with code " + code);
  process.exit(code);
});
