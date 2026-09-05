/**
 * Снимок экрана приложения под тестовым игроком.
 *
 *     node scripts/screenshot.mjs /hot-cold/duel out.png [слот]
 *
 * Существует затем, чтобы не писать вход заново каждый раз. Вход тут стоит
 * трёх экранов — «войти как тестовый», никнейм, возраст, — и каждый из них
 * ловил нас по разу: клик до гидратации молча не срабатывает, а после
 * онбординга приложение уходит на главную, а не на запрошенный адрес.
 * Токен живёт в памяти вкладки, поэтому переход по адресу требует входа
 * заново — отсюда рекурсия в конце.
 *
 * Нужен поднятый веб (:3000) и API (:3001) — см. docs/checklist.md.
 */
import { chromium } from 'playwright';

const [path = '/', out = 'shot.png', slot = '1'] = process.argv.slice(2);

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on('pageerror', (error) => console.log('ОШИБКА СТРАНИЦЫ:', error.message));

async function open(target, depth = 0) {
  await page.goto(`http://localhost:3000${target}?devSlot=${slot}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3500);

  const dev = page.getByRole('button', { name: /тестовый пользователь/i });
  if (await dev.count()) {
    await dev.click();
    await page.waitForTimeout(4000);
  }
  const welcome = page.getByRole('button', { name: 'Продолжить' });
  if (await welcome.count()) {
    await page.getByLabel('Никнейм').fill(`проверка${Date.now().toString().slice(-5)}`);
    await welcome.first().click();
    await page.waitForTimeout(2500);
  }
  const age = page.getByRole('button', { name: 'Начать играть' });
  if (await age.count()) {
    await page.getByText('18 лет и старше').click();
    await age.first().click();
    await page.waitForTimeout(3500);
  }
  // После онбординга приложение открывает главную — заходим ещё раз.
  if (!page.url().includes(target) && depth < 2) await open(target, depth + 1);
}

await open(path);
await page.screenshot({ path: out, fullPage: true });
console.log(`снято: ${out} (${page.url()})`);
await browser.close();
