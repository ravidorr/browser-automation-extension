console.log('[TEST] Test content script loaded!', new Date().toISOString());
console.log('[TEST] URL:', window.location.href);
console.log('[TEST] Document ready state:', document.readyState);

// Add a visible indicator
const div = document.createElement('div');
div.style.cssText = 'position: fixed; top: 10px; right: 10px; background: red; color: white; padding: 10px; z-index: 9999; font-family: monospace;';
div.textContent = 'TEST SCRIPT LOADED';
document.body.appendChild(div);

console.log('[TEST] Test div added to page');
