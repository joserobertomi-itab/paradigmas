import { reducer } from './reducer.js';
import { initialState } from './initialState.js';

let currentState = initialState;
let listeners = [];
let isDispatching = false;

export function createStore(reducerFn, initial) {
  currentState = initial;
  listeners = [];
  isDispatching = false;

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
      } finally {
        isDispatching = false;
      }

      // Notify all listeners
      listeners.forEach(listener => {
        listener();
      });

      return action;
    },

    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new Error('Expected listener to be a function.');
      }

      let isSubscribed = true;
      listeners.push(listener);

      return function unsubscribe() {
        if (!isSubscribed) {
          return;
        }

        isSubscribed = false;
        const index = listeners.indexOf(listener);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      };
    }
  };
}

// Create and export the store instance
export const store = createStore(reducer, initialState);

// Convenience functions
export function getState() {
  return store.getState();
}

export function dispatch(action) {
  return store.dispatch(action);
}

export function subscribe(listener) {
  return store.subscribe(listener);
}
