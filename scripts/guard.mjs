#!/usr/bin/env node
/**
 * Универсальный гейт проекта. Версия 2.
 *
 * Обычный скрипт с кодом выхода — работает независимо от того, что решила
 * модель в конкретной сессии.
 *
 *   node scripts/guard.mjs             исходники
 *   node scripts/guard.mjs --staged    только то, что в индексе git (для хука)
 *   node scripts/guard.mjs --dist      плюс собранный артефакт и бюджет JS
 *   node scripts/guard.mjs --history   плюс история git (медленно, разово)
 *
 * Ненулевой код выхода = не пропускать дальше.
 *
 * Изменения относительно v1:
 *   - раздельные списки пропуска: секреты сканируются в .claude тоже
 *   - комментарии проверяются наравне с кодом
 *   - чёрный список расширений вместо белого
 *   - .env опасен в индексе git, а не на диске
 *   - расширенный набор шаблонов + эвристика энтропии
 *   - режимы --staged и --history
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, relative, sep, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* ================================================================ настройки */

const ROOT = process.cwd();

// Путь самого гейта. Он содержит шаблоны секретов, поэтому исключён из
// проверки — но исключение вычисляется, а не задаётся именем файла:
// подложенный рядом src/lib/guard.mjs проверяется как обычный файл.
const SELF = relative(ROOT, fileURLToPath(import.meta.url)).split(sep).join('/');
const MODE = {
  staged: process.argv.includes('--staged'),
  dist: process.argv.includes('--dist'),
  history: process.argv.includes('--history'),
};

// Профиль проекта: 'saas' или 'landing'.
// saas    — серверные проверки (Docker, CORS, SQL), бюджет JS и деградация
//           без JS применяются только к маркетинговым страницам, если есть.
// landing — статика: бюджет JS, сырые цвета, деградация без JS.
// Секреты проверяются одинаково в обоих профилях — это не настройка.
const PROFILE = 'saas';

// Бюджет JS для собранного артефакта. Поднимается человеком осознанно.
const JS_BUDGET_BYTES = 7 * 1024;

// Порог энтропии для неизвестных ключей. Ниже — слишком много шума.
const ENTROPY_MIN = 4.0;
const ENTROPY_MIN_LEN = 24;

// Не сканируем вообще — нигде и никогда.
const SKIP_ALWAYS = new Set(['node_modules', '.git', 'dist', '.astro', '.next', '.cache', 'coverage', 'build']);

// Не сканируем только на стилевые правила (сырые цвета).
const SKIP_STYLE_ONLY = new Set(['.claude', 'reference', 'design-system', 'scripts', 'docs']);

// Файлы, где сырые цвета законны. Расширяет человек.
const COLOR_ALLOWLIST = [
  'src/styles/tokens.css',
  'src/layouts/Layout.astro',
];

// Бинарное и заведомо шумное — чёрный список, всё остальное читаем.
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.gz', '.tar',
  '.lock', '.map',
]);
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);

const MAX_FILE_BYTES = 2 * 1024 * 1024;

/* ================================================================= шаблоны */

const SECRET_PATTERNS = [
  { name: 'приватный ключ',            re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/ },
  { name: 'токен Telegram-бота',       re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: 'ключ OpenAI/Anthropic',     re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'AWS Access Key',            re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  { name: 'GitHub token',              re: /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: 'Google API key',            re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'Slack token',               re: /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live key',           re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'SendGrid key',              re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: 'npm token',                 re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'Supabase service_role',     re: /\bservice_role\b[\s\S]{0,80}?eyJ[A-Za-z0-9_-]{10,}/ },
  { name: 'JWT с полезной нагрузкой',  re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'строка подключения с паролем', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\/\s]+:[^@\s]{4,}@/ },
  {
    name: 'присвоение секрета в коде',
    re: /\b(?:[A-Za-z_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CLIENT_?SECRET|CHAT_ID|WEBHOOK_URL)[A-Za-z_]*)\s*['"`]?\s*[:=]\s*['"`][^'"`\s${}]{8,}/i,
    why: 'Значение секрета в коде. Должно приходить из окружения.',
  },
  {
    name: 'обращение к чужому API из клиента',
    re: /\b(?:api\.telegram\.org|api\.openai\.com|api\.anthropic\.com|api\.stripe\.com|hooks\.slack\.com)\b/,
    why: 'Клиент не должен обращаться напрямую — только через свой сервер.',
    clientOnly: true,
  },
];

// Строки-заглушки: не считаем их утечкой.
// Строки-заглушки: не считаем их утечкой.
// Внимание: `\b` действует только на альтернативы, начинающиеся со словарного
// символа. Ветки `<...>`, `...` и `****` начинались с несловарного символа
// и потому никогда не срабатывали после кавычки. `<[a-z_]+>` вынесена из-под
// `\b` — угловые скобки однозначно означают заглушку.
// `...` и `****` НЕ восстановлены намеренно: они гасили бы обрезанный
// настоящий ключ вида "sk-ant-abc..." — гейт стал бы слабее, а не точнее.
const PLACEHOLDER_RE = /\b(?:your[_-]?|example|placeholder|dummy|changeme|xxx+)|<[a-z_]+>/i;

const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/;
const STYLE_EXT = new Set(['.astro', '.css', '.scss', '.ts', '.js', '.tsx', '.jsx', '.vue', '.svelte']);

/* =================================================================== вывод */

const problems = [];
const warnings = [];
const notes = [];

const problem = (tag, where, text) => problems.push(`${tag}  ${where}\n        ${text}`);
const warn = (tag, where, text) => warnings.push(`${tag}  ${where}\n        ${text}`);

/* ============================================================== git-помощь */

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};
const hasGit = git('rev-parse --is-inside-work-tree') !== null;

/* ================================================================== обход */

const isSkippedDir = (name, rel) => SKIP_ALWAYS.has(name) || SKIP_ALWAYS.has(rel);

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    const rel = relative(ROOT, full).split(sep).join('/');
    if (isSkippedDir(e.name, rel)) continue;
    if (e.isDirectory()) await walk(full, out);
    else out.push(rel);
  }
  return out;
}

function scannable(rel) {
  const base = basename(rel);
  if (SKIP_FILES.has(base)) return false;
  const ext = extname(rel);
  if (SKIP_EXT.has(ext)) return false;
  return true;
}

// Пути, которые лежат внутри клиентских префиксов, но исполняются на сервере.
// Next.js App Router: app/api/**/route.ts никогда не попадает в браузер.
const SERVER_ONLY = [
  /^app\/api\//,                  // Next.js App Router — обработчики
  /^pages\/api\//,                // Next.js Pages Router
  /(^|\/)route\.(m?[jt]s)$/,      // route handler в любом месте app/
  /(^|\/)middleware\.(m?[jt]s)$/, // middleware — сервер/edge
  /\.server\.(m?[jt]sx?)$/,       // явная серверная пометка в имени
];

const isClientFile = (rel) =>
  (rel.startsWith('src/') || rel.startsWith('public/') || rel.startsWith('app/')) &&
  !SERVER_ONLY.some((re) => re.test(rel));

const inStyleScope = (rel) => {
  const top = rel.split('/')[0];
  if (SKIP_STYLE_ONLY.has(top)) return false;
  return isClientFile(rel) && !COLOR_ALLOWLIST.includes(rel) && STYLE_EXT.has(extname(rel));
};

/* =============================================================== энтропия */

function entropy(s) {
  const freq = new Map();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const ASSIGN_RE = /(?:^|[\s,{(])([A-Za-z_][A-Za-z0-9_]{2,})\s*[:=]\s*['"`]([A-Za-z0-9+/=_-]{24,})['"`]/g;
const ENTROPY_NAME_HINT = /key|token|secret|pass|auth|cred|sign|hash|salt|dsn|url|id/i;
const ENTROPY_SAFE_NAME = /class|style|path|test|mock|sample|font|svg|data|content|selector|version|hash$/i;

function checkEntropy(rel, text) {
  for (const m of text.matchAll(ASSIGN_RE)) {
    const [, name, value] = m;
    if (value.length < ENTROPY_MIN_LEN) continue;
    if (!ENTROPY_NAME_HINT.test(name) || ENTROPY_SAFE_NAME.test(name)) continue;
    if (PLACEHOLDER_RE.test(value)) continue;
    if (entropy(value) < ENTROPY_MIN) continue;
    warn('ЭНТРОПИЯ', rel, `${name} = длинная случайная строка (энтропия ${entropy(value).toFixed(2)}). Похоже на ключ. Проверить вручную.`);
  }
}

/* ========================================================= saas-проверки */

const DOCKERISH = (rel) =>
  /(^|\/)(docker-compose[^/]*\.ya?ml|compose\.ya?ml|Dockerfile[^/]*)$/.test(rel);

function checkSaas(rel, lines) {
  const isDocker = DOCKERISH(rel);
  const isServerCode = /\.(js|mjs|ts|py|go|rb|php)$/.test(rel) && !isClientFile(rel);

  lines.forEach((line, i) => {
    const at = `${rel}:${i + 1}`;

    if (isDocker) {
      if (/privileged\s*:\s*true|--privileged/.test(line)) {
        problem('DOCKER', at, 'privileged: контейнер видит диски хоста и читает /etc/shadow. Убрать, добавить только нужные capabilities.');
      }
      if (/^\s*-\s*['"]?\/(?:etc|var\/run\/docker\.sock|)\s*:['"]?/.test(line) || /\/var\/run\/docker\.sock/.test(line)) {
        problem('DOCKER', at, 'Монтирование хостового пути или docker.sock внутрь контейнера = доступ к хосту.');
      }
      if (/network_mode\s*:\s*['"]?host/.test(line)) {
        warn('DOCKER', at, 'network_mode: host снимает сетевую изоляцию. Убедиться, что это осознанно.');
      }
    }

    if (isServerCode || isDocker || /\.(json|ya?ml|toml)$/.test(rel)) {
      if (/Access-Control-Allow-Origin['"]?\s*[,:=]\s*['"`]\*|origin\s*:\s*['"`]\*['"`]|cors\(\s*\)/.test(line)) {
        problem('CORS', at, 'CORS открыт для всех источников. Разрешить единственный свой домен.');
      }
    }

    if (isServerCode) {
      // SQL из конкатенации строк — предупреждение: бывают ложные, но чаще это инъекция
      if (/['"`]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b[^'"`]*['"`]\s*\+|\$\{[^}]*\}\s*(?:WHERE|VALUES|FROM)\b/i.test(line)) {
        warn('SQL', at, 'Запрос собирается конкатенацией. Использовать параметризованные запросы.');
      }
      if (/\beval\s*\(|new\s+Function\s*\(/.test(line)) {
        warn('EVAL', at, 'eval/new Function в серверном коде. Почти всегда есть способ без исполнения строк.');
      }
    }
  });

  // Dockerfile без USER = процесс от root
  if (/(^|\/)Dockerfile[^/]*$/.test(rel)) {
    const text = lines.join('\n');
    if (!/^\s*USER\s+\S+/m.test(text)) {
      warn('DOCKER', rel, 'Нет директивы USER — контейнер работает от root. Задать числовой UID.');
    }
  }
}

async function scanFile(rel) {
  let text;
  try {
    const st = await stat(join(ROOT, rel));
    if (st.size > MAX_FILE_BYTES) return;
    text = await readFile(join(ROOT, rel), 'utf8');
  } catch {
    return;
  }
  if (text.includes('\u0000')) return; // бинарь

  const lines = text.split('\n');

  // секреты — во всём, включая комментарии и .claude
  for (const pat of SECRET_PATTERNS) {
    if (pat.clientOnly && !isClientFile(rel)) continue;
    lines.forEach((line, i) => {
      if (!pat.re.test(line)) return;
      if (PLACEHOLDER_RE.test(line)) return;
      if (rel === SELF) return; // сам гейт: точный путь, вычисленный при запуске
      problem('СЕКРЕТ', `${rel}:${i + 1}`, `${pat.name}. ${pat.why || 'Значения секретов в репозитории быть не должно.'}`);
    });
  }

  checkEntropy(rel, text);

  // сырые цвета — только в профиле landing
  if (PROFILE === 'landing' && inStyleScope(rel)) {
    lines.forEach((line, i) => {
      // убираем законные var(--…) и проверяем остаток строки:
      // «var(--fg); background:#f00» больше не проходит
      const stripped = line.replace(/var\(--[^)]*\)/g, '');
      if (COLOR_RE.test(stripped)) {
        problem('ЦВЕТ', `${rel}:${i + 1}`, 'Сырой цвет вместо var(--…). Токены — единственный источник правды.');
      }
    });
  }

  // серверные проверки — профиль saas
  if (PROFILE === 'saas') checkSaas(rel, lines);
}

async function checkEnvHygiene(allFiles) {
  const tracked = hasGit ? new Set((git('ls-files') || '').split('\n').filter(Boolean)) : null;
  const envFiles = allFiles.filter((f) => /(^|\/)\.env(\..*)?$/.test(f) && !f.endsWith('.example'));

  for (const f of envFiles) {
    if (tracked && tracked.has(f)) {
      problem('СЕКРЕТ', f, 'Файл окружения под контролем версий. Убрать из индекса и отозвать значения.');
    } else if (!tracked) {
      warn('ОКРУЖЕНИЕ', f, 'Файл окружения на диске. Git недоступен — проверить вручную, что он в .gitignore.');
    }
  }

  let gitignore = '';
  try {
    gitignore = await readFile(join(ROOT, '.gitignore'), 'utf8');
  } catch {
    problem('ГИГИЕНА', '.gitignore', 'Файла нет. Обязателен: .env, node_modules, dist.');
    return;
  }
  for (const need of ['.env', 'node_modules']) {
    if (!gitignore.split('\n').some((l) => l.trim().replace(/^\/|\/$/g, '').startsWith(need))) {
      problem('ГИГИЕНА', '.gitignore', `Нет шаблона ${need}.`);
    }
  }

  // пример-файл не должен содержать значений
  try {
    const ex = await readFile(join(ROOT, '.env.example'), 'utf8');
    ex.split('\n').forEach((line, i) => {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (m && m[2].trim() && !PLACEHOLDER_RE.test(m[2])) {
        warn('ОКРУЖЕНИЕ', `.env.example:${i + 1}`, `${m[1]} содержит значение. В примере только имена.`);
      }
    });
  } catch { /* нет файла — ок */ }
}

async function checkHistory() {
  if (!hasGit) {
    warn('ИСТОРИЯ', 'git', 'Репозиторий недоступен, история не проверена.');
    return;
  }
  const patterns = SECRET_PATTERNS.filter((p) => !p.clientOnly);
  let found = 0;

  // все пути, когда-либо встречавшиеся в истории, включая удалённые
  const everSeen = new Set(
    (git('log --all --pretty=format: --name-only') || '')
      .split('\n').map((s) => s.trim()).filter(Boolean)
  );
  const files = [...everSeen].filter(scannable);
  if (files.length > 500) {
    warn('ИСТОРИЯ', 'git', `Путей в истории ${files.length}, проверены первые 500. Для полной проверки — gitleaks detect --no-git=false.`);
  }
  for (const f of files.slice(0, 500)) {
    const hist = git(`log --all --no-color -p -- "${f}"`);
    if (!hist) continue;
    // Заглушки отсеиваются построчно, как в основном сканере. Проверять
    // PLACEHOLDER_RE на всём выводе нельзя: одна заглушка амнистировала бы
    // весь файл. Строки склеиваются обратно, чтобы многострочные шаблоны
    // (service_role + JWT) продолжали работать.
    const clean = hist.split('\n').filter((l) => !PLACEHOLDER_RE.test(l)).join('\n');
    for (const pat of patterns) {
      if (pat.re.test(clean)) {
        problem('ИСТОРИЯ', f, `${pat.name} встречается в истории коммитов. Отозвать значение, потом чистить историю.`);
        found++;
        break;
      }
    }
  }
  if (!found) notes.push('история чиста');
}

async function checkDist() {
  const distDir = join(ROOT, 'dist');
  try {
    await stat(distDir);
  } catch {
    problem('СБОРКА', 'dist', 'Папки нет. Сначала npm run build.');
    return;
  }

  const files = [];
  const walkDist = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walkDist(full);
      else files.push(full);
    }
  };
  await walkDist(distDir);

  // последняя линия обороны: dist — это то, что видит браузер,
  // поэтому clientOnly-шаблоны здесь проверяются ОБЯЗАТЕЛЬНО
  for (const file of files) {
    if (!['.html', '.js', '.css', '.json', '.txt', '.xml'].includes(extname(file))) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    const text = await readFile(file, 'utf8');
    for (const pat of SECRET_PATTERNS) {
      const m = text.match(pat.re);
      if (m && !PLACEHOLDER_RE.test(m[0])) {
        problem('СЕКРЕТ', rel, `${pat.name} попал в собранный файл. Деплоить нельзя${pat.clientOnly ? '' : ', значение отозвать'}.`);
      }
    }
  }

  // бюджет JS с учётом инлайн-скриптов — только для landing
  if (PROFILE === 'landing') {
  let jsBytes = 0;
  for (const file of files) {
    if (extname(file) === '.js') jsBytes += (await stat(file)).size;
    if (extname(file) === '.html') {
      const html = await readFile(file, 'utf8');
      for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
        if (/type=["']application\/(?:ld\+json|json)["']/i.test(m[0])) continue;
        jsBytes += Buffer.byteLength(m[1], 'utf8');
      }
    }
  }
  const kb = (jsBytes / 1024).toFixed(2);
  if (jsBytes > JS_BUDGET_BYTES) {
    problem('БЮДЖЕТ', 'dist', `JS ${kb} КБ при лимите ${JS_BUDGET_BYTES / 1024} КБ. Сокращать или поднимать лимит осознанно — это делает человек.`);
  } else {
    notes.push(`JS ${kb} из ${JS_BUDGET_BYTES / 1024} КБ`);
  }
  } // конец блока landing

  // заголовки безопасности: наличие конфигурации
  const headerConfigs = ['dist/_headers', 'public/_headers', 'netlify.toml', 'vercel.json', 'nginx.conf', 'Caddyfile'];
  const anyHeaders = (await Promise.all(headerConfigs.map((f) => stat(join(ROOT, f)).then(() => true).catch(() => false)))).some(Boolean);
  if (!anyHeaders) {
    warn('ЗАГОЛОВКИ', 'проект', 'Не найдена конфигурация заголовков (CSP, HSTS, nosniff). Задать на хостинге и проверить снаружи.');
  }
}

/* ==================================================================== run */

let targets;
if (MODE.staged && hasGit) {
  targets = (git('diff --cached --name-only --diff-filter=ACM') || '').split('\n').filter(Boolean).filter(scannable);
  notes.push(`режим индекса, файлов: ${targets.length}`);
} else {
  targets = (await walk(ROOT)).filter(scannable);
}

for (const rel of targets) await scanFile(rel);

const allFiles = MODE.staged ? targets : (await walk(ROOT));
await checkEnvHygiene(allFiles);

if (MODE.history) await checkHistory();
if (MODE.dist) await checkDist();

/* ================================================================= отчёт */

if (warnings.length) {
  console.error('\n  ПРЕДУПРЕЖДЕНИЯ (не блокируют, но назови их человеку)\n');
  for (const w of warnings) console.error('  ' + w + '\n');
}

if (problems.length) {
  console.error('  ГЕЙТ НЕ ПРОЙДЕН\n');
  for (const p of problems) console.error('  ' + p + '\n');
  console.error(`  Проблем: ${problems.length}` + (warnings.length ? `, предупреждений: ${warnings.length}` : '') + '\n');
  process.exit(1);
}

console.log('\n  Гейт пройден' + (notes.length ? ' · ' + notes.join(' · ') : '') + '\n');