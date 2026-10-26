import { expect, test, type Page } from '@playwright/test';

/** Start each test from a clean, empty state. */
async function fresh(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#timerDisplay')).toHaveText('00:00:00');
}

async function addSubject(page: Page, name: string): Promise<void> {
  await page.fill('#subjectName', name);
  await page.click('#subjectForm button[type="submit"]');
}

test.describe('Cronômetro de Estudos', () => {
  test('carrega no estado inicial vazio', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('#timerDisplay')).toHaveText('00:00:00');
    await expect(page.locator('#playLabel')).toHaveText('Iniciar');
    await expect(page.locator('#statTotal')).toHaveText('0min');
    await expect(page.locator('#subjectCount')).toHaveText('0 cadastradas');
    await expect(page.locator('#lastEmpty')).toBeVisible();
  });

  test('cadastra matéria e aparece na lista e nos chips', async ({ page }) => {
    await fresh(page);
    await addSubject(page, 'Matemática');
    await expect(page.locator('#subjectCount')).toHaveText('1 cadastrada');
    await expect(page.locator('#subjectList')).toContainText('Matemática');
    await expect(page.locator('#subjectChips')).toContainText('Matemática');
    await expect(page.locator('.toast-success')).toContainText('adicionada');
  });

  test('rejeita matéria duplicada', async ({ page }) => {
    await fresh(page);
    await addSubject(page, 'História');
    await addSubject(page, 'história'); // case-insensitive duplicate
    await expect(page.locator('#subjectCount')).toHaveText('1 cadastrada');
    await expect(page.locator('.toast-error')).toContainText('Já existe');
  });

  test('rejeita nome vazio', async ({ page }) => {
    await fresh(page);
    await addSubject(page, '   ');
    await expect(page.locator('#subjectCount')).toHaveText('0 cadastradas');
  });

  test('inicia e pausa o cronômetro', async ({ page }) => {
    await fresh(page);
    await page.click('#playBtn');
    await expect(page.locator('#playLabel')).toHaveText('Pausar');
    await expect(page.locator('#timerState')).toHaveClass(/active/);
    await page.waitForTimeout(1400);
    await expect(page.locator('#timerDisplay')).not.toHaveText('00:00:00');
    await page.click('#playBtn');
    await expect(page.locator('#playLabel')).toHaveText('Iniciar');
    await expect(page.locator('#timerState')).not.toHaveClass(/active/);
  });

  test('pausa ao sair da página e preserva o tempo (freeze no reload)', async ({ page }) => {
    await fresh(page);
    await page.click('#playBtn');
    await page.waitForTimeout(1600); // > 1s of study
    await page.reload(); // simulates leaving the site
    // Timer must be paused (not running) and keep the accumulated time.
    await expect(page.locator('#playLabel')).toHaveText('Iniciar');
    await expect(page.locator('#timerDisplay')).not.toHaveText('00:00:00');
    await expect(page.locator('#timerState')).not.toHaveClass(/active/);
  });

  test('salvar e zerar cria registro no histórico', async ({ page }) => {
    await fresh(page);
    await addSubject(page, 'Física');
    await page.locator('#subjectChips .chip', { hasText: 'Física' }).click(); // attribute the timer
    await page.click('#playBtn');
    await page.waitForTimeout(1400);
    await page.click('#resetBtn');
    await expect(page.locator('#history')).toContainText('Física');
    await expect(page.locator('#historyFoot')).toContainText('1 registro');
    await expect(page.locator('#statSessions')).toHaveText('1 sessão');
    // Reset left the clock at zero.
    await expect(page.locator('#timerDisplay')).toHaveText('00:00:00');
  });

  test('registra tempo manualmente', async ({ page }) => {
    await fresh(page);
    await addSubject(page, 'Química');
    await page.click('#manualBtn');
    await expect(page.locator('#manualModal')).toHaveClass(/open/);
    await page.fill('#mHours', '1');
    await page.fill('#mMinutes', '0');
    await page.selectOption('#mSubject', { label: 'Química' });
    await page.click('#manualForm button[type="submit"]');
    await expect(page.locator('#manualModal')).not.toHaveClass(/open/);
    await expect(page.locator('#history')).toContainText('Química');
    await expect(page.locator('#history')).toContainText('1h');
    await expect(page.locator('#statTotal')).toHaveText('1h');
  });

  test('valida tempo manual maior que zero', async ({ page }) => {
    await fresh(page);
    await page.click('#manualBtn');
    await page.fill('#mHours', '0');
    await page.fill('#mMinutes', '0');
    await page.click('#manualForm button[type="submit"]');
    await expect(page.locator('.toast-error')).toContainText('maior que zero');
    await expect(page.locator('#manualModal')).toHaveClass(/open/);
  });

  test('adiciona comentário no último estudo e persiste', async ({ page }) => {
    await fresh(page);
    await page.click('#manualBtn');
    await page.fill('#mHours', '2');
    await page.fill('#mMinutes', '0');
    await page.click('#manualForm button[type="submit"]');

    await expect(page.locator('#lastEditor')).toBeVisible();
    await page.fill('#lastNoteText', 'Revisei lista de exercícios 3.');
    await page.click('#lastNoteSave');
    await expect(page.locator('.toast-success', { hasText: 'comentário' })).toBeVisible();

    await page.reload();
    await expect(page.locator('#lastNoteText')).toHaveValue('Revisei lista de exercícios 3.');
    await expect(page.locator('#history')).toContainText('Revisei lista de exercícios 3.');
  });

  test('atualiza a meta diária', async ({ page }) => {
    await fresh(page);
    await page.fill('#goalInput', '6');
    await page.press('#goalInput', 'Tab'); // trigger change
    await expect(page.locator('#goalText')).toContainText('/ 6h');
  });

  test('alterna o tema claro/escuro', async ({ page }) => {
    await fresh(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.click('#themeBtn');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('filtra o histórico por matéria', async ({ page }) => {
    await fresh(page);
    await addSubject(page, 'Biologia');
    await addSubject(page, 'Geografia');

    // Manual session for Biologia.
    await page.click('#manualBtn');
    await page.fill('#mHours', '1');
    await page.selectOption('#mSubject', { label: 'Biologia' });
    await page.click('#manualForm button[type="submit"]');

    const biologia = page.locator('#subjectList .subj-row', { hasText: 'Biologia' });
    const id = await biologia.getAttribute('data-id');
    await page.selectOption('#historyFilter', id!);
    await expect(page.locator('#history')).toContainText('Biologia');
    await expect(page.locator('#history')).not.toContainText('Geografia');
  });

  test('exclui matéria movendo estudos para "Geral"', async ({ page }) => {
    await fresh(page);
    page.on('dialog', (d) => void d.accept());
    await addSubject(page, 'Programação');
    await page.click('#manualBtn');
    await page.fill('#mHours', '1');
    await page.selectOption('#mSubject', { label: 'Programação' });
    await page.click('#manualForm button[type="submit"]');

    await page.locator('#subjectList .subj-row', { hasText: 'Programação' }).locator('button.danger').click();
    await expect(page.locator('#subjectCount')).toHaveText('0 cadastradas');
    // Session survives, reassigned to "Geral".
    await expect(page.locator('#history')).toContainText('Geral');
  });

  test('atalho de espaço alterna o cronômetro', async ({ page }) => {
    await fresh(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#playLabel')).toHaveText('Pausar');
    await page.keyboard.press('Space');
    await expect(page.locator('#playLabel')).toHaveText('Iniciar');
  });

  test('é acessível por teclado (modal abre e fecha com Escape)', async ({ page }) => {
    await fresh(page);
    await page.focus('#manualBtn');
    await page.keyboard.press('Enter');
    await expect(page.locator('#manualModal')).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#manualModal')).not.toHaveClass(/open/);
  });
});
