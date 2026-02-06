import { reducer } from './reducer.js';
import { initialState } from './initialState.js';

/**
 * Creates a store with a single mutable cell (state + listeners + dispatching).
 * Reducer remains pure (state, action) => newState.
 */
export function createStore(reducerFn, initial) {
  const storeCell = {
    state: initial,
    listeners: [],
    dispatching: false
  };

  return {
    getState() {
      return storeCell.state;
    },

    dispatch(action) {
      if (storeCell.dispatching) {
        throw new Error('Reducers may not dispatch actions.');
      }
      try {
        storeCell.dispatching = true;
        storeCell.state = reducerFn(storeCell.state, action);
        return action;
      } finally {
        storeCell.dispatching = false;
        storeCell.listeners.forEach(listener => listener());
      }
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Expected listener to be a function.');
      }
      storeCell.listeners.push(listener);
      return function unsubscribe() {
        const index = storeCell.listeners.indexOf(listener);
        if (index > -1) {
          storeCell.listeners.splice(index, 1);
        }
      };
    }
  };
}

const store = createStore(reducer, initialState);

export { store };

export function getState() {
  return store.getState();
}

export function dispatch(action) {
  return store.dispatch(action);
}

export function subscribe(listener) {
  return store.subscribe(listener);
}
