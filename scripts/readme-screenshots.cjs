// README screenshots from the design preview. Run from the repository root while `npm run preview` is serving port 5176:
//   npx --yes --package @playwright/cli playwright-cli -s=readme open http://127.0.0.1:5176/ --browser chrome
//   npx --yes --package @playwright/cli playwright-cli -s=readme run-code --filename scripts/readme-screenshots.cjs
// Writes assets/screenshots/*.png at 2x resolution and a 560px panel width.
async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 560, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const shot = await context.newPage();
  const base = 'http://127.0.0.1:5176/';
  const saved = [];
  // Scene: a project manager on Claude Opus 5.5 (high) joins Release review.
  async function stage() {
    await shot.waitForFunction(() => window.fixture?.state);
    await shot.evaluate(() => {
      const f = window.fixture;
      f.setCatalog([...f.models, { id: 'claude-opus-5-5', providerID: 'anthropic', name: 'Claude Opus 5.5', enabled: false }]);
      f.state.agents.push({ sessionID: 'ses_erin', name: 'Erin', role: 'Project manager', projectID: 'project-a', directory: 'C:/Projects/Engine',
        activity: 'running', model: { id: 'claude-opus-5-5', providerID: 'anthropic', variant: 'high' } });
      f.state.discovery.registered.push('ses_erin');
      f.state.teams.find(team => team.id === 'team_review').members.unshift('ses_erin');
    });
  }
  async function capture(name, locator) {
    await shot.waitForTimeout(300);
    const path = `assets/screenshots/${name}.png`;
    await locator.screenshot({ path });
    saved.push(path);
  }

  await shot.goto(`${base}?view=dashboard`);
  await stage();
  // Re-render so the panel fetches the staged snapshot.
  await shot.evaluate(() => { window.fixture.showSettings(); window.fixture.showDashboard(); });
  await shot.getByRole('button', { name: 'Expand Release review', exact: true }).click();
  await shot.getByText('Project manager').first().waitFor();
  await capture('teams', shot.locator('main'));

  await context.close();

  // Settings use the full settings-page width, with two permissions allowed, as in the installed app.
  const wide = await page.context().browser().newContext({ viewport: { width: 820, height: 1200 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const settings = await wide.newPage();
  await settings.goto(`${base}?view=settings`);
  await settings.waitForFunction(() => window.fixture?.state);
  await settings.evaluate(() => {
    Object.assign(window.fixture.state.capabilities, { createSession: 'allow', changeMembers: 'allow' });
    window.fixture.showDashboard(); window.fixture.showSettings();
  });
  await settings.getByRole('heading', { name: 'Agent permissions', exact: true }).waitFor();
  await settings.waitForTimeout(300);
  const box = await settings.locator('.teams-page').boundingBox();
  await settings.screenshot({ path: 'assets/screenshots/settings.png', clip: { x: box.x - 28, y: box.y + 18, width: box.width + 56, height: box.height - 36 } });
  saved.push('assets/screenshots/settings.png');
  await wide.close();
  return JSON.stringify(saved);
}
