const { spawn } = require('child_process');
const path = require('path');

console.log('\n\x1b[1m\x1b[36m===================================================\x1b[0m');
console.log('\x1b[1m\x1b[35m  🏆 Starting QuizMaster Platform (Full Stack) 🏆  \x1b[0m');
console.log('\x1b[1m\x1b[36m===================================================\x1b[0m\n');
console.log('  \x1b[32m✔\x1b[0m API Server   -> \x1b[4mhttp://localhost:5000\x1b[0m');
console.log('  \x1b[32m✔\x1b[0m Client App   -> \x1b[4mhttp://localhost:5173\x1b[0m\n');
console.log('  \x1b[33mCredentials:\x1b[0m');
console.log('  - Admin   : Username \x1b[1madmin\x1b[0m  | Password \x1b[1mAdminPassword123!\x1b[0m');
console.log('  - Student : Username \x1b[1mstudent\x1b[0m (ID: \x1b[1mQM-DEMO1\x1b[0m) | Password \x1b[1mStudent12345!\x1b[0m\n');
console.log('---------------------------------------------------\n');

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function startProcess(name, prefixColor, args, cwd) {
  const proc = spawn(npmCmd, args, {
    cwd: path.resolve(__dirname, cwd),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.log(`${prefixColor}[${name}]\x1b[0m ${line}`);
    }
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().trimEnd().split('\n');
    for (const line of lines) {
      console.error(`${prefixColor}[${name}]\x1b[0m \x1b[31m${line}\x1b[0m`);
    }
  });

  proc.on('close', (code) => {
    console.log(`${prefixColor}[${name}]\x1b[0m exited with code ${code}`);
  });

  return proc;
}

const serverProc = startProcess('server', '\x1b[36m', ['run', 'dev'], 'server');
const clientProc = startProcess('client', '\x1b[35m', ['run', 'dev'], 'client');

function cleanup() {
  console.log('\nShutting down QuizMaster processes...');
  try {
    if (isWin) {
      spawn('taskkill', ['/pid', serverProc.pid, '/f', '/t']);
      spawn('taskkill', ['/pid', clientProc.pid, '/f', '/t']);
    } else {
      serverProc.kill('SIGTERM');
      clientProc.kill('SIGTERM');
    }
  } catch {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
