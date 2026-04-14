'use strict';

const { spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');

function findClaudeExe() {
  const desktopBase = path.join(
    process.env.LOCALAPPDATA || '',
    'Packages', 'Claude_pzs8sxrjxfjjc',
    'LocalCache', 'Roaming', 'Claude', 'claude-code'
  );
  if (fs.existsSync(desktopBase)) {
    const versions = fs.readdirSync(desktopBase).sort().reverse();
    for (const v of versions) {
      const exe = path.join(desktopBase, v, 'claude.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  const npmCmd = path.join(process.env.APPDATA || '', 'npm', 'claude.cmd');
  if (fs.existsSync(npmCmd)) return npmCmd;
  return 'claude';
}

const CLAUDE_EXE = findClaudeExe();

/**
 * Call the Claude CLI with a prompt string.
 * Resolves with the trimmed stdout string.
 * Rejects with a descriptive Error on timeout or non-zero exit.
 *
 * @param {string} prompt
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<string>}
 */
function callClaude(prompt, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(CLAUDE_EXE, ['-p', prompt], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      shell: CLAUDE_EXE.endsWith('.cmd'),
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error('Claude CLI timed out'));
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', err => { clearTimeout(timer); reject(err); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code !== 0) reject(new Error(`Claude CLI exited ${code}: ${stderr.trim()}`));
      else resolve(stdout.trim());
    });
  });
}

module.exports = { callClaude, CLAUDE_EXE };
