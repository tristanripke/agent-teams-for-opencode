// Browser checks of the Messages and Activity team pickers against the design preview. Run from the repository root while `npm run preview` is serving port 5176:
//   npx --yes --package @playwright/cli playwright-cli -s=history open http://127.0.0.1:5176/?view=dashboard --browser chrome
//   npx --yes --package @playwright/cli playwright-cli -s=history run-code --filename scripts/history-browser-check.cjs
//   npx --yes --package @playwright/cli playwright-cli -s=history close
// Prints the checks that passed, and throws on the first failure.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const context = await page.context().browser().newContext({ viewport: { width: 720, height: 740 }, colorScheme: 'dark' });
  const view = await context.newPage(), errors = [], warnings = [], checks = [];
  view.on('pageerror', error => errors.push(String(error)));
  view.on('console', message => { if (message.text().includes('outside a `createRoot`')) warnings.push(message.text()); });
  const section = name => view.getByRole('navigation', { name: 'Agent Teams sections', exact: true }).getByRole('button', { name, exact: true }).click();
  const picker = () => view.locator('.teams-scope button[aria-haspopup="menu"]');
  const selected = name => view.waitForFunction(value => document.querySelector('.teams-scope button')?.textContent.trim().startsWith(value + ' ('), name);
  async function choose(name) {
    await picker().click();
    await view.getByRole('menuitem').filter({ hasText: new RegExp(`^${name} \\(`) }).click();
    await selected(name);
  }
  try {
    await view.goto('http://127.0.0.1:5176/?view=dashboard');
    await view.getByRole('button', { name: 'Expand Docs pass', exact: true }).waitFor();
    await section('Messages'); await selected('Release review');
    assert(await picker().innerText() === 'Release review (2)', 'Selected-team message count is not on the picker');
    for (const tab of ['Messages', 'Activity']) assert(await view.getByRole('navigation', { name: 'Agent Teams sections', exact: true })
      .getByRole('button', { name: tab, exact: true }).locator('.teams-count').count() === 0, `${tab} tab still shows a count`);
    assert(await view.locator('.teams-scope > span').first().innerText() === 'Team', 'Team label is missing');
    const layout = await view.locator('.teams-scope').evaluate(element => {
      const label = element.firstElementChild.getBoundingClientRect(), button = element.querySelector('button').getBoundingClientRect();
      return { gap: button.left - label.right, centers: Math.abs(label.top + label.height / 2 - button.top - button.height / 2) };
    });
    assert(layout.gap >= 7 && layout.gap <= 9 && layout.centers < 1, 'Team label and picker are not aligned');
    await picker().click();
    const items = await view.getByRole('menuitem').allInnerTexts();
    assert(items.includes('Connections (1)') && !items.some(item => item.includes('No team') || item.includes('General')), 'Message scopes are incorrectly labelled');
    await picker().click();
    checks.push('Team label is aligned, counts appear only on the picker, and outside-team messages are Connections');

    await choose('Docs pass');
    await view.getByText('The configuration page is rebuilt. Could you check the anchors?', { exact: true }).waitFor();
    assert(await view.getByText('Please review the retry handling in the admission path.', { exact: false }).count() === 0, 'Another team leaked into Docs messages');
    await section('Activity'); await selected('Release review');
    await view.getByText('Alice created team Release review', { exact: true }).waitFor();
    await choose('Connections');
    await view.getByText('No connection activity yet', { exact: true }).waitFor();
    assert(!(await view.locator('main').innerText()).includes('You changed a setting'), 'General settings were attributed to connections');
    await choose('General'); await view.getByText('You changed a setting', { exact: true }).waitFor();
    await section('Messages'); await selected('Docs pass');
    await section('Activity'); await selected('General');
    checks.push('Messages and Activity selections are independent, and General activity is separate from Connections');

    await section('Messages'); await choose('Release review');
    await view.getByText('Found the cursor bug.', { exact: false }).waitFor();
    await view.evaluate(() => window.fixture.holdSnapshot('team_docs'));
    await choose('Docs pass');
    await view.locator('.teams-loading').waitFor();
    assert(await view.getByText('Found the cursor bug.', { exact: false }).count() === 0, 'Previous team history appears under a newly selected team');
    await choose('Connections');
    await view.getByText('Unconfirmed', { exact: true }).waitFor();
    await view.evaluate(() => window.fixture.releaseSnapshot());
    await view.waitForFunction(() => window.fixture.heldSnapshot.finished);
    assert((await picker().innerText()).startsWith('Connections (') && await view.getByText('Unconfirmed', { exact: true }).count() === 1,
      'An older response overwrote the latest team selection');
    await choose('Docs pass');
    await view.getByText('The configuration page is rebuilt. Could you check the anchors?', { exact: true }).waitFor();
    checks.push('Scope changes hide the previous history while loading and discard out-of-order snapshot responses');

    await view.evaluate(() => window.fixture.showDashboard());
    await section('Messages'); await selected('Docs pass');
    await section('Activity'); await selected('General');
    await view.reload();
    await view.getByRole('button', { name: 'Expand Docs pass', exact: true }).waitFor();
    await section('Messages'); await selected('Docs pass');
    await section('Activity'); await selected('General');
    checks.push('Each selection survives panel remount and window reload');

    await view.evaluate(() => window.fixture.switchSession('ses_alice', 'other-server'));
    await selected('Release review'); await choose('Connections');
    await section('Messages'); await selected('Release review'); await choose('Connections');
    await view.evaluate(() => window.fixture.switchSession('ses_bob', 'fixture'));
    await selected('Docs pass'); await section('Activity'); await selected('General');
    await view.evaluate(() => window.fixture.switchSession('ses_alice', 'other-server'));
    await selected('Connections'); await section('Messages'); await selected('Connections');
    await view.evaluate(() => window.fixture.switchSession('ses_alice', 'fixture'));
    await selected('Docs pass');
    checks.push('Selection is shared across sessions on one server, isolated from other servers, and independent by section');

    await view.evaluate(() => {
      const source = window.fixture.state.messages.find(item => item.id === 'msg_docs_two');
      window.fixture.state.messages.push({ ...source, id: 'msg_docs_new', at: Date.now(), text: 'A new Docs-only message' });
    });
    await view.waitForFunction(() => document.querySelector('.teams-scope button')?.textContent.trim() === 'Docs pass (3)', null, { timeout: 10000 });
    await view.getByText('A new Docs-only message', { exact: true }).waitFor();
    await section('Activity'); await selected('General');
    await choose('Docs pass');
    assert(await picker().innerText() === 'Docs pass (2)', 'Activity picker is using the message count');
    checks.push('Polling updates the selected team and each picker uses its own section count');

    await section('Messages'); await selected('Docs pass');
    await view.evaluate(() => {
      const source = window.fixture.state.messages.find(item => item.id === 'msg_docs_two');
      for (let index = 0; index < 250; index++) window.fixture.state.messages.push({ ...source, id: `msg_page_${index}`, at: Date.now() - 1000 + index, text: `Paged ${index}` });
    });
    const older = () => view.getByRole('button', { name: 'Show older', exact: true });
    await older().waitFor({ timeout: 10000 });
    assert(await view.locator('.teams-list .teams-row.teams-top').count() === 200, 'First page should hold 200 messages');
    await older().click();
    await view.waitForFunction(() => document.querySelectorAll('.teams-list .teams-row.teams-top').length === 253);
    assert(await older().count() === 0, 'Show older remains with nothing left to load');
    await view.evaluate(() => { window.fixture.state.messages = window.fixture.state.messages.filter(item => !item.id.startsWith('msg_page_')); });
    await view.waitForFunction(() => document.querySelectorAll('.teams-list .teams-row.teams-top').length === 3, null, { timeout: 10000 });
    checks.push('Show older loads the rest of a team history and disappears when nothing is left');

    await section('Teams');
    await view.locator('.teams-team-header .teams-title', { hasText: /^Docs pass$/ }).click({ button: 'right' });
    await view.getByRole('menuitem', { name: 'Delete team', exact: true }).click();
    await view.getByRole('dialog', { name: 'Delete Docs pass?', exact: true }).getByRole('button', { name: 'Delete team', exact: true }).click();
    await view.waitForFunction(() => !window.fixture.state.teams.some(team => team.id === 'team_docs'));
    assert(await view.evaluate(() => window.fixture.state.messages.every(item => item.scope !== 'team_docs') &&
      window.fixture.state.audit.every(item => !item.scopes.includes('team_docs'))), 'Deleting a team left its history');
    await section('Messages'); await selected('Release review');
    await section('Activity'); await selected('Release review');
    await picker().click();
    assert(!(await view.getByRole('menuitem').allInnerTexts()).some(item => item.includes('Docs pass')), 'Deleted team is still offered');
    await picker().click();
    checks.push('Deleting the selected team clears its fixture history and both pickers fall back to a surviving team');

    await section('Messages');
    await view.setViewportSize({ width: 390, height: 740 });
    assert(await view.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Narrow picker overflows');
    assert(errors.length === 0 && warnings.length === 0, `Browser errors or leaked computations: ${JSON.stringify({ errors, warnings })}`);
    checks.push('Pickers fit a narrow panel without runtime errors or leaked Solid computations');

    await view.setViewportSize({ width: 900, height: 900 });
    await view.evaluate(() => window.fixture.showSettings());
    const remove = () => view.locator('[data-action=data]').getByRole('button', { name: 'Remove saved data', exact: true });
    const confirm = () => view.getByRole('dialog', { name: 'Remove all saved data?', exact: true });
    await remove().click();
    await confirm().getByRole('button', { name: 'Cancel', exact: true }).click();
    assert(await view.evaluate(() => window.fixture.state.teams.length > 0 && !window.fixture.calls.some(call => call.removeData)), 'Cancelling still removed data');
    await remove().click();
    await confirm().getByRole('button', { name: 'Remove saved data', exact: true }).click();
    await view.waitForFunction(() => window.fixture.calls.some(call => call.toast?.title === 'Saved data removed'));
    const removal = await view.evaluate(() => ({ confirm: window.fixture.calls.find(call => call.removeData).removeData.confirm, teams: window.fixture.state.teams.length,
      stores: window.fixture.calls.filter(call => call.storageRemove).map(call => [call.storageRemove, call.options?.from ?? '']) }));
    assert(removal.confirm === 'remove-all-saved-data' && removal.teams === 0, 'Saved data was not removed');
    assert(JSON.stringify(removal.stores.map(item => item[0])) === JSON.stringify(['teamOrder', 'historySelection']), `Window preferences were not removed: ${JSON.stringify(removal.stores)}`);
    // With a session open, that session's saved expansion can go too.
    await view.evaluate(() => window.fixture.switchSession('ses_alice'));
    await remove().click();
    await confirm().getByRole('button', { name: 'Remove saved data', exact: true }).click();
    await view.waitForFunction(() => window.fixture.calls.some(call => call.storageRemove === 'teamExpansion' && call.options?.session === 'ses_alice'));
    checks.push('Remove saved data asks first, cancels safely, and clears server data and window preferences');
    return { passed: checks.length, checks };
  } catch (error) {
    throw new Error(`${error.message}\nPassed: ${JSON.stringify(checks)}\nPreview: ${await view.locator('main').innerText()}\nErrors: ${JSON.stringify(errors)}`);
  } finally { await context.close(); }
}
