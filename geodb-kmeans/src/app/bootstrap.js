import { setupEvents } from './events.js';
import { render } from './render.js';
import { getState } from './state.js';

export function bootstrap() {
  const state = getState();
  render(state);
  setupEvents();
}
