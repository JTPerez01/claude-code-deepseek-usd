#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.claude', 'deepseek-cache');
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}
const CACHE = path.join(CACHE_DIR, 'balance.txt');
const PIDFILE = path.join(CACHE_DIR, 'daemon.pid');
const LOGFILE = path.join(CACHE_DIR, 'daemon.log');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

function log(msg) {
  try { fs.appendFileSync(LOGFILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
}

// 防止重复
try {
  if (fs.existsSync(PIDFILE)) {
    const old = parseInt(fs.readFileSync(PIDFILE, 'utf-8').trim());
    try { process.kill(old, 0); process.kill(old); log(`killed old daemon pid=${old}`); } catch {}
  }
} catch {}
fs.writeFileSync(PIDFILE, String(process.pid));

function getApiKey() {
  try {
    for (const p of [SETTINGS, path.join(os.homedir(), '.claude.json')]) {
      try { const s = JSON.parse(fs.readFileSync(p, 'utf-8')); const t = s?.env?.ANTHROPIC_AUTH_TOKEN; if (t) return t; } catch {}
    }
  } catch {}
  return '';
}

function checkParentAlive() {
  // 检查 Claude Code 是否还在运行
  try {
    const { execSync } = require('child_process');
    const out = execSync('pgrep -x claude 2>/dev/null || pgrep -f "node.*claude$" 2>/dev/null || true', { encoding: 'utf8', timeout: 2000 }).trim();
    return out.length > 0;
  } catch { return false; }
}

function fetchBalance(key) {
  return new Promise((resolve) => {
    const req = https.get('https://api.deepseek.com/user/balance', {
      headers: { Authorization: `Bearer ${key}` },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const j = JSON.parse(data);
          const b = (j.balance_infos || [{}])[0];
          resolve([b.total_balance || '0', b.topped_up_balance || '0', b.granted_balance || '0', j.is_available ? 'true' : 'false', Date.now()].join(' '));
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
  });
}

async function main() {
  const key = getApiKey();
  if (!key) { log('FATAL: no API key'); fs.unlinkSync(PIDFILE); process.exit(1); }
  log('started');

  let fails = 0;
  while (true) {
    const result = await fetchBalance(key);
    if (result) {
      fs.writeFileSync(CACHE, result);
      fails = 0;
    } else {
      fails++;
    }
    if (fails >= 10) { log('10 consecutive failures, exiting'); break; }

    // 每 5 次检查 Claude Code 是否还在，不在则退出
    if (fails === 0) {
      const alive = checkParentAlive();
      if (!alive) { log('Claude Code not running, exiting'); break; }
    }

    await new Promise(r => setTimeout(r, 30000));
  }
  try { fs.unlinkSync(PIDFILE); } catch {}
  process.exit(0);
}
main();
