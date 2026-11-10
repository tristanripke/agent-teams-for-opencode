import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAPABILITY, activity, ends, errorText, folder, modelDisplay, nameOf, status, plain } from '../src/format.js';

const state = { agents: [{ sessionID: 'ses_alice', name: 'Alice' }], people: { ses_bob: { sessionID: 'ses_bob', name: 'Bob' } },
  teams: [{ id: 'team_a', name: 'Release review', members: ['ses_alice', 'ses_bob'] }],
  messages: [{ id: 'msg_a', from: 'ses_alice', to: 'ses_bob' }] };

test('engine codes become readable errors and unknown messages pass through', () => {
  assert.match(errorText(new Error('state_changed_request_again')), /changed while this waited/);
  assert.match(errorText(new Error('RPC failed: team_not_found')), /not one of its members/);
  assert.equal(errorText(new Error('Use 1-32 letters')), 'Use 1-32 letters');
});

test('names prefer listed agents, then unlisted members, then a short ID', () => {
  assert.equal(nameOf(state, 'ses_alice'), 'Alice');
  assert.equal(nameOf(state, 'ses_bob'), 'Bob');
  assert.equal(nameOf(state, 'ses_abcdef123456'), 'Session …123456');
  assert.equal(nameOf(state, 'user'), 'You');
});

test('status labels keep the four delivery states distinct', () => {
  assert.deepEqual(['accepted', 'delivered', 'processed', 'uncertain'].map(value => status(value).label),
    ['Sent', 'Delivered', 'Handled', 'Unconfirmed']);
});

test('activity reads as sentences with approval details', () => {
  assert.deepEqual(activity({ actor: 'ses_alice', action: 'team.create', data: { proposal: { name: 'Release review' },
    approvalCategories: ['createTeam', 'workAcrossProjects'] } }, state),
  { text: 'Alice created team Release review', detail: 'You approved: team creation, cross-project' });
  assert.equal(activity({ actor: 'ses_alice', action: 'message.admission', data: { id: 'msg_a', status: 'accepted' } }, state).text,
    'Alice sent Bob a message');
  assert.equal(activity({ actor: 'user', action: 'settings.update', data: { proposal: { capabilities: { createTeam: 'allow', openConnection: 'ask', changeMembers: 'deny' } } } }, state).detail,
    'Create a team: allowed without asking; Open a connection: asks you first; Change team members: blocked');
  assert.equal(activity({ actor: 'ses_alice', action: 'team.create', data: { proposal: { name: 'New' },
    approvalCategories: ['createTeam', 'workAcrossProjects'] } }, state).detail, 'You approved: team creation, cross-project');
  assert.equal(activity({ actor: 'ses_alice', action: 'profile.update', data: { proposal: { role: 'Lead' }, profile: { name: 'Alice', role: 'Lead' } } }, state).text,
    'Alice set its name to Alice (Lead)');
});
test('cancelled session creation is readable and does not imply a session was created', () => {
  assert.equal(activity({ actor: 'ses_alice', action: 'session.create.cancelled', data: { id: 'ses_child' } }, state).text,
    'Alice cancelled session creation before it started');
});
test('automatic removal of a deleted session reads as a sentence and claims no approval', () => {
  assert.deepEqual(activity({ actor: 'system', action: 'team.member.removed',
    data: { teamID: 'team_gone', teamName: 'Old team', sessionID: 'ses_abcdef123456', name: 'Dana' } }, state),
  { text: 'Dana was removed from Old team because its session was deleted', detail: '' });
  assert.equal(activity({ actor: 'system', action: 'team.member.removed',
    data: { teamID: 'team_gone', teamName: 'Old team', sessionID: 'ses_abcdef123456' } }, state).text,
  'Session …123456 was removed from Old team because its session was deleted');
  assert.deepEqual(activity({ actor: 'system', action: 'team.removed', data: { teamID: 'team_gone', teamName: 'Old team' } }, state),
    { text: "Old team was deleted because its last member's session was deleted", detail: '' });
});
test('human profile changes name the actual edited member in activity', () => {
  assert.equal(activity({ actor: 'user', action: 'profile.update', data: { sessionID: 'ses_bob', previousName: 'Bob',
    proposal: { name: 'Robert', role: 'Reviewer' }, userAction: true } }, state).text,
  "You set Bob's profile to Robert (Reviewer)");
});

test('connection end times and folder names are short', () => {
  assert.equal(ends({ expiresAt: 1000 + 42 * 60000 }, 1000), 'ends in 42 min');
  assert.equal(ends({ closed: true, expiresAt: 0 }, 1000), 'closed');
  assert.equal(folder('C:/Projects/Engine/'), 'Engine');
});
test('member model labels use the exact provider and alias id with the selected variant', () => {
  const catalog = [
    { id: 'review', modelID: 'upstream-review', providerID: 'other', name: 'Wrong provider' },
    { id: 'upstream-review', providerID: 'chosen', name: 'Wrong alias' },
    { id: 'review', modelID: 'upstream-review', providerID: 'chosen', name: 'Review Model', enabled: false },
  ];
  assert.deepEqual(modelDisplay({ id: 'review', providerID: 'chosen', variant: 'high' }, catalog),
    { label: 'Review Model · high', title: 'Review Model · chosen/review · high' });
});
test('member models retain real ids when catalogs are absent and omit unset variants', () => {
  assert.deepEqual(modelDisplay({ id: 'custom-model', providerID: 'provider' }),
    { label: 'custom-model', title: 'custom-model · provider/custom-model' });
});
test('missing member models are not replaced with another model or a catalog default', () => {
  const catalog = [{ id: 'default-model', providerID: 'default-provider', name: 'Default' }];
  assert.equal(modelDisplay(undefined, catalog).label, 'Model unavailable');
  assert.equal(modelDisplay({ id: 'incomplete' }, catalog).label, 'Model unavailable');
});

test('README and configuration reference use the same permission wording as the app', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const reference = await readFile(new URL('../docs/configuration.md', import.meta.url), 'utf8');
  for (const [key, { title, description }] of Object.entries(CAPABILITY)) {
    assert.ok(description, `${key} has no description`);
    assert.ok(readme.includes(`| ${title} | ${description} |`), `README differs for ${key}`);
    assert.ok(reference.includes(`| \`${key}\` | ${description}`), `Configuration reference differs for ${key}`);
  }
});
test('agent text is shown as plain text: no fake lines, reordering or hidden characters', () => {
  assert.equal(plain('Bob\nApproval needed: delete'), 'Bob Approval needed: delete');
  assert.equal(plain('Ali\u202Eecila\u202C'), 'Aliecila');
  assert.equal(plain('Zero\u200Bwidth\u0007'), 'Zerowidth');
  assert.equal(plain('Line one\nLine two\twith a tab\u202E', true), 'Line one\nLine two\twith a tab');
  assert.equal(plain(undefined), '');
});
test('a stored name with hidden characters is cleaned wherever a name is shown', () => {
  const state = { agents: [{ sessionID: 'ses_a', name: 'Eve\nYou approved this' }], people: {} };
  assert.equal(nameOf(state, 'ses_a'), 'Eve You approved this');
  assert.equal(nameOf(state, 'user'), 'You');
});
