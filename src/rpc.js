// @ts-check
import { Rpc } from '@opencode/plugin/rpc';

export const Collaboration = Rpc.define(/** @type {const} */ ({
  id: 'agent-teams-for-opencode',
  methods: {
    settings: { input: { type: 'object', additionalProperties: false }, output: {} },
    configure: { input: { type: 'object', properties: { command: { type: 'string' },
      discoveryMode: { type: 'string', enum: ['registered', 'automatic'] }, capabilities: { type: 'object' } },
      minProperties: 1, maxProperties: 1, additionalProperties: false }, output: {} },
    snapshot: { input: { type: 'object', properties: { sessionID: { type: 'string' }, scope: { type: 'string' }, limit: { type: 'integer', minimum: 1 } },
      additionalProperties: false }, output: {} },
    removeData: { input: { type: 'object', properties: { confirm: { type: 'string', enum: ['remove-all-saved-data'] } },
      required: ['confirm'], additionalProperties: false }, output: {} },
    teamCandidates: { input: { type: 'object', properties: { query: { type: 'string', maxLength: 240 },
      page: { type: 'integer', minimum: 0 }, exclude: { type: 'array', items: { type: 'string' }, maxItems: 32 } }, additionalProperties: false }, output: {} },
    teamManage: { input: { type: 'object', properties: { action: { type: 'string', enum: ['team.create', 'team.update', 'team.delete'] },
      input: { type: 'object' }, revision: { type: 'integer', minimum: 0 } },
        required: ['action', 'input', 'revision'], additionalProperties: false }, output: {} },
    profileManage: { input: { type: 'object', properties: { sessionID: { type: 'string' },
      input: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' } },
        required: ['name', 'role'], additionalProperties: false }, revision: { type: 'integer', minimum: 0 } },
      required: ['sessionID', 'input', 'revision'], additionalProperties: false }, output: {} },
    manage: { input: { type: 'object', properties: {
      sessionID: { type: 'string' }, action: { type: 'string' }, input: { type: 'object' },
    }, required: ['sessionID', 'action', 'input'], additionalProperties: false }, output: {} },
  },
  events: {},
}));
