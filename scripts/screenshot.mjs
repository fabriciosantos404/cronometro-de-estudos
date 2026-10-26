import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = process.env.OUT_DIR || process.cwd();

const now = Date.now();
const day = 86400000;
const state = {
  version: 1,
  subjects: [
    { id: 'a', name: 'Matemática', color: '#7c5cff', createdAt: now },
    { id: 'b', name: 'Física', color: '#22d3ee', createdAt: now },
    { id: 'c', name: 'História', color: '#fbbf24', createdAt: now },
    { id: 'd', name: 'Redação', color: '#34d399', createdAt: now },
  ],
  sessions: [
    { id: 's1', subjectId: 'a', durationSec: 5400, at: now - 3 * 3600000, note: 'Lista de exercícios 3 — errei pouco.', source: 'timer' },
    { id: 's2', subjectId: 'b', durationSec: 3600, at: now - 6 * 3600000, note: '', source: 'manual' },
    { id: 's3', subjectId: 'c', durationSec: 1800, at: now - day - 2 * 3600000, note: 'Revisão da Revolução Industrial.', source: 'timer' },
    { id: 's4', subjectId: 'd', durationSec: 2700, at: now - 2 * day - 3600000, note: '', source: 'timer' },
    { id: 's5', subjectId: 'a', durationSec: 7200, at: now - 4 * day - 3600000, note: 'Geometria espacial.', source: 'timer' },
  ],
  timer: { running: false, subjectId: 'a', startedAt: 0, baseSec: 0, updatedAt: now },
  settings: { goalHours: 6, theme: 'dark', chartRange: 'week', historyFilter: 'all' },
};

const browser = await chromium.launch();

async function shot(page, theme, file) {
  await page.goto(BASE);
  await page.evaluate(
    ([s, t]) => {
      localStorage.setItem('cronometroEstudos', JSON.stringify(s));
      document.documentElement.dataset.theme = t;
    },
    [state, theme],
  );
  await page.reload();
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 1400 }, locale: 'pt-BR' });
await shot(desktop, 'dark', 'preview-dark.png');
await shot(desktop, 'light', 'preview-light.png');
await desktop.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 1700 }, locale: 'pt-BR', deviceScaleFactor: 2 });
await shot(mobile, 'dark', 'preview-mobile.png');
await mobile.close();

await browser.close();
console.log('screenshots written');
