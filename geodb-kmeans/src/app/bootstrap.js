import { store } from './state.js';
import { render } from './render.js';
import { bindEvents } from './events.js';

export function bootstrap() {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Root element #app not found');
    return;
  }

  // Initial render
  const initialState = store.getState();
  render(root, initialState);

  // Subscribe to state changes for re-rendering
  store.subscribe(() => {
    const state = store.getState();
    render(root, state);
  });

  // Bind event listeners
  bindEvents(root, store);
}
