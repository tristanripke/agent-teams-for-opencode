// Bundles the server, RPC and TUI entry points with @opencode/schema, which OpenCode does not supply, so an install
// needs only solid-js. effect and @opencode/plugin stay external: OpenCode resolves them to its own instances for every
// plugin, and the SDK asks plugins not to bundle them. The Desktop panel is bundled separately by `vite build`.
import { build } from 'esbuild';

await build({
  entryPoints: { server: 'src/server.js', rpc: 'src/rpc.js', tui: 'src/tui.js' },
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  external: ['solid-js', 'solid-js/*', 'effect', 'effect/*', '@opencode/plugin', '@opencode/plugin/*'],
  legalComments: 'eof',
  banner: { js: '/* Agent Teams. Third-party code bundled into these files, and its licence: see THIRD_PARTY_LICENSES. */' },
  logLevel: 'warning',
});
