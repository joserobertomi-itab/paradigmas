// Query selectors
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

// Event listeners
export function on(element, event, handler, options = false) {
  if (!element) return;
  element.addEventListener(event, handler, options);
  return () => element.removeEventListener(event, handler);
}

// DOM manipulation
export function clear(element) {
  if (!element) return;
  element.innerHTML = '';
}

export function setText(element, text) {
  if (!element) return;
  element.textContent = text;
}

export function setHTML(element, html) {
  if (!element) return;
  element.innerHTML = html;
}

export function createElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'dataset') {
      Object.entries(value).forEach(([dataKey, dataValue]) => {
        element.dataset[dataKey] = dataValue;
      });
    } else if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      element.addEventListener(eventName, value);
    } else {
      element.setAttribute(key, value);
    }
  });

  // Append children
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });

  return element;
}

export function appendChild(parent, child) {
  if (!parent) return;
  if (typeof child === 'string') {
    parent.appendChild(document.createTextNode(child));
  } else if (child instanceof Node) {
    parent.appendChild(child);
  }
}
