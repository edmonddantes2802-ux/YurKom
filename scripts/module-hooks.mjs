/**
 * Резолв импортов для тестов под `node --test`.
 *
 * Тесты гоняют настоящие модули проекта, а не их копии, поэтому Node должен
 * понимать те же специи, что и сборщик Next:
 *
 *   1. `@/lib/foo` — алиас на корень проекта из `tsconfig.json` (`paths`).
 *      Node про tsconfig ничего не знает, а подменять импорты в самих модулях
 *      ради тестов нельзя: тогда тест проверяет не тот код, что едет в прод.
 *   2. `next/server` — у пакета `next` нет карты `exports` для этой подпути в
 *      обычном Node, реальный файл лежит рядом как `next/server.js`.
 *
 * Типы из `.ts` снимает сам Node, отдельного транспайлера и зависимостей не
 * требуется. Раннер запускается с `--experimental-transform-types`, а не на
 * стриппинге по умолчанию: `lib/telegram.ts` объявляет поля класса прямо в
 * конструкторе (`constructor(public readonly status: number)`), а такой
 * синтаксис нельзя выбросить, не переписав код, — режим strip-only на нём
 * падает. Менять рабочий код под ограничение раннера смысла нет.
 *
 * Про имя и место файла. `node --test` считает тестом любой файл внутри
 * каталога `test/`, а также любой файл вида `test-*.mjs` где угодно — хук в
 * обоих случаях попадал в прогон как пустой «зелёный» тест. Отсюда
 * `scripts/module-hooks.mjs`: ни один из шаблонов раннера на него не ложится.
 */

import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Порядок как у сборщика: TS раньше JS — исходник, а не случайный артефакт. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.jsx'];

function resolveAlias(specifier) {
  const base = join(ROOT, specifier.slice(2));
  if (existsSync(base) && !existsSync(join(base, 'package.json'))) {
    for (const ext of EXTENSIONS) {
      const indexed = join(base, `index${ext}`);
      if (existsSync(indexed)) return pathToFileURL(indexed).href;
    }
  }
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const url = resolveAlias(specifier);
      if (url) return { url, shortCircuit: true };
      throw new Error(`Не удалось разрешить алиас ${specifier} от корня ${ROOT}`);
    }
    if (specifier === 'next/server') {
      return nextResolve('next/server.js', context);
    }
    return nextResolve(specifier, context);
  },
});
