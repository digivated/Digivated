import { test, expect } from '@playwright/test';

const base = 'http://127.0.0.1:4321';

for (const path of ['/creators', '/news', '/resources', '/membership', '/inbox']) {
  test(`${path} shares the page entrance`, async ({ page }) => {
    await page.goto(base + path);
    const name = await page.locator('main#main > section').first().evaluate(element => getComputedStyle(element).animationName);
    expect(name).toContain('digivated-page-arrive');
  });
}

test('reduced motion keeps content immediately visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(base + '/creators');
  const section = page.locator('main#main > section').first();
  await expect(section).toBeVisible();
  expect(await section.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  expect(await page.locator('.creator-social-heading h1').evaluate(element => getComputedStyle(element, '::after').content)).toBe('none');
});

for (const [path, selector] of [
  ['/', '.home-editorial h1'], ['/discover', '.wall-intro h1'], ['/creators', '.creator-social-heading h1'],
  ['/news', '.news-masthead h1'], ['/resources', '.link-directory-head h1'], ['/membership', '.membership-heading h1'],
  ['/inbox', '.creator-inbox-heading h1'], ['/rankings', '.rankings-hero'], ['/account', '.page-intro h1'], ['/login', '.login-heading h1'],
] as const) {
  test(`${path} has a visible heading trace`, async ({ page }) => {
    await page.goto(base + path);
    const heading = page.locator(selector).first();
    await expect(heading).toBeVisible();
    const trace = await heading.evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return { content: style.content, name: style.animationName, width: parseFloat(style.width), duration: style.animationDuration, delay: style.animationDelay, timing: style.animationTimingFunction };
    });
    expect(trace.content).not.toBe('none');
    expect(trace.name).toContain('digivated-signal-sweep');
    expect(trace.duration).toBe('8s');
    expect(trace.delay).toBe('1s');
    expect(trace.timing).toBe('ease-in-out');
    expect(trace.width).toBeGreaterThan(30);
    if (path === '/creators') {
      await page.waitForTimeout(2200);
      const visible = await heading.evaluate(element => Number(getComputedStyle(element, '::after').opacity));
      expect(visible).toBeGreaterThan(.7);
    }
  });
}
