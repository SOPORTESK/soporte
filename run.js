const { spawn } = require('child_process');
const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true
});
child.on('close', code => {
  console.log('Child exited with code ' + code);
  process.exit(code);
});
