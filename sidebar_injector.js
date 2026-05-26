// sidebar_injector.js

(function() {
  const CONTAINER_ID = 'torcons-sidebar-container';

  // 1. Toggle Logic
  const existingContainer = document.getElementById(CONTAINER_ID);
  if (existingContainer) {
    existingContainer.remove();
    document.documentElement.style.width = existingContainer.dataset.originalWidth || '';
    document.documentElement.style.removeProperty('--torcons-sidebar-width');
    window.dispatchEvent(new CustomEvent('torcons-sidebar-updated', { detail: { resizing: false } }));
    return;
  }

  // 2. Create Container
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.dataset.originalWidth = document.documentElement.style.width;
  
  const initialWidth = 400;
  document.documentElement.style.width = `calc(100% - ${initialWidth}px)`;
  document.documentElement.style.setProperty('--torcons-sidebar-width', initialWidth + 'px');
  
  // Timeout ensures CSS property is applied before dispatching
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('torcons-sidebar-updated', { detail: { resizing: false } }));
  }, 0);
  
  // Base styling for the container
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    right: '0',
    width: `${initialWidth}px`, // Default width
    height: '100vh',
    zIndex: '2147483647', // Max z-index to overlay everything
    display: 'flex',
    boxShadow: '-4px 0 15px rgba(0, 0, 0, 0.3)'
  });

  // 3. Create Resizer Handle
  const resizer = document.createElement('div');
  Object.assign(resizer.style, {
    width: '6px',
    height: '100%',
    cursor: 'ew-resize',
    backgroundColor: 'rgba(99, 102, 241, 0.8)', // Subtle accent color
    flexShrink: '0',
    transition: 'background-color 0.2s',
    zIndex: '2147483648'
  });

  resizer.onmouseenter = () => resizer.style.backgroundColor = 'rgba(79, 70, 229, 1)';
  resizer.onmouseleave = () => resizer.style.backgroundColor = 'rgba(99, 102, 241, 0.8)';

  // 4. Create Iframe
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('popup.html');
  Object.assign(iframe.style, {
    flexGrow: '1',
    border: 'none',
    width: '100%',
    height: '100%',
    backgroundColor: '#0f1115' // Match extension dark bg
  });

  // Assemble
  container.appendChild(resizer);
  container.appendChild(iframe);
  document.body.appendChild(container);

  // 5. Resize Logic
  let isResizing = false;
  
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.userSelect = 'none'; // Prevent text selection on the host page
    iframe.style.pointerEvents = 'none'; // Prevent iframe from swallowing mouse events during drag
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const mouseX = e.clientX;
    const windowWidth = window.innerWidth;
    let newWidth = windowWidth - mouseX;

    // Apply constraints
    const minWidth = 320;
    const maxWidth = windowWidth * 0.5; // Exactly 50% of screen width

    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    container.style.width = newWidth + 'px';
    document.documentElement.style.width = `calc(100% - ${newWidth}px)`;
    document.documentElement.style.setProperty('--torcons-sidebar-width', newWidth + 'px');
    window.dispatchEvent(new CustomEvent('torcons-sidebar-updated', { detail: { resizing: true } }));
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
      iframe.style.pointerEvents = 'auto'; // Re-enable iframe interaction
      window.dispatchEvent(new CustomEvent('torcons-sidebar-updated', { detail: { resizing: false } }));
    }
  });

})();
