const KEY = 'collaboration.ui.v1';
const valid = command => typeof command === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(command) && command !== 'peers';

export function createSettings(storage, queue) {
  return {
    get: () => queue(async () => {
      const value = await storage.get(KEY);
      if (value === undefined) return { command: 'team' };
      if (!value || !valid(value.command)) throw new Error('Invalid stored slash command setting.');
      return { command: value.command };
    }),
    set: input => queue(async () => {
      const command = typeof input?.command === 'string' ? input.command.trim().replace(/^\//, '').toLowerCase() : undefined;
      if (!valid(command) || Object.keys(input).some(key => key !== 'command')) {
        throw new Error('Use 1-32 letters, digits or hyphens. Start with a letter. The name peers is reserved.');
      }
      const value = { command };
      await storage.set(KEY, value);
      return value;
    }),
  };
}
