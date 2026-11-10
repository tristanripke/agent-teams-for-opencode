// Authenticated user APIs, deliberately separate from peer management and discovery.
import { isLabel, isDisplayName, nameKey } from '../manage-schema.js';
import { GENERAL } from '../history.js';
import { fail, clone, identifier } from './shared.js';
import { identity } from './sessions.js';

const label = isLabel;

export function createUserControls({ uuid, queue, store: { load, save, historyOf, audit }, sessions: { peer } }) {
  async function teamManage(action, input, revision) {
    const proposal = clone(input);
    return queue(async () => {
      const state = await load();
      if (!Number.isSafeInteger(revision) || revision !== state.revision) fail('state_changed_request_again');
      if (!['team.create', 'team.update', 'team.delete'].includes(action) || !proposal || typeof proposal !== 'object' || Array.isArray(proposal))
        fail('invalid_action_input');
      const fields = action === 'team.create' ? ['name', 'members'] : action === 'team.update' ? ['id', 'name', 'members'] : ['id'];
      if (Object.keys(proposal).some(key => !fields.includes(key))) fail('invalid_action_input');
      if (action !== 'team.create' && (!identifier(proposal.id) || !Object.hasOwn(state.teams, proposal.id))) fail('team_not_found');
      if (action !== 'team.delete') {
        if (!label(proposal.name)) fail('invalid_team_name');
        if (Object.values(state.teams).some(team => team.id !== proposal.id && nameKey(team.name) === nameKey(proposal.name))) fail('team_name_exists');
        if (!Array.isArray(proposal.members) || proposal.members.length < 1 || proposal.members.length > 32 ||
          new Set(proposal.members).size !== proposal.members.length) fail('invalid_members');
        const members = await Promise.all(proposal.members.map(peer));
        // Preserve archived existing members, but do not add archived sessions.
        if (members.some(item => item.time?.archived && !state.teams[proposal.id]?.members.includes(item.id))) fail('invalid_session');
        if (state.discovery.mode !== 'automatic' && proposal.members.some(id =>
          !state.teams[proposal.id]?.members.includes(id) && !Object.hasOwn(state.discovery.registrations, id))) fail('member_not_registered');
      }
      let result;
      const teamName = action === 'team.delete' ? state.teams[proposal.id].name : undefined;
      if (action === 'team.delete') { delete state.teams[proposal.id]; historyOf(state).forget(proposal.id); result = { deleted: proposal.id }; }
      else {
        const id = action === 'team.create' ? `team_${uuid()}` : proposal.id;
        result = state.teams[id] = { id, name: proposal.name.trim(), members: proposal.members };
      }
      state.revision++;
      audit(state, 'user', action, { proposal, userAction: true, ...(action === 'team.create' ? { teamID: result.id } : {}),
        ...(teamName ? { teamName } : {}) },
        action === 'team.delete' ? [GENERAL] : undefined);
      await save(state);
      return clone(result);
    });
  }
  async function profileManage(sessionID, input, revision, signal) {
    const proposal = clone(input);
    return queue(async () => {
      if (signal?.aborted) fail('cancelled');
      const state = await load();
      if (!Number.isSafeInteger(revision) || revision !== state.revision) fail('state_changed_request_again');
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) ||
        Object.keys(proposal).some(key => !['name', 'role'].includes(key)) ||
        !isDisplayName(proposal.name) || !label(proposal.role)) fail('invalid_profile');
      const target = await peer(sessionID), previousName = identity(target, state).name;
      if (signal?.aborted) fail('cancelled');
      const result = state.profiles[target.id] = { name: proposal.name.trim(), role: proposal.role.trim() };
      state.revision++;
      audit(state, 'user', 'profile.update', { sessionID: target.id, previousName, proposal: result, userAction: true });
      await save(state);
      return clone(result);
    });
  }
  return { teamManage, profileManage };
}
