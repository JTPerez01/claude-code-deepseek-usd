#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const HOME = os.homedir();

console.log('\n🧹 卸载 claude-code-deepseek-monitor...\n');

// ---- 1. 杀 HUD 进程 ----
const pidFile = path.join(HOME, '.claude', 'deepseek-cache', 'hud.pid');
try {
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf-8').trim();
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F 2>nul`, { stdio: 'ignore' });
    } else {
      try { process.kill(+pid); } catch {}
    }
    fs.unlinkSync(pidFile);
    console.log('  ✅ HUD 进程已停止');
  }
} catch { console.log('  ⚠️ 无法停止 HUD（请手动关闭 Claude Code）'); }

// ---- 2. 清理 settings.json ----
const sp = path.join(HOME, '.claude', 'settings.json');
try {
  if (fs.existsSync(sp)) {
    const s = JSON.parse(fs.readFileSync(sp, 'utf-8'));
    delete s.statusLine;
    if (s.hooks) { delete s.hooks.SessionStart; delete s.hooks.SessionEnd; }
    fs.writeFileSync(sp, JSON.stringify(s, null, 2));
    console.log('  ✅ settings.json 已清理');
  }
} catch(e) { console.log('  ⚠️ settings.json:', e.message); }

// ---- 3. 删除文件 ----
const dirs = [
  ['cache/deepseek-monitor',        path.join(HOME, '.claude', 'plugins', 'cache', 'deepseek-monitor')],
  ['custom/deepseek-monitor',       path.join(HOME, '.claude', 'plugins', 'custom', 'deepseek-monitor')],
  ['claude-hud',                    path.join(HOME, '.claude', 'plugins', 'claude-hud')],
  ['skills/usage',                  path.join(HOME, '.claude', 'skills', 'usage')],
  ['deepseek-cache',                path.join(HOME, '.claude', 'deepseek-cache')],
];
for (const [name, p] of dirs) {
  try { fs.rmSync(p, { recursive: true, force: true }); console.log(`  ✅ ${name}`); }
  catch(e) { console.log(`  ⚠️ ${name}: ${e.message}`); }
}

console.log('\n  ✨ 完成\n');
