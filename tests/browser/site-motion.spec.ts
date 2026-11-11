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
});

for (const [path, selector] of [
  ['/', '.home-editorial h1'], ['/discover', '.wall-intro'], ['/creators', '.creator-social-heading'],
  ['/news', '.news-masthead'], ['/resources', '.link-directory-head'], ['/membership', '.membership-heading'],
  ['/inbox', '.creator-inbox-heading'], ['/account', '.page-intro'], ['/login', '.login-heading'],
] as const) {
  test(`${path} has a visible heading trace`, async ({ page }) => {
    await page.goto(base + path);
    const heading = page.locator(selector).first();
    await expect(heading).toBeVisible();
    const trace = await heading.evaluate(element => {
      const style = getComputedStyle(element, '::after');
      return { content: style.content, name: style.animationName, width: parseFloat(style.width) };
    });
    expect(trace.content).not.toBe('none');
    expect(trace.name).toContain('digivated-heading-trace');
    expect(trace.width).toBeGreaterThan(0);
  });
}
