import { ui } from './ui.tsx';

export function PreviewToolbar(props) {
  return <header class="preview-toolbar">
    <div class="preview-brand"><ui.Icon name="speech-bubble" /><span>Agent Teams <span class="preview-badge">Design preview</span></span></div>
    <nav aria-label="Design preview" class="preview-navigation">
      <button type="button" aria-pressed={props.view() === 'dashboard'} onClick={() => props.onView('dashboard')}>Dashboard</button>
      <button type="button" aria-pressed={props.view() === 'settings'} onClick={() => props.onView('settings')}>Settings</button>
    </nav>
    <span class="preview-disclaimer">Synthetic data · real plugin layout. Native controls are preview adapters; Desktop is the visual authority.</span>
  </header>;
}
