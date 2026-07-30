// sidebar_injector.js

(function() {
  const CONTAINER_ID = 'torcons-sidebar-container';

  // Handle action type
  const actionType = window.torconsActionType || 'toggle';
  window.torconsActionType = null; // reset

  const requestPendingContextAsk = (iframe) => {
    if (!iframe || !iframe.contentWindow) return;

    iframe.contentWindow.postMessage({
      type: 'TORCONS_CHECK_PENDING_CONTEXT_ASK'
    }, chrome.runtime.getURL('').slice(0, -1));
  };

  // 1. Toggle Logic
  const existingContainer = document.getElementById(CONTAINER_ID);
  if (existingContainer) {
    if (actionType === 'open') {
      requestPendingContextAsk(existingContainer.querySelector('iframe'));
      return; // already open, do nothing
    }

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
  
  const initialWidth = 550;
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
  iframe.src = chrome.runtime.getURL('src/ui/sidebar/sidebar.html');
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

  // 6. Cross-origin Drag and Drop (Host Page -> Sidebar)
  let dragOverlay = null;
  let draggedImageUrl = null;
  let draggedText = null;

  window.addEventListener('dragstart', (e) => {
    draggedImageUrl = null;
    draggedText = null;

    if (e.target && e.target.tagName === 'IMG') {
      draggedImageUrl = e.target.src;
    } else if (e.target && e.target.tagName === 'A' && e.target.querySelector('img')) {
      draggedImageUrl = e.target.querySelector('img').src;
    } else {
      const selection = window.getSelection().toString().trim();
      if (selection) {
        draggedText = selection;
      }
    }

    if ((draggedImageUrl || draggedText) && document.getElementById(CONTAINER_ID)) {
      if (!dragOverlay) {
        dragOverlay = document.createElement('div');
        Object.assign(dragOverlay.style, {
          position: 'absolute',
          top: '0', left: '6px', right: '0', bottom: '0', // skip 6px resizer
          zIndex: '2147483649', // above iframe and resizer
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          border: '2px dashed rgba(37, 99, 235, 0.8)'
        });
        
        dragOverlay.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
        });

        dragOverlay.addEventListener('drop', (ev) => {
          ev.preventDefault();
          if (iframe && iframe.contentWindow) {
            let payload = null;
            if (draggedImageUrl) {
              payload = { type: 'image', imageUrl: draggedImageUrl };
            } else if (draggedText) {
              payload = { type: 'text', text: draggedText };
            }
            if (payload) {
              iframe.contentWindow.postMessage({
                type: 'TORCONS_EXTERNAL_DROP',
                payload: payload
              }, '*');
            }
          }
          cleanupDrag();
        });

        container.appendChild(dragOverlay);
      }
    }
  });

  window.addEventListener('dragend', () => cleanupDrag());
  window.addEventListener('mouseup', () => cleanupDrag()); // Fallback

  function cleanupDrag() {
    if (dragOverlay) {
      dragOverlay.remove();
      dragOverlay = null;
    }
    draggedImageUrl = null;
    draggedText = null;
  }

})();
