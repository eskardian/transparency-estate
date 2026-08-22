// Самопроверка localStorageLock из index.html. Запуск: node test_lock.js
// Ловит то, ради чего лок вообще существует: два контекста не должны одновременно
// обновлять refresh-токен (это и приводило к вылету сессии раз в пару дней).
const assert = require('assert');
const fs = require('fs');

// Вытаскиваем функцию прямо из index.html, чтобы тест не разъезжался с боевым кодом.
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const src = html.match(/async function localStorageLock[\s\S]*?\n  \}\n/)[0];

const store = new Map();
global.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const localStorageLock = new Function(src + '; return localStorageLock;')();

(async () => {
  // 1. Взаимное исключение: два параллельных держателя не пересекаются во времени.
  let inside = 0, overlaps = 0;
  const body = async () => {
    inside++;
    if (inside > 1) overlaps++;
    await new Promise(r => setTimeout(r, 30));
    inside--;
  };
  await Promise.all([1, 2, 3, 4].map(() => localStorageLock('auth', -1, body)));
  assert.strictEqual(overlaps, 0, 'держатели лока пересеклись — гонка за refresh-токеном осталась');

  // 2. Лок освобождается после работы.
  assert.strictEqual(store.get('sb-lock-auth'), undefined, 'лок не освобождён');

  // 3. Лок освобождается даже если fn упала (иначе одна ошибка вешает вход навсегда).
  await assert.rejects(() => localStorageLock('auth', -1, async () => { throw new Error('бум'); }));
  assert.strictEqual(store.get('sb-lock-auth'), undefined, 'лок залип после ошибки внутри fn');

  // 4. try-lock (таймаут 0): занято → fn не зовём и НЕ бросаем.
  //    Именно так supabase дёргает лок в тике авто-рефреша.
  let ranWhileBusy = false;
  const holder = localStorageLock('auth', -1, () => new Promise(r => setTimeout(r, 120)));
  await new Promise(r => setTimeout(r, 40));
  await localStorageLock('auth', 0, async () => { ranWhileBusy = true; });
  assert.strictEqual(ranWhileBusy, false, 'try-lock выполнил fn на занятом локе');
  await holder;

  // 5. Положительный таймаут на занятом локе — бросает.
  const holder2 = localStorageLock('auth', -1, () => new Promise(r => setTimeout(r, 200)));
  await new Promise(r => setTimeout(r, 40));
  await assert.rejects(() => localStorageLock('auth', 50, async () => {}), /lock timeout/);
  await holder2;

  // 6. Протухший лок от закрытой вкладки перехватывается, а не блокирует навсегда.
  store.set('sb-lock-auth', JSON.stringify({ id: 'мертвец', ts: Date.now() - 60000 }));
  let tookOver = false;
  await localStorageLock('auth', 100, async () => { tookOver = true; });
  assert.ok(tookOver, 'протухший лок не перехвачен — вход завис бы навсегда');

  console.log('lock: все проверки прошли');
})();
