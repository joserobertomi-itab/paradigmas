import { reducer } from './reducer.js';
import { initialState } from './initialState.js';

/**
 * Creates a store with all mutable state encapsulated in closure.
 * No module-level mutable state; reducer remains pure (state, action) => newState.
 */
export function createStore(reducerFn, initial) {
  let currentState = initial;
  let isDispatching = false;
  const listeners = [];

  return {
    getState() {
      return currentState;
    },

    dispatch(action) {
      if (isDispatching) {
        throw new Error('Reducers may not dispatch actions.');
      }
      try {
        isDispatching = true;
        currentState = reducerFn(currentState, action);
        return action;
      } finally {
        isDispatching = false;
        listeners.forEach(listener => listener());
      }
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Expected listener to be a function.');
      }
      listeners.push(listener);
      return function unsubscribe() {
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
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
