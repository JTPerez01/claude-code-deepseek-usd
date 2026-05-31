import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { dim, label, yellow, red, RESET } from '../colors.js';
import { t } from '../../i18n/index.js';
const DS_INPUT_PRICE = 3;
const DS_CACHE_PRICE = 0.025;
const DS_OUTPUT_PRICE = 6;
const OFFLINE_SEC = 90; // 超过 90s 没更新 = 离线
const ALERT_DEFAULT = 0.5; // 单轮超 ¥0.5 提醒
const CACHE_DIR = path.join(os.homedir(), '.claude', 'deepseek-cache');
// ensure dir exists
try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}
catch { }
const BALANCE_CACHE = path.join(CACHE_DIR, 'balance.txt');
const COST_CACHE = path.join(CACHE_DIR, 'last-cost.txt');
function readBalance() {
    try {
        const stat = fs.statSync(BALANCE_CACHE);
        const age = (Date.now() - stat.mtimeMs) / 1000;
        const raw = fs.readFileSync(BALANCE_CACHE, 'utf-8').trim();
        if (!raw || raw === '?')
            return null;
        const num = parseFloat(raw);
        if (isNaN(num))
            return null;
        return { value: num, str: num.toFixed(2), online: age < OFFLINE_SEC };
    }
    catch {
        return null;
    }
}
function readLastCumCost() {
    try {
        const raw = fs.readFileSync(COST_CACHE, 'utf-8').trim();
        const num = parseFloat(raw);
        return isNaN(num) ? null : num;
    }
    catch {
        return null;
    }
}
function writeCumCost(v) {
    try {
        fs.writeFileSync(COST_CACHE, v.toFixed(6));
    }
    catch { }
}
function formatCost(n) {
    if (n < 0.0001)
        return '¥0';
    if (n < 0.01)
        return `¥${n.toFixed(4)}`;
    if (n < 1)
        return `¥${n.toFixed(3)}`;
    return `¥${n.toFixed(2)}`;
}
export function renderDeepSeekLine(ctx) {
    if (ctx.config?.display?.showDeepSeek !== true)
        return null;
    const modelId = ctx.stdin.model?.id?.toLowerCase() || '';
    if (!modelId.includes('deepseek'))
        return null;
    const parts = [];
    const st = ctx.transcript.sessionTokens;
    let cumCost = 0;
    if (st) {
        const maxCache = Math.min(st.cacheReadTokens, st.inputTokens);
        const uncached = st.inputTokens - maxCache;
        cumCost =
            (uncached / 1_000_000) * DS_INPUT_PRICE +
                (maxCache / 1_000_000) * DS_CACHE_PRICE +
                (st.outputTokens / 1_000_000) * DS_OUTPUT_PRICE;
    }
    const lastCum = readLastCumCost();
    const delta = lastCum !== null && cumCost > lastCum ? cumCost - lastCum : null;
    if (cumCost > 0)
        writeCumCost(cumCost);
    // 花费提醒阈值
    const alertThreshold = ctx.config?.display?.deepseekAlertThreshold ?? ALERT_DEFAULT;
    if (cumCost > 0) {
        const alert = delta !== null && delta > alertThreshold;
        const deltaStr = delta !== null && delta > 0.0001 ? `+${formatCost(delta)}` : '';
        const cumStr = formatCost(cumCost);
        const costStr = alert
            ? `${red(deltaStr)} ${dim(cumStr)}` // 单轮超标 = 红色
            : deltaStr
                ? `${yellow(deltaStr)} ${dim(cumStr)}` // 正常增量
                : yellow(cumStr); // 无增量
        parts.push(`${label(t('label.cost'))} ${costStr}`);
    }
    function rainbow(n) {
        // 彩虹色阶: red → orange → yellow → green → cyan → blue
        if (n <= 0.5)
            return '\x1b[38;5;196m'; // 红
        if (n <= 1)
            return '\x1b[38;5;202m'; // 橙红
        if (n <= 3)
            return '\x1b[38;5;208m'; // 橙
        if (n <= 5)
            return '\x1b[38;5;214m'; // 黄橙
        if (n <= 8)
            return '\x1b[38;5;220m'; // 黄
        if (n <= 12)
            return '\x1b[38;5;190m'; // 黄绿
        if (n <= 20)
            return '\x1b[38;5;82m'; // 绿
        if (n <= 50)
            return '\x1b[38;5;51m'; // 青
        return '\x1b[38;5;33m'; // 蓝
    }
    const bal = readBalance();
    if (bal) {
        const color = rainbow(bal.value);
        if (!bal.online) {
            parts.push(`${label(t('label.balance'))} ${color}¥${bal.str}${RESET} ${red('⚠')}`);
        }
        else {
            parts.push(`${label(t('label.balance'))} ${color}¥${bal.str}${RESET}`);
        }
    }
    if (parts.length === 0)
        return null;
    return parts.join('  ');
}
//# sourceMappingURL=deepseek.js.map