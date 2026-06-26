#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const PLUGIN_DIR = path.join(CLAUDE_DIR, 'plugins', 'claude-hud');
const SKILLS_DIR = path.join(CLAUDE_DIR, 'skills', 'usage');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const PKG = __dirname;
const NODE = process.execPath;

// 从 package.json 读取版本号
const VERSION = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf-8')).version;

const C = { r:'\x1b[0m', b:'\x1b[1m', g:'\x1b[32m', c:'\x1b[36m', y:'\x1b[33m', d:'\x1b[2m' };
function log(l,m) { console.log(`  ${C.c}${l}${C.r} ${m}`); }
function ok(m) { console.log(`${C.g}✅${C.r} ${m}`); }

console.log(`\n${C.b}${C.c}╔════════════════════════════════════╗`);
console.log(`║  Claude Code DeepSeek Monitor     ║`);
console.log(`╚════════════════════════════════════╝${C.r}\n`);

try {
  const hudDest = path.join(CLAUDE_DIR, 'plugins', 'cache', 'deepseek-monitor', VERSION);
  const scriptDir = path.join(CLAUDE_DIR, 'plugins', 'custom', 'deepseek-monitor', 'scripts');

  // 0. 清理旧版本
  try {
    const cacheBase = path.join(HOME, '.claude', 'plugins', 'cache', 'deepseek-monitor');
    if (fs.existsSync(cacheBase)) {
      const dirs = fs.readdirSync(cacheBase);
      for (const d of dirs) {
        if (d !== VERSION) {
          try { fs.rmSync(path.join(cacheBase, d), { recursive: true, force: true }); } catch {}
        }
      }
    }
  } catch {}

  // 1. HUD
  log('📦', 'install HUD...');
  fs.mkdirSync(hudDest, { recursive: true });
  fs.cpSync(path.join(PKG, 'hud'), hudDest, { recursive: true });
  ok(`HUD → ${hudDest}`);

  // 2. Scripts
  log('📜', 'install scripts...');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(path.join(PKG, 'scripts', 'query.js'), path.join(scriptDir, 'query.js'));
  ok(`scripts → ${scriptDir}`);

  // 3. Skill
  log('🔧', 'install /usage...');
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.cpSync(path.join(PKG, 'skills', 'usage'), SKILLS_DIR, { recursive: true });
  ok(`/usage → ${SKILLS_DIR}`);

  // 4. 版本文件
  const cacheDir = path.join(HOME, '.claude', 'deepseek-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, 'version.txt'), VERSION);

  // 5. HUD config
  log('⚙️', 'configure HUD...');
  fs.mkdirSync(PLUGIN_DIR, { recursive: true });
  fs.writeFileSync(path.join(PLUGIN_DIR, 'config.json'), JSON.stringify({
    language:'en', lineLayout:'compact',
    elementOrder:['project','context','deepseek','tools','agents','todos'],
    display:{showModel:true,showProject:true,showContextBar:true,showDeepSeek:true,showCost:true,showUsage:true,showTools:true,showAgents:true,showTodos:true,showDuration:true,showSessionName:false,contextValue:'both'},
  },null,2));

  // 6. statusLine
  log('🚀', 'configure statusLine...');
  const runScript = path.join(PLUGIN_DIR, 'run.mjs');
  fs.writeFileSync(runScript, [
    "import { execSync } from 'child_process';",
    "import { pathToFileURL } from 'url';",
    "let cols = 120;",
    "try {",
    "  const cmd = process.platform === 'win32' ? 'mode con 2>nul' : 'tput cols 2>/dev/null';",
    "  const out = execSync(cmd, { encoding: 'utf8', timeout: 1000 });",
    "  const m = out.match(/(\\d+)/);",
    "  if (m) cols = parseInt(m[1], 10) - 4;",
    "} catch(e) {}",
    "process.env.COLUMNS = String(Math.max(1, cols));",
    // 找最新版本的 HUD dist
    `import { readdirSync, writeFileSync } from 'fs';`,
    `import { join } from 'path';`,
    `import { homedir } from 'os';`,
    `const home = homedir();`,
    `const cacheBase = join(home, '.claude', 'plugins', 'cache', 'deepseek-monitor');`,
    `let hudPath = '';`,
    `try { const dirs = readdirSync(cacheBase).filter(d => /^\\d/.test(d)).sort((a,b) => { const aa=a.split('.').map(Number), bb=b.split('.').map(Number); for(let i=0;i<3;i++) if(aa[i]!==bb[i]) return (bb[i]||0)-(aa[i]||0); return 0; }); if (dirs.length) hudPath = join(cacheBase, dirs[0], 'dist', 'index.js'); } catch {}`,
    `if (!hudPath) process.exit(1);`,
    `const hud = await import(pathToFileURL(hudPath).href);`,
    "try { writeFileSync(join(home, '.claude', 'deepseek-cache', 'hud.pid'), String(process.pid)); } catch {}",
    "hud.main();",
    "",
  ].join('\n'));
  const statusCmd = `"${NODE}" "${runScript}"`;

  let settings = {};
  if (fs.existsSync(SETTINGS)) settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.bak.${ts}`);
  settings.statusLine = { type: 'command', command: statusCmd };
  if (!settings.env) settings.env = {};
  if (settings.hooks) { delete settings.hooks.SessionStart; delete settings.hooks.SessionEnd; }
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
  ok(`statusLine configured`);

  console.log(`\n${C.b}${C.g}  ✨ v${VERSION} installed! Restart Claude Code.${C.r}\n`);
  console.log(`  ${C.y}/usage${C.r}          full dashboard`);
  console.log(`  ${C.y}/usage --short${C.r}   one-line\n`);

} catch(e) { console.error('❌', e.message); process.exit(1); }
