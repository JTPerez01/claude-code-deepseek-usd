#!/usr/bin/env node
// DeepSeek Monitor — 跨平台查询脚本 (Node.js, 零依赖)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TMP = os.tmpdir();
const BALANCE_CACHE = path.join(TMP, 'deepseek-balance-cache.txt');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

// ── Pricing (USD per 1M tokens — override via env vars) ──
const INPUT_PRICE = +process.env.DEEPSEEK_INPUT_PRICE || 0.435;
const OUTPUT_PRICE = +process.env.DEEPSEEK_OUTPUT_PRICE || 0.87;
const CACHE_PRICE = +process.env.DEEPSEEK_CACHE_HIT_PRICE || 0.003625;

// ── 颜色 ──
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  bblack: '\x1b[90m', byellow: '\x1b[93m', bcyan: '\x1b[96m',
};
let currencySymbol = '$'; // detected from balance API
const fmt = {
  num: (n) => Number(n).toLocaleString('en'),
  money: (n) => `${currencySymbol}${Number(n).toFixed(4)}`,
  pct: (n) => `${n.toFixed(1)}%`,
};

// ── 参数 ──
const args = process.argv.slice(2);
const mode = args.includes('--short') || args.includes('-s') ? 'short' : 'full';
const refresh = args.includes('--refresh') || args.includes('-r');
const sessionId = args.find(a => !a.startsWith('-')) || '';

// ── 1. Read API key ──
function getApiKey() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf-8'));
    return s?.env?.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_AUTH_TOKEN || '';
  } catch { return process.env.ANTHROPIC_AUTH_TOKEN || ''; }
}

// ── 2. 余额 ──
function fetchBalance() {
  const key = getApiKey();
  if (!key) return { total: 0, topped: 0, granted: 0, available: false };
  try {
    const body = execSync(
      `curl -s --max-time 5 https://api.deepseek.com/user/balance -H "Authorization: Bearer ${key}"`,
      { encoding: 'utf-8', stdio: ['pipe','pipe','ignore'] }
    );
    const d = JSON.parse(body);
    const b = (d.balance_infos || [{}])[0];
    if (b.currency) currencySymbol = b.currency === 'USD' ? '$' : b.currency === 'CNY' ? '¥' : b.currency;
    return {
      total: parseFloat(b.total_balance) || 0,
      topped: parseFloat(b.topped_up_balance) || 0,
      granted: parseFloat(b.granted_balance) || 0,
      available: d.is_available === true,
    };
  } catch { return { total: 0, topped: 0, granted: 0, available: false }; }
}

if (refresh) {
  const bal = fetchBalance();
  fs.writeFileSync(BALANCE_CACHE, bal.total.toFixed(2));
  console.log('✅ Balance refreshed');
  if (mode === 'short') process.exit(0);
}

let balData = { total: 0, topped: 0, granted: 0, available: false };
try {
  const cached = fs.readFileSync(BALANCE_CACHE, 'utf-8').trim();
  const [t, tp, g, a] = cached.split(' ');
  balData = { total: +t || 0, topped: +tp || 0, granted: +g || 0, available: a === 'true' };
} catch {
  balData = fetchBalance();
  fs.writeFileSync(BALANCE_CACHE, [balData.total, balData.topped, balData.granted, balData.available].join(' '));
}

// ── 3. Session token 统计 ──
function findSession(id) {
  const dir = path.join(CLAUDE_DIR, 'projects');
  if (!fs.existsSync(dir)) return null;
  if (id) {
    for (const sub of fs.readdirSync(dir)) {
      const p = path.join(dir, sub, `${id}.jsonl`);
      if (fs.existsSync(p)) return { path: p, id };
    }
    return null;
  }
  // 最新
  let newest = null, newestTime = 0;
  for (const sub of fs.readdirSync(dir)) {
    const subDir = path.join(dir, sub);
    if (!fs.statSync(subDir).isDirectory()) continue;
    for (const f of fs.readdirSync(subDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = path.join(subDir, f);
      const st = fs.statSync(fp);
      if (st.mtimeMs > newestTime) { newestTime = st.mtimeMs; newest = { path: fp, id: f.replace('.jsonl', '') }; }
    }
  }
  return newest;
}

function parseSession(jsonlPath) {
  let totalIn = 0, totalOut = 0, maxCache = 0, calls = 0;
  const seen = new Set();
  try {
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let e;
      try { e = JSON.parse(line); }
      catch { continue; }
      const m = e.message, u = m?.usage;
      if (!u) continue;
      const rid = m.id || '';
      if (rid && seen.has(rid)) continue;
      if (rid) seen.add(rid);
      totalIn += u.input_tokens || 0;
      totalOut += u.output_tokens || 0;
      maxCache = Math.max(maxCache, u.cache_read_input_tokens || 0);
      calls++;
    }
  } catch {}
  maxCache = Math.min(maxCache, totalIn);
  const uncached = totalIn - maxCache;
  const inCost = (uncached / 1e6) * INPUT_PRICE + (maxCache / 1e6) * CACHE_PRICE;
  const outCost = (totalOut / 1e6) * OUTPUT_PRICE;
  return { calls, totalIn, totalOut, maxCache, uncached, totalTok: totalIn + totalOut,
    ctxTok: maxCache, inCost, outCost, totalCost: inCost + outCost };
}

const session = findSession(sessionId);
let stats = { calls: 0, totalIn: 0, totalOut: 0, maxCache: 0, uncached: 0, totalTok: 0, ctxTok: 0, inCost: 0, outCost: 0, totalCost: 0 };
if (session) stats = parseSession(session.path);

const cachePct = stats.totalIn > 0 ? (stats.maxCache / stats.totalIn) * 100 : 0;

// ── 4. Short output ──
if (mode === 'short') {
  let icon = '';
  if (balData.total < 1) icon = '🔴';
  else if (balData.total < 5) icon = '🟡';
  console.log(`${C.green}${icon}${currencySymbol}${balData.total.toFixed(2)}${C.reset}  ${C.cyan}📥${fmt.num(stats.totalIn)}${C.reset}  ${C.magenta}📤${fmt.num(stats.totalOut)}${C.reset}  ${C.yellow}💵${fmt.money(stats.totalCost)}${C.reset}  ${C.dim}cache ${fmt.pct(cachePct)}${C.reset}  ${C.bblack}${fmt.num(stats.calls)}calls${C.reset}`);
  process.exit(0);
}

// ── 5. Dashboard ──
function bar(pct, w = 20, dir = 'more') {
  let color;
  if (dir === 'more') {
    color = pct < 50 ? C.red : pct < 80 ? C.yellow : C.green;
  } else {
    color = pct >= 85 ? C.red : pct >= 60 ? C.yellow : C.green;
  }
  const filled = Math.round(pct / 100 * w);
  return color + '█'.repeat(filled) + C.dim + '░'.repeat(w - filled) + C.reset;
}

const W = 42;
const HR = '═'.repeat(W), HR2 = '─'.repeat(W);
const totalAll = stats.totalTok || 1;
const inPct = stats.totalIn / totalAll * 100;
const outPct = stats.totalOut / totalAll * 100;
const remain = balData.total - stats.totalCost;
const remainPct = balData.total > 0 ? Number(((remain / balData.total) * 100).toFixed(1)) : 100;
const inCostUncached = stats.uncached / 1e6 * INPUT_PRICE;
const inCostCached = stats.maxCache / 1e6 * CACHE_PRICE;
const cacheColor = cachePct < 20 ? C.red : cachePct < 50 ? C.yellow : C.green;
const balDot = balData.available ? `${C.green}●${C.reset}` : `${C.red}●${C.reset}`;

console.log(`\n  ${C.bcyan}${C.bold}╔${HR}╗${C.reset}`);
console.log(`  ${C.bcyan}${C.bold}║${C.reset}  ${C.bold}${C.cyan}🔍 DeepSeek Monitor${C.reset}                              ${C.bcyan}${C.bold}║${C.reset}`);
console.log(`  ${C.bcyan}${C.bold}╠${HR}╣${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}  ${C.bold}💰 Balance${C.reset}  ${balDot} ${C.bold}${C.green}${currencySymbol}${balData.total.toFixed(2)}${C.reset}                               ${C.bcyan}║${C.reset}`);
if (balData.topped > 0 || balData.granted > 0)
  console.log(`  ${C.bcyan}║${C.reset}        ${C.dim}topped: ${currencySymbol}${balData.topped}  granted: ${currencySymbol}${balData.granted}${C.reset}                    ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}  ${C.bold}💵 Session${C.reset}  ${C.byellow}${fmt.money(stats.totalCost)}${C.reset}                                    ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}  ${C.bold}🟢 Remain${C.reset}  ${C.green}${currencySymbol}${remain.toFixed(2)}${C.reset}  ${bar(remainPct, 12, 'more')} ${C.dim}${remainPct}%${C.reset}          ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}${C.bold}╠${HR2}╣${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}  ${C.bold}📊 Token Usage${C.reset}                                    ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.cyan}Context${C.reset}  ${C.bold}${fmt.num(stats.ctxTok)}${C.reset} tokens  ${C.dim}API:${C.reset} ${C.magenta}${fmt.num(stats.calls)}${C.reset} calls        ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.blue}📥${C.reset} ${bar(inPct, 14, 'less')} ${C.dim}Input${C.reset} ${C.bold}${fmt.num(stats.totalIn)}${C.reset}              ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.green}📤${C.reset} ${bar(outPct, 14, 'less')} ${C.dim}Output${C.reset} ${C.bold}${fmt.num(stats.totalOut)}${C.reset}              ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.dim}Cache hit${C.reset} ${cacheColor}${fmt.pct(cachePct)}${C.reset}  ${fmt.num(stats.maxCache)} tokens                ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}${C.bold}╠${HR2}╣${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}  ${C.bold}💲 Cost Detail${C.reset}                                      ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.dim}miss:${C.reset} ${currencySymbol}${INPUT_PRICE}  /M → ${C.yellow}${fmt.money(inCostUncached)}${C.reset}                  ${C.bcyan}║${C.reset}`);
if (stats.maxCache > 0)
  console.log(`  ${C.bcyan}║${C.reset}    ${C.dim}hit:${C.reset}   ${currencySymbol}${CACHE_PRICE}/M → ${C.green}${fmt.money(inCostCached)}${C.reset}                  ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.dim}output:${C.reset} ${currencySymbol}${OUTPUT_PRICE}  /M → ${C.magenta}${fmt.money(stats.outCost)}${C.reset}                  ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}║${C.reset}    ${C.bold}Total:${C.reset}           ${C.byellow}${fmt.money(stats.totalCost)}${C.reset}                  ${C.bcyan}║${C.reset}`);
console.log(`  ${C.bcyan}${C.bold}╚${HR}╝${C.reset}`);
console.log(`  ${C.dim}📋 ${(session?.id || '?').slice(0, 16)}...  |  DeepSeek V4 Pro${C.reset}\n`);
