// Browser checks of the Desktop panel and settings against the design preview. Run from the repository root while `npm run preview` is serving port 5176:
//   npx --yes --package @playwright/cli playwright-cli -s=panel open http://127.0.0.1:5176/?view=dashboard --browser chrome
//   npx --yes --package @playwright/cli playwright-cli -s=panel run-code --filename scripts/ui-browser-check.cjs
//   npx --yes --package @playwright/cli playwright-cli -s=panel close
// Prints the checks that passed, and throws on the first failure.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const checks = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const section = name => button(name).click();
  // Rows have no menu button. A right-click opens the row's menu at the pointer.
  const teamMenu = name => page.locator('.teams-team-header .teams-title', { hasText: new RegExp(`^${name}$`) }).click({ button: 'right' });
  const memberMenu = (root, name) => root.locator('.teams-member-entry').filter({ hasText: name }).first()
    .locator('.teams-member-identity').click({ button: 'right' });
  const manageTeam = async name => { await teamMenu(name); await page.getByRole('menuitem', { name: 'Manage team', exact: true }).click(); };
  const text = () => page.locator('main').innerText();
  const called = predicate => page.evaluate(source => window.fixture.calls.some(new Function('call', `return ${source}`)), predicate);
  const snapshots = () => page.evaluate(() => window.fixture.calls.filter(call => call.snapshot).length);
  const nextSnapshot = async () => {
    const before = await snapshots();
    await page.waitForFunction(count => window.fixture.calls.filter(call => call.snapshot).length > count, before, { timeout: 10000 });
  };
  const agentTiles = () => page.locator('.teams-agent-entry > .teams-peer-tile');
  const chooseHistory = async name => {
    await page.locator('.teams-scope button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem').filter({ hasText: new RegExp(`^${name} \\(`) }).click();
  };

  assert(await page.evaluate(() => {
    const f = window.fixture, menu = f.menus.find(item => item.menu === 'session.panel' && item.title === 'Agent Teams');
    f.closePanel();
    if (!menu || window.fixtureSettings.title !== 'Agent Teams' || menu.opened || f.panel.list({ open: [] }).length !== 0) return false;
    menu.run();
    const tab = f.panel.list({ open: ['collaboration'] })[0];
    const opened = menu.opened && tab?.title === 'Agent Teams' &&
      f.calls.some(call => call.panel === 'agent-teams-for-opencode:collaboration' && call.session === 'ses_alice');
    f.closePanel();
    const restored = !menu.opened && f.panel.list({ open: [] }).length === 0 && f.panel.list({ open: ['collaboration'] })[0] === tab;
    menu.run();
    return opened && restored;
  }), 'Sidebar launcher, close or restore contract failed');
  assert(await button('Teams').getAttribute('aria-pressed') === 'true', 'Agent Teams did not start on Teams');
  assert(await page.getByRole('heading', { name: 'Agent Teams', exact: true }).count() === 1, 'Agent Teams heading missing');
  assert(await button('Refresh').count() === 0, 'Redundant manual Refresh button remains');
  checks.push('Native sidebar launcher opens Teams and follows close and restore state');

  const preview = page.getByRole('navigation', { name: 'Design preview', exact: true });
  await preview.getByRole('button', { name: 'Settings', exact: true }).click();
  assert(await page.getByRole('switch').count() === 7, 'Preview settings switch does not show the real settings view');
  assert(page.url().includes('view=settings'), 'Settings preview URL is not shareable');
  await preview.getByRole('button', { name: 'Dashboard', exact: true }).click();
  assert(page.url().includes('view=dashboard'), 'Dashboard preview URL is not shareable');
  checks.push('Persistent design toolbar switches dashboard/settings with shareable URLs');

  await page.waitForFunction(() => document.querySelector('main').innerText.includes('Docs pass'));
  assert(await page.evaluate(() => {
    const first = document.querySelector('.teams-section-head + .teams-team');
    return first && first.getBoundingClientRect().top - first.previousElementSibling.getBoundingClientRect().bottom >= 8;
  }), 'First team card lacks the requested space below the section heading');
  for (const label of ['Leave list', 'New team']) assert(await button(label).evaluate(element =>
    getComputedStyle(element).fontSize === getComputedStyle(element.closest('.teams-dashboard')).fontSize), `${label} still uses undersized typography`);
  assert((await text()).includes('3 agents · 1 active · 2 projects'), 'Team size, activity or projects missing');
  await section('Expand Release review');
  const releaseTile = page.locator('[data-team-id="team_review"]');
  await releaseTile.locator('.teams-team-toggle').hover();
  assert(await releaseTile.locator('.teams-team-header').evaluate(element => getComputedStyle(element).boxShadow.includes('inset')), 'Team hover lacks a hairline');
  await page.mouse.move(0, 0);
  assert(await releaseTile.locator('.teams-team-header').evaluate(element => getComputedStyle(element).boxShadow === 'none'), 'Expanded or focused team retained its hover hairline');
  assert(await releaseTile.locator('.teams-team-toggle [data-icon="chevron-down"]').count() === 1, 'Expanded team chevron does not point down');

  const teamOrder = () => page.evaluate(() => [...document.querySelectorAll('[data-team-id]')].map(element => element.dataset.teamId).join());
  assert(await teamOrder() === 'team_review,team_docs', `Unexpected default team order: ${await teamOrder()}`);
  assert(await page.evaluate(() => {
    const [first, second] = document.querySelectorAll('.teams-team');
    return second.getBoundingClientRect().top - first.getBoundingClientRect().bottom >= 8;
  }), 'Teams lack space between them');
  const docsTile = page.locator('[data-team-id="team_docs"]');
  const docsHandle = docsTile.locator('.teams-team-handle');
  const docsExpanded = () => docsTile.locator('.teams-team-toggle [data-icon="chevron-down"]').count();
  assert(await docsTile.locator('.teams-team-handle [data-icon="chevron-grabber-vertical"]').count() === 1, 'Team has no drag handle');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  assert(await docsHandle.evaluate(element => getComputedStyle(element).opacity) === '0', 'Drag handle shows without hover');
  const docsRow = await docsTile.locator('.teams-team-toggle').boundingBox();
  // The row itself never reorders: dragging or double-clicking it only expands and collapses.
  await page.mouse.move(docsRow.x + 80, docsRow.y + 20);
  await page.waitForTimeout(150);
  assert(await docsHandle.evaluate(element => getComputedStyle(element).opacity) === '1', 'Drag handle does not appear on hover');
  await page.mouse.down();
  await page.mouse.move(docsRow.x + 80, docsRow.y - 180, { steps: 6 });
  assert(await page.locator('.teams-team-dragging').count() === 0, 'Dragging the row started a reorder');
  await page.mouse.up();
  assert(await teamOrder() === 'team_review,team_docs', 'Dragging the row reordered teams');
  const startExpanded = await docsExpanded();
  await page.mouse.move(docsRow.x + 80, docsRow.y + 20);
  await page.mouse.click(docsRow.x + 80, docsRow.y + 20);
  assert(await docsExpanded() !== startExpanded, 'A single click on the row did not expand it at once');
  await page.mouse.click(docsRow.x + 80, docsRow.y + 20);
  assert(await docsExpanded() === startExpanded, 'A second click on the row did not collapse it');
  const handleBox = await docsHandle.boundingBox();
  const handleX = handleBox.x + handleBox.width / 2, handleY = handleBox.y + handleBox.height / 2;
  assert(handleBox.x + handleBox.width <= docsRow.x + 30 && handleBox.x >= docsRow.x, 'Drag handle is not on the left of the card');
  assert(await docsTile.locator('.teams-team-toggle button, .teams-team-toggle .teams-team-handle').count() === 0, 'Drag handle is nested inside the row button');
  await page.mouse.move(handleX, handleY);
  await page.waitForTimeout(150);
  assert(await docsHandle.locator('button').evaluate(element => getComputedStyle(element).backgroundColor) === 'rgba(0, 0, 0, 0)', 'Drag handle has its own hover background');
  // Clicking the handle without dragging does nothing.
  await page.mouse.click(handleX, handleY);
  assert(await docsExpanded() === startExpanded && await teamOrder() === 'team_review,team_docs', 'Clicking the handle changed the team');
  // Only hover shows it: nothing lingers after clicks on the handle or the row.
  const handlesHidden = async () => { await page.mouse.move(0, 0); await page.waitForTimeout(150); return page.evaluate(() => [...document.querySelectorAll('.teams-team-handle')].every(element => getComputedStyle(element).opacity === '0')); };
  assert(await handlesHidden(), 'Drag handle stays visible after clicking it');
  assert(await page.evaluate(() => !document.activeElement?.closest('.teams-team-handle')), 'Clicking the handle gave it focus');
  await page.mouse.click(docsRow.x + 80, docsRow.y + 20);
  assert(await handlesHidden(), 'Drag handle stays visible after clicking the row');
  await page.mouse.click(docsRow.x + 80, docsRow.y + 20);
  // Escape cancels and leaves no offsets behind.
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX, handleY - 40, { steps: 3 });
  await page.waitForFunction(() => document.querySelector('.teams-team-dragging'));
  // Holding past the end must not grow the panel and scroll away from the pointer.
  await page.mouse.move(handleX, handleY + 700, { steps: 6 });
  await page.waitForTimeout(400);
  const pastEnd = await page.evaluate(() => {
    const dragged = document.querySelector('.teams-team-dragging'), last = [...document.querySelectorAll('.teams-team')].at(-1);
    return { offset: new DOMMatrix(getComputedStyle(dragged).transform).m42, last: dragged === last, scroll: document.querySelector('.teams-dashboard').scrollTop, page: document.documentElement.scrollTop };
  });
  assert(pastEnd.last && pastEnd.offset <= 0.5 && pastEnd.scroll === 0, `Dragging past the end ran away: ${JSON.stringify(pastEnd)}`);
  await page.mouse.move(handleX, handleY - 200, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('.teams-team-dragging') && ![...document.querySelectorAll('.teams-team')].some(element => element.style.transform));
  assert(await teamOrder() === 'team_review,team_docs' && await docsExpanded() === startExpanded, 'Escape did not cancel the reorder');
  // Dragging the handle moves the team and animates the others aside.
  await page.waitForTimeout(250);
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX, handleY - 40, { steps: 3 });
  await page.waitForFunction(() => document.querySelector('.teams-team-dragging'));
  await page.mouse.move(handleX, handleY - 220, { steps: 8 });
  const midDrag = await page.evaluate(() => ({
    dragged: getComputedStyle(document.querySelector('.teams-team-dragging')).transform,
    shifted: document.querySelector('[data-team-id="team_review"]').style.transform,
    transition: document.querySelector('[data-team-id="team_review"]').style.transition,
    selected: String(getSelection()),
  }));
  assert(midDrag.dragged !== 'none' && midDrag.shifted.includes('translateY') && midDrag.transition.includes('transform') && !midDrag.selected, `Reorder is not animated: ${JSON.stringify(midDrag)}`);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-team-id]').dataset.teamId === 'team_docs');
  assert(await docsExpanded() === startExpanded, 'Reordering changed the expansion');
  assert(await page.evaluate(() => ![...document.querySelectorAll('.teams-team')].some(element => element.style.transform || element.classList.contains('teams-team-dragging')) && !document.querySelector('.teams-reordering')), 'Reorder left offsets behind');
  assert(await page.getByRole('status').filter({ hasText: 'Docs pass moved to position 1 of 2.' }).count() === 1, 'Reorder was not announced');
  assert(await handlesHidden(), 'Drag handle stays visible after a drag');
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('agent-teams-preview:order')).order.join()) === 'team_docs,team_review', 'Team order was not saved');
  await page.evaluate(() => { window.fixture.showSettings(); window.fixture.showDashboard(); });
  await page.waitForFunction(() => document.querySelector('[data-team-id]')?.dataset.teamId === 'team_docs');
  // The keyboard equivalent keeps focus on the moved team.
  await page.locator('[data-team-id="team_docs"] .teams-team-handle button').focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => document.querySelector('[data-team-id]').dataset.teamId === 'team_review');
  await page.waitForTimeout(150);
  assert(await page.locator('[data-team-id="team_docs"] .teams-team-handle').evaluate(element => getComputedStyle(element).opacity) === '1', 'Keyboard users cannot see the focused handle');
  assert(await page.evaluate(() => document.activeElement?.closest('[data-team-id]')?.dataset.teamId) === 'team_docs', 'Keyboard reorder lost focus');
  await page.keyboard.press('ArrowDown');
  assert(await teamOrder() === 'team_review,team_docs', 'Keyboard reorder moved past the end');
  await page.evaluate(() => window.fixture.teamOrder.update(draft => { draft.order = []; }));
  await page.waitForTimeout(450);
  checks.push('Teams have space between them; a left drag handle reorders with animation, saves, cancels on Escape, leaves the row click and expansion alone and has a keyboard equivalent');

  await memberMenu(page, 'Alice');
  await page.waitForFunction(() => document.querySelector('[data-teams-menu]'));
  assert(await page.getByRole('menuitem', { name: 'Edit name and role', exact: true }).evaluate(element => {
    const style = getComputedStyle(element);
    return style.paddingLeft === style.paddingRight;
  }), 'Our menu items have uneven padding');
  await page.keyboard.press('Escape');
  await page.mouse.click(1, 1);
  checks.push('Own menu rows have even padding');
  assert(await releaseTile.evaluate(element => {
    const tile = element.querySelector('.teams-team-header').getBoundingClientRect();
    const link = element.querySelector('.teams-team-toggle').getBoundingClientRect();
    return Math.abs(tile.width - link.width) < 2;
  }), 'Team tile highlight does not extend beneath its management controls');
  const releaseMembers = page.getByRole('group', { name: 'Members of Release review', exact: true });
  const memberTile = (group, name) => group.locator('.teams-peer-tile').filter({ hasText: name });
  const aliceMember = memberTile(releaseMembers, 'Alice');
  assert(await aliceMember.locator('.teams-member-identity').innerText() === 'Alice [Developer]', 'Member role is not beside the name in brackets');
  assert(await aliceMember.locator('.teams-you').innerText() === 'You', 'Current-member You indicator was removed');
  assert(await aliceMember.locator('.teams-member-self').evaluate(element => getComputedStyle(element).textDecorationLine.includes('underline')), 'Current member name and role are not underlined');
  assert(await memberTile(releaseMembers, 'Bob').locator('.teams-member-self').count() === 0, 'Another member was incorrectly underlined');
  assert(await aliceMember.locator('.teams-member-project').innerText() === 'Engine' &&
    await aliceMember.locator('.teams-member-model').innerText() === 'GPT-6.1 Sol · high', 'Member project and real model are not on row two');
  assert((await aliceMember.locator('.teams-member-model').getAttribute('title')).includes('openai/gpt-6.1-sol'), 'Model tooltip loses the provider or selected model ID');
  assert(await releaseMembers.evaluate(element => Math.abs(
    element.querySelector('.teams-peer-details > .teams-title').getBoundingClientRect().left -
    element.querySelector('.teams-add-session-button > span:last-child').getBoundingClientRect().left) < 2), 'Add sessions is not aligned with member names');
  assert(await releaseTile.evaluate(element => {
    const member = getComputedStyle(element.querySelector('.teams-peer-details > .teams-title'));
    const add = getComputedStyle(element.querySelector('.teams-add-session-button'));
    return add.fontSize === member.fontSize && add.fontFamily === member.fontFamily;
  }), 'Team action labels use different typography from member rows');
  assert(await page.getByRole('navigation', { name: 'Agent Teams sections', exact: true }).evaluate(element => getComputedStyle(element).gap === '6px'), 'Tab gaps are not 6px');
  assert((await releaseMembers.innerText()).includes('Bob') && (await releaseMembers.innerText()).includes('Carol'), 'Expanded team members missing');
  await section('Expand Docs pass');
  const docsMembers = page.getByRole('group', { name: 'Members of Docs pass', exact: true });
  assert((await docsMembers.innerText()).includes('Dana'), 'Existing unlisted member is not named');
  assert(await memberTile(docsMembers, 'Dana').locator('.teams-member-model').innerText() === 'Model unavailable', 'Missing model was guessed from the composer');
  const originalModel = await page.evaluate(() => window.fixture.state.agents[0].model);
  await page.evaluate(() => {
    window.fixture.state.agents[0].model = undefined;
    window.fixture.setNativeModel('ses_alice', { id: 'cached-model', providerID: 'cache-provider' });
  });
  await nextSnapshot();
  await aliceMember.locator('.teams-member-model').filter({ hasText: 'cached-model' }).waitFor();
  assert((await aliceMember.locator('.teams-member-model').getAttribute('title')).includes('cache-provider/cached-model'), 'Member model does not fall back to that same native session cache');
  await page.evaluate(() => window.fixture.setNativeModel('ses_alice', undefined));
  await page.evaluate(() => { window.fixture.state.agents[0].model = { id: 'custom-model', providerID: 'custom-provider' }; });
  await nextSnapshot();
  await aliceMember.locator('.teams-member-model').filter({ hasText: 'custom-model' }).waitFor();
  assert(await releaseMembers.count() === 1 && await aliceMember.locator('.teams-member-model').count() === 1, 'Model refresh collapsed the team or duplicated its label');
  await page.evaluate(model => { window.fixture.state.agents[0].model = model; }, originalModel);
  await nextSnapshot();
  await aliceMember.locator('.teams-member-model').filter({ hasText: 'GPT-6.1 Sol · high' }).waitFor();
  // A model picked in the open session's composer shows at once, for that session only, until its record changes.
  const bobModel = await memberTile(releaseMembers, 'Bob').locator('.teams-member-model').innerText();
  await page.evaluate(() => window.fixture.setComposerModel({ providerID: 'openai', modelID: 'gpt-6-luna', variant: 'low' }));
  // Well inside the five-second poll, so the change cannot have come from polling.
  await aliceMember.locator('.teams-member-model[title*="openai/gpt-6-luna · low"]').waitFor({ timeout: 2000 });
  assert(await memberTile(releaseMembers, 'Bob').locator('.teams-member-model').innerText() === bobModel, 'A composer choice was shown for another member');
  assert(await memberTile(docsMembers, 'Dana').locator('.teams-member-model').innerText() === 'Model unavailable', 'A composer choice was shown for a member with no model');
  await page.evaluate(() => { window.fixture.state.agents[0].model = { id: 'gpt-6.1-sol', providerID: 'openai', variant: 'xhigh' }; });
  await nextSnapshot();
  await aliceMember.locator('.teams-member-model').filter({ hasText: 'GPT-6.1 Sol · xhigh' }).waitFor();
  await page.evaluate(model => { window.fixture.setComposerModel(window.fixture.composerModel); window.fixture.state.agents[0].model = model; }, originalModel);
  await nextSnapshot();
  await aliceMember.locator('.teams-member-model').filter({ hasText: 'GPT-6.1 Sol · high' }).waitFor();
  checks.push('A model picked in the open session shows at once for that member only, and gives way when its record changes');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await releaseMembers.evaluate(element => [...element.querySelectorAll('.teams-peer-tile')].every(row => row.scrollWidth <= row.clientWidth)), 'Approved member layout overflows a narrow panel');
  assert(await aliceMember.locator('.teams-you').isVisible(), 'Narrow member row hides You');
  await page.setViewportSize({ width: 1280, height: 900 });
  checks.push('Approved member rows show bracketed roles, project/model details, retained You and self underline without extra polling');
  await preview.getByRole('button', { name: 'Settings', exact: true }).click();
  await preview.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await releaseMembers.waitFor();
  assert(await docsMembers.count() === 1, 'Panel remount forgot expanded teams');
  await page.evaluate(() => window.fixture.switchSession('ses_bob'));
  await page.waitForFunction(() => !document.querySelector('[aria-label="Members of Release review"]'));
  assert(await docsMembers.count() === 0, 'Another session inherited expanded teams');
  await section('Expand Docs pass');
  await page.evaluate(() => window.fixture.switchSession('ses_alice'));
  await releaseMembers.waitFor();
  await section('Collapse Docs pass');
  await page.evaluate(() => window.fixture.switchSession('ses_bob'));
  await docsMembers.waitFor();
  assert(await releaseMembers.count() === 0, 'Session-specific expansion leaked across navigation');
  await page.evaluate(() => window.fixture.switchSession('ses_bob', 'other-fixture'));
  await page.waitForFunction(() => !document.querySelector('[aria-label="Members of Docs pass"]'));
  await page.evaluate(() => window.fixture.switchSession('ses_alice'));
  await releaseMembers.waitFor();
  assert(await docsMembers.count() === 0, 'Collapsed state was not restored');
  await page.reload();
  await releaseMembers.waitFor();
  assert(await docsMembers.count() === 0, 'Window reload forgot expanded/collapsed teams');
  await section('Expand Docs pass');
  checks.push('Expanded and collapsed teams persist across remounts and reloads, separately for each session and server');
  await teamMenu('Docs pass');
  assert(await page.getByRole('menuitem', { name: 'Manage team', exact: true }).count() === 1, 'User cannot manage a team outside session membership');
  await page.mouse.click(1, 1);
  assert(await button('Manage team').count() === 0, 'Rows still show a Manage team button');
  const docsMenu = page.locator('[data-team-id="team_docs"] .teams-team-header > .teams-row-menu');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  assert(await docsMenu.evaluate(element => getComputedStyle(element).opacity) === '0', 'Row menu button shows without hover');
  await page.locator('[data-team-id="team_docs"] .teams-team-header').hover();
  await page.waitForTimeout(150);
  assert(await docsMenu.evaluate(element => getComputedStyle(element).opacity) === '1', 'Row menu button does not appear on hover');
  await button('Actions for Docs pass').click();
  assert(await page.getByRole('menuitem', { name: 'Manage team', exact: true }).count() === 1 &&
    await docsMenu.evaluate(element => getComputedStyle(element).opacity) === '1', 'Row menu button does not open the row menu or hides while it is open');
  await page.mouse.click(1, 1);
  await page.evaluate(() => {
    window.fixture.setAttention('ses_bob', true, true, 'running');
    window.fixture.setAttention('ses_carol', false, true, 'running');
  });
  assert(await releaseMembers.getByRole('img', { name: 'Needs approval', exact: true }).count() === 1, 'Approval indicator missing or question incorrectly wins');
  assert(await releaseMembers.getByRole('img', { name: 'Needs input', exact: true }).count() === 1, 'Question indicator missing');
  assert(await releaseMembers.getByRole('img', { name: 'Active', exact: true }).count() === 1, 'Active indicator missing');
  assert(await docsMembers.getByRole('img', { name: 'Idle', exact: true }).count() === 1, 'Idle indicator missing');
  const colors = await releaseMembers.evaluate(element => ({
    question: getComputedStyle(element.querySelector('.teams-indicator-question')).color,
    approval: getComputedStyle(element.querySelector('.teams-indicator-approval')).color,
    indented: element.getBoundingClientRect().left > element.parentElement.getBoundingClientRect().left,
  }));
  assert(colors.question === 'rgb(121, 192, 255)' && colors.approval === 'rgb(255, 184, 176)' && colors.indented, 'Team status colors or indentation are wrong');
  await memberTile(releaseMembers, 'Bob').click();
  assert(await memberTile(releaseMembers, 'Bob').locator('button').count() === 0, 'Member tile contains nested buttons');
  assert(await called("call.navigation?.id === 'ses_bob'"), 'Clicking a team member did not navigate');
  await page.screenshot({ path: 'output/playwright/teams-expanded.png', fullPage: true });
  await section('Collapse Release review');
  await nextSnapshot();
  assert(await releaseMembers.count() === 0, 'Automatic refresh reopened a collapsed team');
  await section('Expand Release review');
  checks.push('Teams expand and collapse with indented navigable members and native approval, question, active and idle indicators');

  const navigationsBeforeEdit = await page.evaluate(() => window.fixture.calls.filter(call => call.navigation).length);
  await memberMenu(releaseMembers, 'Bob');
  const editMember = page.getByRole('menuitem', { name: 'Edit name and role', exact: true });
  assert(await editMember.evaluate(element => {
    const box = element.getBoundingClientRect(), top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top === element || element.contains(top);
  }), 'Member profile menu is covered by another row');
  await editMember.click();
  const bobProfile = page.getByRole('dialog', { name: 'Edit name and role: Bob', exact: true });
  assert(await bobProfile.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Bob' &&
    await bobProfile.getByRole('textbox', { name: 'Role', exact: true }).inputValue() === 'Reviewer', 'Another member profile is not prefilled');
  await bobProfile.getByRole('textbox', { name: 'Name', exact: true }).fill('Discarded name');
  await page.locator('.ui-backdrop').last().click({ position: { x: 2, y: 2 } });
  await bobProfile.waitFor({ state: 'hidden' });
  assert(!await called('call.userProfile'), 'Outside dismissal saved a member profile');
  await memberMenu(releaseMembers, 'Bob');
  await editMember.click();
  assert(await bobProfile.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Bob', 'Discarded profile edits were retained');
  await bobProfile.getByRole('textbox', { name: 'Name', exact: true }).fill('Bobby');
  await bobProfile.getByRole('textbox', { name: 'Role', exact: true }).fill('QA reviewer');
  await bobProfile.getByRole('button', { name: 'Save', exact: true }).click();
  await memberTile(releaseMembers, 'Bobby').waitFor();
  assert(await called("call.userProfile && call.sessionID === 'ses_bob' && call.input.name === 'Bobby' && call.input.role === 'QA reviewer'"), 'Member edit targeted the current session instead of the selected member');
  assert(await releaseMembers.count() === 1 && (await aliceMember.innerText()).includes('Alice'), 'Member profile save collapsed the team or renamed the current session');
  await memberMenu(releaseMembers, 'Bobby');
  await editMember.click();
  const renamedProfile = page.getByRole('dialog', { name: 'Edit name and role: Bobby', exact: true });
  await renamedProfile.getByRole('textbox', { name: 'Name', exact: true }).fill('Bob');
  await renamedProfile.getByRole('textbox', { name: 'Role', exact: true }).fill('Reviewer');
  await renamedProfile.getByRole('button', { name: 'Save', exact: true }).click();
  await memberTile(releaseMembers, 'Bob [Reviewer]').waitFor();
  await memberMenu(docsMembers, 'Dana');
  await editMember.click();
  const danaProfile = page.getByRole('dialog', { name: 'Edit name and role: Dana', exact: true });
  assert(await danaProfile.getByRole('textbox', { name: 'Role', exact: true }).inputValue() === 'Writer', 'Unlisted member profile is unavailable');
  await danaProfile.getByRole('textbox', { name: 'Role', exact: true }).fill('Editor');
  await danaProfile.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.fixture.state.people.ses_dana.role === 'Editor');
  assert(await page.evaluate(() => !window.fixture.state.discovery.registered.includes('ses_dana')), 'Editing an unlisted member registered it');
  await memberMenu(releaseMembers, 'Bob');
  await editMember.click();
  await bobProfile.getByRole('textbox', { name: 'Name', exact: true }).fill('Failed rename');
  await page.evaluate(() => window.fixture.failProfile({}));
  await bobProfile.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.toast?.title === 'Could not save name and role. Refresh and try again.'));
  assert(await page.evaluate(() => window.fixture.state.agents.find(peer => peer.sessionID === 'ses_bob').name) === 'Bob', 'Failed profile save changed the target');
  await page.evaluate(() => window.fixture.failProfile(undefined));
  assert(await page.evaluate(() => window.fixture.calls.filter(call => call.navigation).length) === navigationsBeforeEdit, 'Member menu navigated away from the current session');
  checks.push('Team member menus edit another or unlisted session through the user API, prefill both fields, cancel safely and preserve navigation/expansion');

  await manageTeam('Docs pass');
  const manageDocs = page.getByRole('dialog', { name: 'Manage team: Docs pass', exact: true });
  assert((await manageDocs.boundingBox()).height >= 590, 'Manage team did not use the taller native dialog size');
  assert(await page.getByText('Waiting for your approval or saving.', { exact: false }).count() === 0, 'Opening team management inserted a layout-shifting approval banner');
  assert(await manageDocs.getByRole('textbox', { name: 'Team name', exact: true }).inputValue() === 'Docs pass', 'Manage team name was not prefilled');
  assert(await manageDocs.getByRole('switch', { name: 'Dana', exact: true }).isChecked(), 'Unlisted existing member was lost');
  await manageDocs.getByRole('textbox', { name: 'Team name', exact: true }).fill('Discarded team edit');
  await page.locator('.ui-backdrop').last().click({ position: { x: 2, y: 2 } });
  await manageDocs.waitFor({ state: 'hidden' });
  assert(!await called("call.userTeam && call.action === 'team.update'"), 'Clicking away saved a team edit');
  await manageTeam('Docs pass');
  assert(await manageDocs.getByRole('textbox', { name: 'Team name', exact: true }).inputValue() === 'Docs pass', 'Click-away retained a discarded team draft');
  await manageDocs.getByRole('searchbox', { name: 'Search sessions', exact: true }).fill('Carol');
  await manageDocs.getByRole('switch', { name: 'Carol', exact: true }).check();
  await manageDocs.getByRole('button', { name: 'Save team', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.userTeam && call.action === 'team.update'));
  assert(await called("call.userTeam && call.input.id === 'team_docs' && call.input.members.join() === 'ses_bob,ses_dana,ses_carol' && !('sessionID' in call)"), 'Manual team management forced the current session into another team');
  checks.push('Manual team management can add registered sessions to another team and preserves existing unlisted members');
  checks.push('Clicking outside Manage team dismisses the form and discards unsaved changes');

  await section('New team');
  const dialog = page.getByRole('dialog', { name: 'New team', exact: true });
  assert((await dialog.boundingBox()).height >= 590, 'New team did not use the taller native dialog size');
  assert((await dialog.innerText()).includes('Only listed sessions appear'), 'Registration rule missing in team form');
  assert(await dialog.getByRole('button', { name: 'Create team', exact: true }).isDisabled(), 'Empty team can be submitted');
  await dialog.getByRole('textbox', { name: 'Team name', exact: true }).fill('Launch');
  assert(await dialog.getByRole('button', { name: 'Create team', exact: true }).isEnabled(), 'A named team cannot start with just its creator');
  await dialog.getByRole('button', { name: 'Create team', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'team.create'));
  assert(await called("call.action === 'team.create' && call.input.name === 'Launch' && call.input.members.join() === 'ses_alice'"), 'Solo team form proposal is wrong');
  assert(await page.getByRole('dialog').count() === 0, 'Team form stayed open');
  checks.push('New team form allows the creator to start alone');

  await section('Expand Launch');
  const launchMembers = page.getByRole('group', { name: 'Members of Launch', exact: true });
  await launchMembers.getByRole('button', { name: 'Add sessions', exact: true }).click();
  const addSessions = page.getByRole('dialog', { name: 'Add sessions to Launch', exact: true });
  await addSessions.getByRole('switch', { name: 'Carol', exact: true }).waitFor();
  assert(await addSessions.getByRole('textbox', { name: 'Team name', exact: true }).count() === 0, 'Add sessions still opens full team management');
  assert(await addSessions.getByRole('switch', { name: 'Alice', exact: true }).count() === 0, 'Existing member appears in Add sessions');
  assert(await addSessions.getByRole('switch', { name: 'Dana', exact: true }).count() === 0, 'Unregistered session offered in Add sessions');
  await addSessions.getByRole('switch', { name: 'Carol', exact: true }).check();
  await addSessions.getByRole('button', { name: 'Add sessions', exact: true }).click();
  await page.waitForFunction(() => window.fixture.state.teams.find(team => team.name === 'Launch').members.includes('ses_carol'));
  assert(await called("call.userTeam && call.input.name === 'Launch' && call.input.members.join() === 'ses_alice,ses_carol'"), 'Add-only picker did not preserve existing members');
  await manageTeam('Launch');
  const manageLaunch = page.getByRole('dialog', { name: 'Manage team: Launch', exact: true });
  await manageLaunch.getByRole('switch', { name: 'Carol', exact: true }).uncheck();
  await manageLaunch.getByRole('button', { name: 'Save team', exact: true }).click();
  await page.waitForFunction(() => window.fixture.state.teams.find(team => team.name === 'Launch').members.join() === 'ses_alice');
  checks.push('Add sessions is an add-only picker excluding existing and unregistered members; Manage team handles removal');

  // Keep Release review's history and Launch for the subsequent navigation checks.
  await page.evaluate(() => { window.fixture.state.teams.push({ id: 'team_disposable', name: 'Disposable', members: ['ses_alice'] }); window.fixture.state.revision++; });
  await nextSnapshot();
  await teamMenu('Disposable');
  assert((await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim()).join() === 'Manage team,Add sessions,Delete team',
    'Team menu does not offer Manage team, Add sessions and Delete team');
  assert(await page.getByRole('menuitem', { name: 'Delete team', exact: true }).evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  }), 'A later row paints over the team menu');
  await page.screenshot({ path: 'output/playwright/teams-menu.png', fullPage: true });
  await page.getByRole('menuitem', { name: 'Delete team' }).click();
  const deleteTeam = page.getByRole('dialog', { name: 'Delete Disposable?', exact: true });
  await deleteTeam.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(!await called("call.action === 'team.delete'"), 'Cancelled confirmation deleted the team');
  await teamMenu('Disposable');
  await page.getByRole('menuitem', { name: 'Delete team' }).click();
  await deleteTeam.getByRole('button', { name: 'Delete team', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'team.delete'));
  assert(await called("call.confirm === 'Delete Disposable?'"), 'Team deletion was not confirmed');
  checks.push('Manual team deletion asks for confirmation and uses the authenticated user API');

  // A right-click on a team or member row opens that row's own menu.
  await page.locator('[data-team-id="team_review"] .teams-team-header .teams-title').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage team', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manage team: Release review', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await releaseMembers.locator('.teams-member-entry').first().locator('.teams-title').click({ button: 'right' });
  assert(await page.getByRole('menuitem').count() === 1 && await page.getByRole('menuitem', { name: 'Edit name and role', exact: true }).count() === 1,
    'Right-click on a member did not open its menu');
  const pointer = await releaseMembers.locator('.teams-member-entry').first().locator('.teams-title').boundingBox();
  const opened = await page.getByRole('menu').boundingBox();
  assert(Math.abs(opened.x - (pointer.x + pointer.width / 2)) < 12 && opened.y - (pointer.y + pointer.height / 2) >= 0 &&
    opened.y - (pointer.y + pointer.height / 2) < 12, 'Right-click menu did not open at the pointer');
  await page.mouse.click(1, 1);
  checks.push('Right-click on a team or member row opens its menu');

  await section('Connections');
  await section('Connect');
  const connectionForm = page.getByRole('dialog', { name: 'Connect sessions', exact: true });
  assert((await connectionForm.boundingBox()).height >= 590, 'Connections did not use the taller native dialog size');
  await connectionForm.getByRole('button', { name: 'Cancel', exact: true }).click();
  for (const label of ['Connect', 'Extend', 'Close']) assert(await button(label).evaluate(element =>
    getComputedStyle(element).fontSize === getComputedStyle(element.closest('.teams-dashboard')).fontSize), `${label} still uses undersized typography`);
  assert((await text()).includes('Alice ↔ Carol'), 'Connection members missing');
  assert((await text()).includes('Temporary connection · ends in 42 min'), 'Connection label or end time missing');
  assert((await text()).includes('Alice ↔ Dana'), 'Closed connection with an unlisted member missing');
  await section('Close');
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'connection.close'));
  assert(await called("call.action === 'connection.close' && call.input.id === 'connection_question'"), 'Close proposal missing');
  checks.push('Connections show members and end times, and close through the shared proposal');

  await section('Messages');
  await chooseHistory('Release review');
  await page.getByText('Found the cursor bug.', { exact: false }).waitFor();
  const messages = await text();
  assert(['Sent', 'Delivered'].every(label => messages.includes(label)), 'Status labels missing');
  assert(!/\baccepted\b|\buncertain\b/.test(messages), 'Raw status codes shown');
  await button('Open recipient').first().click();
  assert(await called("call.navigation?.id === 'ses_bob'"), 'Recipient navigation missing');
  checks.push('Messages show readable statuses and open the recipient');

  // A new computation per read would log here: reading a conditional JSX prop outside a root caused exactly this.
  const rootWarnings = [];
  const onConsole = message => { if (message.text().includes('outside a `createRoot`')) rootWarnings.push(message.text()); };
  page.on('console', onConsole);
  const messageRow = name => page.locator('.teams-row.teams-top').filter({ hasText: name });
  const carolMessage = messageRow('Carol → Alice'), carolMain = carolMessage.locator('.teams-main');
  const isExpanded = async () => await carolMain.getAttribute('aria-expanded') === 'true';
  await page.waitForFunction(() => document.querySelectorAll('.teams-message-expandable').length === 1);
  assert(await messageRow('Alice → Bob').evaluate(element => !element.classList.contains('teams-message-expandable') && !element.querySelector('[role=button]')), 'A short message offers expansion with nothing to reveal');
  assert(await carolMessage.evaluate(element => getComputedStyle(element).cursor) === 'pointer', 'Expandable message card has no pointer');
  assert(await carolMessage.locator('[data-icon*="chevron"]').count() === 0, 'Message card shows a chevron');
  const collapsedHeight = await carolMessage.evaluate(element => element.getBoundingClientRect().height);
  await carolMessage.click({ position: { x: 300, y: 40 } });
  assert(await isExpanded() && await carolMessage.locator('p').evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'Clicking the card did not reveal the whole message');
  assert(await carolMessage.evaluate(element => element.getBoundingClientRect().height) > collapsedHeight, 'Expanded card did not grow');
  await carolMessage.locator('p').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); getSelection().removeAllRanges(); getSelection().addRange(range); });
  await carolMessage.dispatchEvent('click');
  assert(await isExpanded(), 'Finishing a text selection collapsed the message');
  await page.evaluate(() => getSelection().removeAllRanges());
  await carolMessage.hover();
  await carolMessage.getByRole('button', { name: 'Open recipient', exact: true }).click();
  assert(await isExpanded() && await called("call.navigation?.id === 'ses_alice'"), 'Open recipient toggled the card or did not navigate');
  await nextSnapshot();
  assert(await isExpanded(), 'Automatic refresh collapsed the message');
  await section('Activity');
  await section('Messages');
  await page.waitForFunction(() => document.querySelectorAll('.teams-message-expandable').length === 1);
  assert(await isExpanded(), 'Changing tabs collapsed the message');
  await carolMessage.click({ position: { x: 300, y: 12 } });
  assert(!await isExpanded() && await carolMessage.evaluate(element => element.getBoundingClientRect().height) === collapsedHeight, 'Clicking again did not contract the card');
  await carolMain.focus();
  const carolFocused = await carolMain.evaluate(element => element === document.activeElement || element.contains(document.activeElement));
  await page.keyboard.press('Enter');
  for (let wait = 0; wait < 20 && !await isExpanded(); wait++) await page.waitForTimeout(50);
  assert(await isExpanded(), `Enter did not expand the message (focused: ${carolFocused}, active: ${await page.evaluate(() => document.activeElement?.className)})`);
  await page.keyboard.press(' ');
  assert(!await isExpanded(), 'Space did not contract the message');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Message expansion overflows');
  await page.waitForTimeout(100);
  page.off('console', onConsole);
  assert(rootWarnings.length === 0, `Message rows create undisposed computations: ${rootWarnings.length}`);
  checks.push('Messages expand and contract on a card click without a chevron, keep selection and actions, and survive refresh and tab changes');

  await section('Activity');
  await chooseHistory('Release review');
  await page.getByText('Alice created team Release review', { exact: true }).waitFor();
  const activity = await text();
  assert(activity.includes('Alice created team Release review'), 'Activity sentence missing');
  assert(activity.includes('You approved: team creation, membership, cross-project'), 'Approval detail missing');
  assert(!activity.includes('team.create') && !activity.includes('ses_alice'), 'Raw activity codes shown');
  checks.push('Activity reads as sentences without raw codes');

  await section('Leave list');
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'discovery.unregister'));
  await section('Join list');
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'discovery.register' && call.sessionID === 'ses_alice'));
  checks.push('Current session can join and leave the list');

  await section('More actions');
  await page.getByRole('menuitem', { name: 'Agent Teams settings' }).click();
  assert(await called("call.settings === 'collaboration'"), 'Settings link missing');
  assert(await page.getByRole('switch').count() === 7, 'Dashboard settings link does not open the settings preview');
  await preview.getByRole('button', { name: 'Dashboard', exact: true }).click();
  checks.push('Header menu opens the settings page');

  await section('Agents');
  assert(await page.getByRole('searchbox', { name: 'Search agents', exact: true }).evaluate(element => {
    const search = element.getBoundingClientRect(), row = document.querySelector('.teams-agent-entry').getBoundingClientRect();
    return Math.abs(search.left - row.left) < 2 && Math.abs(search.right - row.right) < 2;
  }), 'Agent search does not align with the full row highlight');
  await page.locator('.teams-agent-entry', { hasText: 'Bob' }).locator('.teams-title').click({ button: 'right' });
  assert((await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim()).join() === 'Add to team,Edit name and role',
    'Right-click on an agent did not open its menu');
  await page.getByRole('menuitem', { name: 'Add to team', exact: true }).click();
  const addTeam = page.getByRole('dialog', { name: 'Add Bob to a team', exact: true });
  await addTeam.getByRole('option', { name: 'Launch', exact: true }).click();
  await page.waitForFunction(() => window.fixture.state.teams.find(team => team.name === 'Launch').members.includes('ses_bob'));
  assert(await called("call.userTeam && call.action === 'team.update' && call.input.name === 'Launch' && call.input.members.join() === 'ses_alice,ses_bob'"), 'Agent Add to team did not preserve existing members');
  assert(await page.getByRole('img', { name: 'Needs approval', exact: true }).count() >= 1 &&
    await page.getByRole('img', { name: 'Needs input', exact: true }).count() >= 1, 'Agent page uses different attention indicators');
  await page.evaluate(() => { window.fixture.setAttention('ses_bob', false, false, 'idle'); window.fixture.setAttention('ses_carol', false, false, 'idle'); });
  checks.push('Agents offer Add to team and share the team attention indicators');
  assert(await button('Open session').count() === 0, 'Redundant Open session action remains');
  const first = agentTiles().first();
  await first.click();
  assert(await called("call.navigation?.id === 'ses_alice'"), 'Clicking an agent tile did not navigate');
  assert(await first.evaluate(element => Math.abs(element.getBoundingClientRect().width - element.parentElement.getBoundingClientRect().width) < 2), 'Agent tile highlight stops before its actions');
  await first.focus();
  const focused = await first.elementHandle();
  const commandUpdates = await page.evaluate(() => window.fixture.commandUpdates);
  let before = await snapshots();
  await page.waitForTimeout(5500);
  assert(await snapshots() > before, 'Visible panel did not refresh');
  assert(await page.evaluate(() => window.fixture.commandUpdates) === commandUpdates, 'Polling registered the global command again');
  checks.push('Settings polling keeps global command registration stable');
  assert(await focused.evaluate(element => element === document.activeElement && element.isConnected), 'Polling replaced the focused control');
  checks.push('Five-second refresh preserves keyboard focus');
  await page.evaluate(() => window.fixture.closePanel());
  before = await snapshots();
  await page.waitForTimeout(5500);
  assert(await snapshots() === before, 'Hidden panel kept polling');
  await page.evaluate(() => window.fixture.menus.find(item => item.id === 'teams').run());
  await page.waitForFunction(count => window.fixture.calls.filter(call => call.snapshot).length > count, before);
  checks.push('Refresh pauses while the tab is hidden and resumes when shown');

  await page.evaluate(() => window.fixture.emit('session.inbox.enqueued', { data: { sessionID: 'ses_bob',
    item: { id: 'msg_notice', type: 'synthetic', payload: { metadata: { agentTeamsForOpencode: { id: 'msg_notice', senderName: 'Alice', recipientName: 'Bob' } } } } } }));
  assert(await called("call.toast?.title === 'Alice sent Bob a message'"), 'Readable message toast missing');
  assert(await called("call.notification?.session.id === 'ses_bob'"), 'Notification missing');
  checks.push('Message notifications name the sender and recipient');

  await page.evaluate(() => {
    window.fixture.originalAgents = window.fixture.state.agents;
    window.fixture.state.agents = Array.from({ length: 151 }, (_, index) => ({
      ...window.fixture.originalAgents[1], sessionID: `ses_page_${index}`, name: `Page agent ${index}`,
    }));
  });
  await nextSnapshot();
  await page.waitForFunction(() => document.querySelectorAll('.teams-agent-entry > .teams-peer-tile').length === 50);
  assert((await text()).includes('1–50 of 151'), 'Page range missing');
  await section('Next agents');
  assert((await text()).includes('Page agent 50'), 'Next agent page missing');
  assert(!(await text()).includes('Page agent 0\n'), 'Previous page retained');
  checks.push('Agent pages render at most 50 sessions');
  await page.getByRole('searchbox', { name: 'Search agents', exact: true }).fill('ses_page_150');
  assert(await agentTiles().count() === 1, 'Search did not filter all agents');
  assert((await text()).includes('Page agent 150'), 'Search omitted another page');
  assert(await button('Next agents').count() === 0, 'Paging shown for one result');
  checks.push('Agent search includes sessions outside the current page');
  await page.evaluate(() => { window.fixture.state.agents = window.fixture.originalAgents; delete window.fixture.originalAgents; });
  await page.getByRole('searchbox', { name: 'Search agents', exact: true }).fill('');
  await nextSnapshot();
  await page.waitForFunction(() => document.querySelectorAll('.teams-agent-entry > .teams-peer-tile').length === 3);
  await section('Teams');
  await page.screenshot({ path: 'output/playwright/teams-desktop.png', fullPage: true });
  await section('Messages');
  await page.screenshot({ path: 'output/playwright/messages-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Narrow panel overflows');
  await section('Agents');
  await page.screenshot({ path: 'output/playwright/agents-narrow.png', fullPage: true });
  checks.push('Dashboard fits a 390-pixel panel');
  await page.setViewportSize({ width: 1280, height: 900 });

  const snapshotCount = await snapshots();
  await page.evaluate(() => window.fixture.showSettings());
  assert(await page.getByRole('navigation', { name: 'Agent Teams sections', exact: true }).count() === 0, 'Settings contains the dashboard menu');
  assert(await button('New team').count() === 0, 'Settings contains team actions');
  assert(await page.getByRole('switch').count() === 7, 'Discovery and approval switches missing');
  await page.waitForFunction(() => window.fixture.commands.find(item => item.id === 'dashboard')?.slash.name === 'team');
  const command = page.getByRole('textbox', { name: 'Slash command name', exact: true });
  assert(await button('Save').isDisabled(), 'Unchanged command can be saved');
  await command.fill('/Squad');
  await section('Save');
  await page.waitForFunction(() => window.fixture.commands.find(item => item.id === 'dashboard')?.slash.name === 'squad');
  await command.fill('two words');
  await section('Save');
  assert((await page.getByRole('alert').innerText()).includes('Use 1-32'), 'Invalid command error missing');
  assert(await page.evaluate(() => window.fixture.commands.find(item => item.id === 'dashboard').slash.name === 'squad'), 'Invalid command changed saved setting');
  await command.fill('team');
  await section('Save');
  await page.waitForFunction(() => window.fixture.commands.find(item => item.id === 'dashboard')?.slash.name === 'team');
  checks.push('Slash command setting updates registration and rejects invalid names');
  assert(await page.getByRole('heading', { name: 'Agent permissions', exact: true }).count() === 1 &&
    await page.getByText('An agent may do the following without asking for permission:', { exact: true }).count() === 1 &&
    await page.getByRole('heading', { name: 'Ask me before an agent…' }).count() === 0, 'Capability heading is not phrased positively');
  assert(await page.evaluate(() => {
    const head = document.querySelector('.teams-group-head'), b = element => element.getBoundingClientRect();
    const titleToLead = b(head.querySelector('p')).top - b(head.querySelector('h3')).bottom;
    const leadToCard = b(head.nextElementSibling).top - b(head.querySelector('p')).bottom;
    const discovery = b(document.querySelector('[data-action=discovery] .teams-card')).top - b(document.querySelector('[data-action=discovery] h3')).bottom;
    return Math.abs(titleToLead - 4) < 1 && Math.abs(leadToCard - discovery) < 1;
  }), 'Agent permissions title, lead line and card are not evenly spaced');
  const allowSession = page.getByRole('switch', { name: 'An agent may create a session without asking', exact: true });
  assert(!await allowSession.isChecked(), 'Default ask shown as allowed');
  await allowSession.check();
  await page.waitForFunction(() => window.fixture.state.capabilities.createSession === 'allow');
  assert(await called("call.configure?.capabilities?.createSession === 'allow'"), 'On did not save allow');
  await allowSession.uncheck();
  await page.waitForFunction(() => window.fixture.state.capabilities.createSession === 'ask');
  // An approved agent request can set deny; the settings poll shows it without enumerating sessions.
  await page.evaluate(() => { window.fixture.state.capabilities.openConnection = 'deny'; });
  await page.getByText('Currently blocked. Turn on to allow without asking.').waitFor({ timeout: 8000 });
  const allowConnection = page.getByRole('switch', { name: 'An agent may open a connection without asking', exact: true });
  assert(!await allowConnection.isChecked(), 'Denied capability shown as allowed');
  await allowConnection.check();
  await page.waitForFunction(() => window.fixture.state.capabilities.openConnection === 'allow');
  await allowConnection.uncheck();
  await page.waitForFunction(() => window.fixture.state.capabilities.openConnection === 'ask');
  checks.push('Agent permissions switches ("An agent may do the following without asking for permission:") save allow when on and ask when off; blocked rows are labelled');
  await page.getByRole('switch', { name: 'List sessions automatically', exact: true }).check();
  await page.waitForFunction(() => window.fixture.state.discovery.mode === 'automatic');
  assert(await called("call.configure?.discoveryMode === 'automatic'"), 'User discovery setting missing');
  assert(await snapshots() === snapshotCount, 'Settings enumerated session records');
  await page.screenshot({ path: 'output/playwright/settings-desktop.png', fullPage: true });
  checks.push('Settings shows only settings and saves every setting without an open session');
  await page.evaluate(() => window.fixture.showDashboard());
  await page.waitForFunction(() => document.querySelector('main').innerText.includes('Listed automatically'));
  assert(await button('Join list').count() === 0 && await button('Leave list').count() === 0, 'Join control shown in automatic mode');
  checks.push('Join and leave are hidden while sessions are listed automatically');

  await section('More actions');
  await page.getByRole('menuitem', { name: 'Edit my name and role', exact: true }).click();
  const profile = page.getByRole('dialog', { name: 'Edit my name and role', exact: true });
  assert(await profile.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Alice', 'Existing name was not prefilled');
  assert(await profile.getByRole('textbox', { name: 'Role', exact: true }).inputValue() === 'Developer', 'Existing role was not prefilled');
  assert(await profile.getByRole('textbox').count() === 2, 'Profile fields are not shown together');
  await profile.getByRole('textbox', { name: 'Name', exact: true }).fill('Discarded edit');
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(!await called("call.action === 'profile.update'"), 'Cancelling saved a profile change');
  await section('More actions');
  await page.getByRole('menuitem', { name: 'Edit my name and role', exact: true }).click();
  assert(await profile.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Alice', 'Cancelled profile draft was retained');
  await profile.getByRole('textbox', { name: 'Name', exact: true }).fill('Alex');
  await profile.getByRole('textbox', { name: 'Role', exact: true }).fill('Lead');
  await profile.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'profile.update'));
  assert(await called("call.action === 'profile.update' && call.input.name === 'Alex' && call.input.role === 'Lead' && Object.keys(call.input).length === 2"), 'Profile form payload is wrong');
  await section('More actions');
  await page.getByRole('menuitem', { name: 'Edit my name and role', exact: true }).click();
  assert(await profile.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Alex', 'Saved name is not prefilled when reopened');
  assert(await profile.getByRole('textbox', { name: 'Role', exact: true }).inputValue() === 'Lead', 'Saved role is not prefilled when reopened');
  await profile.getByRole('button', { name: 'Cancel', exact: true }).click();
  checks.push('Profile form shows both current values, cancels safely and prefills saved edits');

  await section('More actions');
  await page.getByRole('menuitem', { name: 'New agent session', exact: true }).click();
  const agent = page.getByRole('dialog', { name: 'New agent session', exact: true });
  assert((await agent.boundingBox()).height >= 590, 'New agent did not use the taller native dialog size');
  assert(await agent.getByRole('textbox').count() === 2, 'New-agent form still requires typed project, agent or model IDs');
  await agent.getByRole('button', { name: 'Engine', exact: true }).waitFor();
  assert(await agent.getByRole('button', { name: 'Build', exact: true }).isVisible(), 'New-agent default missing');
  const currentModel = agent.getByRole('button', { name: 'Fixture Model · Fixture Provider', exact: true });
  await currentModel.waitFor({ state: 'visible' });
  assert(await agent.getByRole('button', { name: 'deep', exact: true }).isVisible(), 'Composer variant was not copied');
  assert(await agent.getByRole('button', { name: 'No team', exact: true }).isVisible(), 'Team is not visible with other fields');
  await page.screenshot({ path: 'output/playwright/new-agent-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await agent.evaluate(element => element.scrollWidth <= element.clientWidth), 'New-agent form overflows a narrow dialog');
  assert(await agent.evaluate(element => element.getBoundingClientRect().width <= innerWidth - 32), 'Taller preview dialog exceeds the narrow viewport');
  await page.evaluate(() => window.fixture.setCatalog(window.fixture.models.map(model => model.id === 'fixture-model'
    ? { ...model, name: 'A very long model name that must remain on one line and truncate with an ellipsis' } : model)));
  assert(await agent.locator('.teams-picker-label').evaluate(element => {
    const style = getComputedStyle(element);
    return style.whiteSpace === 'nowrap' && style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth && Boolean(element.title);
  }), 'Long model names wrap, overflow or lose their full-name tooltip');
  await page.evaluate(() => window.fixture.setCatalog(window.fixture.models));
  await page.screenshot({ path: 'output/playwright/new-agent-narrow.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await agent.getByRole('textbox', { name: 'Name', exact: true }).fill('Discarded agent');
  await agent.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(!await called("call.action === 'session.create'"), 'Cancelling created a session');
  await section('More actions');
  await page.getByRole('menuitem', { name: 'New agent session', exact: true }).click();
  await agent.getByRole('textbox', { name: 'Name', exact: true }).fill('Teammate');
  await agent.getByRole('textbox', { name: 'Role', exact: true }).fill('Reviewer');
  await agent.getByRole('button', { name: 'Engine', exact: true }).click();
  const projectPicker = page.getByRole('dialog', { name: 'Choose project', exact: true });
  assert(await projectPicker.getByRole('option').count() === 3, 'Native projects or worktrees missing');
  assert(await projectPicker.getByRole('option').first().evaluate(element => {
    const style = getComputedStyle(element);
    return style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'rgba(255, 255, 255, 0.043)';
  }), 'Preview picker uses an unstyled browser-default option button');
  assert(await projectPicker.getByRole('option').first().evaluate(element =>
    element.getBoundingClientRect().width >= element.closest('[role="listbox"]').getBoundingClientRect().width - 16), 'Picker options do not fill the list width');
  await projectPicker.getByRole('textbox').fill('Engine-review');
  await projectPicker.getByRole('option', { name: /Engine-review/ }).click();
  await agent.getByRole('button', { name: 'Engine · Engine-review', exact: true }).click();
  await projectPicker.getByRole('option', { name: /C:\/Projects\/Engine$/, exact: false }).click();
  await agent.getByRole('button', { name: 'Build', exact: true }).click();
  const agentPicker = page.getByRole('dialog', { name: 'Choose OpenCode agent', exact: true });
  assert(await agentPicker.getByRole('option').count() === 2, 'Hidden or subagent-only configurations offered');
  await agentPicker.getByRole('option', { name: /Reviewer/ }).click();
  assert(await agent.getByRole('button', { name: 'Reviewer', exact: true }).isVisible(), 'Agent dropdown did not update');
  checks.push('New-agent project and OpenCode agent selectors use native catalog names, worktrees and valid primary agent IDs');
  await currentModel.click();
  const picker = page.getByRole('dialog', { name: 'Choose model', exact: true });
  assert(await picker.getByRole('option').count() === 2, 'Picker includes disabled or non-chat models, or omits enabled models');
  assert(await picker.getByRole('group', { name: 'Fixture Provider', exact: true }).count() === 1 &&
    await picker.getByRole('group', { name: 'Other Provider', exact: true }).count() === 1, 'Models are not grouped by provider');
  assert(await picker.getByRole('option', { name: /Fixture Model/ }).getAttribute('aria-selected') === 'true', 'Current model is not highlighted');
  await picker.getByRole('textbox').fill('other-provider');
  assert(await picker.getByRole('option').count() === 1, 'Model picker cannot search provider IDs');
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(await currentModel.isVisible() && await agent.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Teammate', 'Picker cancellation lost form values');
  await currentModel.click();
  await picker.getByRole('textbox').fill('Other Model');
  await picker.getByRole('option', { name: /Other Model/ }).click();
  assert(await agent.getByRole('button', { name: 'Default variant', exact: true }).isVisible(), 'Switching model did not reset variant');
  await agent.getByRole('button', { name: 'Default variant', exact: true }).click();
  await agent.getByRole('menuitem', { name: 'high', exact: true }).click();
  await agent.getByRole('button', { name: 'Other Model · Other Provider', exact: true }).click();
  await picker.getByRole('option', { name: /Fixture Model/ }).click();
  await agent.getByRole('button', { name: 'Default variant', exact: true }).click();
  await agent.getByRole('menuitem', { name: 'fast', exact: true }).click();
  checks.push('Model picker searches enabled chat models across provider groups and resets incompatible variants');
  await agent.getByRole('button', { name: 'No team', exact: true }).click();
  assert(await agent.getByRole('menuitem', { name: 'Docs pass', exact: true }).count() === 0, 'New-agent form offers a team outside membership');
  await agent.getByRole('menuitem', { name: 'Launch', exact: true }).click();
  await agent.getByRole('button', { name: 'Create agent', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'session.create'));
  assert(await called("call.action === 'session.create' && call.input.name === 'Teammate' && call.input.role === 'Reviewer' && call.input.directory === 'C:/Projects/Engine' && call.input.agent === 'review' && call.input.model.providerID === 'fixture-provider' && call.input.model.id === 'fixture-model' && call.input.model.variant === 'fast' && call.input.teamID === 'team_2' && !('providerID' in call.input)"), 'New-agent form payload is wrong');
  checks.push('New-agent form shows all settings, cancels safely and submits an explicit model and team');

  await section('More actions');
  await page.getByRole('menuitem', { name: 'New agent session', exact: true }).click();
  await agent.getByRole('textbox', { name: 'Name', exact: true }).fill('Alias teammate');
  await agent.getByRole('textbox', { name: 'Role', exact: true }).fill('Reviewer');
  await currentModel.click();
  await picker.getByRole('option', { name: /Other Model/ }).click();
  await page.evaluate(() => window.fixture.setCatalog(window.fixture.models.filter(model => model.id !== 'other-model')));
  assert(await agent.getByRole('button', { name: 'Create agent', exact: true }).isDisabled(), 'A disabled or removed model can be submitted');
  await page.evaluate(() => window.fixture.setCatalog(window.fixture.models));
  await agent.getByRole('button', { name: 'Create agent', exact: true }).click();
  await page.waitForFunction(() => window.fixture.calls.some(call => call.action === 'session.create' && call.input.name === 'Alias teammate'));
  assert(await called("call.action === 'session.create' && call.input.name === 'Alias teammate' && call.input.model.id === 'other-model' && call.input.model.providerID === 'other-provider' && !('variant' in call.input.model) && !('teamID' in call.input)"), 'Model alias ID or default variant/team payload is wrong');
  assert(!await called('call.composerSetModel'), 'Choosing a teammate model changed the composer');
  checks.push('Model selection revalidates enabled models, preserves alias IDs and never changes the composer');

  await page.evaluate(() => window.fixture.setCatalog([]));
  await section('More actions');
  await page.getByRole('menuitem', { name: 'New agent session', exact: true }).click();
  await agent.getByText(/No available chat models/).waitFor();
  assert(await agent.getByRole('button', { name: 'Choose model', exact: true }).isDisabled(), 'Empty catalog allows selection');
  assert(await agent.getByRole('button', { name: 'Create agent', exact: true }).isDisabled(), 'Empty catalog allows creation');
  await agent.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => { window.fixture.setCatalog(window.fixture.models); window.fixture.failCatalog(true); });
  await section('More actions');
  await page.getByRole('menuitem', { name: 'New agent session', exact: true }).click();
  await agent.getByRole('alert').waitFor();
  assert(await agent.getByRole('button', { name: 'Create agent', exact: true }).isDisabled(), 'Catalog failure allows creation');
  await page.evaluate(() => window.fixture.failCatalog(false));
  await agent.getByRole('button', { name: 'Retry models', exact: true }).click();
  await currentModel.waitFor({ state: 'visible' });
  assert(await currentModel.isEnabled(), 'Catalog retry did not recover');
  await page.keyboard.press('Escape');
  await agent.waitFor({ state: 'hidden' });
  assert(await page.evaluate(() => window.fixture.calls.filter(call => call.action === 'session.create').length) === 2, 'Escape or retry created an extra session');
  checks.push('Empty and failed model catalogs block creation, support retry and cancel safely with Escape');
  return { passed: checks.length, checks };
}
