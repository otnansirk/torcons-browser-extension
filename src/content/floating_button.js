// floating_button.js

(function() {
  // Never show the floating button on chat.torcons.ai
  if (location.hostname === 'chat.torcons.ai') return;
  if (document.getElementById('torcons-floating-btn-container')) return;

  const container = document.createElement('div');
  container.id = 'torcons-floating-btn-container';
  container.style.position = 'fixed';
  container.style.zIndex = '2147483647';
  
  // Set initial position
  container.style.top = '50%';
  container.style.right = '20px';
  container.style.transform = 'translateY(-50%)';
  
  const shadow = container.attachShadow({mode: 'open'});
  
  const iconUrl = chrome.runtime.getURL('assets/favicon-96x96.png');

  shadow.innerHTML = `
    <style>
      .fab {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.7), rgba(147, 51, 234, 0.7));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        user-select: none;
        transition: transform 0.2s, box-shadow 0.2s;
        overflow: hidden;
      }
      .fab:active {
        cursor: grabbing;
        transform: scale(0.95);
      }
      .fab img {
        width: 28px;
        height: 28px;
        pointer-events: none;
      }
    </style>
    <div class="fab" id="fab">
      <img src="${iconUrl}" alt="Torcons">
    </div>
  `;

  document.body.appendChild(container);

  const fab = shadow.getElementById('fab');
  
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;
  let moved = false;

  function setTransition(enabled) {
    container.style.transition = enabled ? 'left 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), top 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
  }

  function initPosition() {
    const rect = container.getBoundingClientRect();
    container.style.transform = 'none';
    container.style.left = rect.left + 'px';
    container.style.top = rect.top + 'px';
  }

  fab.addEventListener('mousedown', (e) => {
    // Only handle left clicks
    if (e.button !== 0) return;
    initPosition();
    isDragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = container.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    
    setTransition(false);
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      moved = true;
    }

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;
    
    const btnSize = 48;
    
    const sidebarWidthStr = document.documentElement.style.getPropertyValue('--torcons-sidebar-width');
    const sidebarW = sidebarWidthStr ? parseInt(sidebarWidthStr) : 0;
    const effWidth = window.innerWidth - sidebarW;
    
    // Boundary checks
    newLeft = Math.max(0, Math.min(effWidth - btnSize, newLeft));
    newTop = Math.max(0, Math.min(window.innerHeight - btnSize, newTop));
    
    container.style.left = newLeft + 'px';
    container.style.top = newTop + 'px';
  });
  function getSidebarWidth() {
    const val = document.documentElement.style.getPropertyValue('--torcons-sidebar-width');
    return val ? parseInt(val) : 0;
  }

  function snapToEdges() {
    const rect = container.getBoundingClientRect();
    const btnSize = 48;
    const padding = 20; 
    
    const sidebarW = getSidebarWidth();
    const effWidth = window.innerWidth - sidebarW;
    
    const cx = effWidth / 2;
    const cy = window.innerHeight / 2;
    const x = rect.left + btnSize / 2;
    const y = rect.top + btnSize / 2;
    
    // Normalize coordinates from -1 to 1 relative to center
    const nx = (x - cx) / cx;
    const ny = (y - cy) / cy;
    
    // Determine quadrant based on diagonals
    if (ny > Math.abs(nx)) {
      // Snap to Bottom
      container.style.top = (window.innerHeight - btnSize - padding) + 'px';
      container.style.left = Math.max(padding, Math.min(effWidth - btnSize - padding, rect.left)) + 'px';
    } else if (ny < -Math.abs(nx)) {
      // Snap to Top
      container.style.top = padding + 'px';
      container.style.left = Math.max(padding, Math.min(effWidth - btnSize - padding, rect.left)) + 'px';
    } else if (nx > Math.abs(ny)) {
      // Snap to Right
      container.style.left = (effWidth - btnSize - padding) + 'px';
      container.style.top = Math.max(padding, Math.min(window.innerHeight - btnSize - padding, rect.top)) + 'px';
    } else {
      // Snap to Left
      container.style.left = padding + 'px';
      container.style.top = Math.max(padding, Math.min(window.innerHeight - btnSize - padding, rect.top)) + 'px';
    }
  }

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    
    if (!moved) {
      // Treat as click
      try {
        chrome.runtime.sendMessage({ action: 'toggle_sidebar' }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Torcons: Background worker not ready.');
          }
        });
      } catch (err) {
        if (err.message.includes('Extension context invalidated')) {
          console.warn('Torcons: Extension was updated. Please refresh the page to continue using Torcons.');
          container.remove(); // Remove the dead button
        } else {
          console.error(err);
        }
      }
      return;
    }

    setTransition(true);
    snapToEdges();
  });

  function updateIcon() {
    const isSidebarOpen = document.getElementById('torcons-sidebar-container') !== null;
    if (isSidebarOpen) {
      fab.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    } else {
      fab.innerHTML = `<img src="${iconUrl}" alt="Torcons">`;
    }
  }

  window.addEventListener('torcons-sidebar-updated', (e) => {
    if (!isDragging) {
      const isSidebarResizing = e.detail && e.detail.resizing;
      setTransition(!isSidebarResizing);
      snapToEdges();
    }
    updateIcon();
  });

  // Call it initially in case sidebar is already open
  updateIcon();

  const dynamicStyle = document.createElement('style');
  shadow.appendChild(dynamicStyle);

  function applySettings(settings) {
    const show = settings.showFloatingButton !== false; // default true
    const styleType = settings.floatingButtonStyle || 'gradient';
    const opacity = settings.floatingButtonOpacity !== undefined ? settings.floatingButtonOpacity : 100;
    
    container.style.display = show ? 'block' : 'none';
    
    let background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.7), rgba(147, 51, 234, 0.7))';
    let backdrop = 'blur(12px)';
    
    if (styleType === 'glass') {
      background = 'rgba(255, 255, 255, 0.1)';
      backdrop = 'blur(24px)';
    } else if (styleType === 'solid') {
      background = 'rgba(30, 41, 59, 1)';
      backdrop = 'none';
    }
    
    dynamicStyle.textContent = `
      .fab {
        background: ${background} !important;
        backdrop-filter: ${backdrop} !important;
        -webkit-backdrop-filter: ${backdrop} !important;
        opacity: ${opacity / 100} !important;
      }
    `;
  }

  chrome.storage.local.get(['showFloatingButton', 'floatingButtonStyle', 'floatingButtonOpacity'], applySettings);

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      chrome.storage.local.get(['showFloatingButton', 'floatingButtonStyle', 'floatingButtonOpacity'], applySettings);
    }
  });
})();
