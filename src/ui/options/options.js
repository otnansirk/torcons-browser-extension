document.addEventListener('DOMContentLoaded', () => {
  const showFabEl = document.getElementById('show-fab');
  const fabStyleEl = document.getElementById('fab-style');
  const fabOpacityEl = document.getElementById('fab-opacity');
  const opacityValEl = document.getElementById('opacity-val');
  const previewFab = document.getElementById('preview-fab');
  const systemPromptEl = document.getElementById('system-prompt');
  const useCustomPromptEl = document.getElementById('use-custom-prompt');

  const updatePromptUI = () => {
    systemPromptEl.disabled = !useCustomPromptEl.checked;
    systemPromptEl.style.opacity = useCustomPromptEl.checked ? '1' : '0.5';
    if (useCustomPromptEl.checked) {
      systemPromptEl.focus();
    }
  };

  const updatePreview = () => {
    const show = showFabEl.checked;
    const styleType = fabStyleEl.value;
    const opacity = parseInt(fabOpacityEl.value, 10);
    
    previewFab.style.display = show ? 'flex' : 'none';
    
    let background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.7), rgba(147, 51, 234, 0.7))';
    let backdrop = 'blur(12px)';
    
    if (styleType === 'glass') {
      background = 'rgba(255, 255, 255, 0.1)';
      backdrop = 'blur(24px)';
    } else if (styleType === 'solid') {
      background = 'rgba(30, 41, 59, 1)';
      backdrop = 'none';
    }
    
    previewFab.style.background = background;
    previewFab.style.backdropFilter = backdrop;
    previewFab.style.webkitBackdropFilter = backdrop;
    previewFab.style.opacity = opacity / 100;
  };

  // Load saved settings
  chrome.storage.local.get({
    showFloatingButton: true,
    floatingButtonStyle: 'gradient',
    floatingButtonOpacity: 100,
    systemPrompt: '',
    useCustomPrompt: false
  }, (items) => {
    showFabEl.checked = items.showFloatingButton;
    fabStyleEl.value = items.floatingButtonStyle;
    fabOpacityEl.value = items.floatingButtonOpacity;
    opacityValEl.textContent = items.floatingButtonOpacity + '%';
    systemPromptEl.value = items.systemPrompt;
    useCustomPromptEl.checked = items.useCustomPrompt;
    updatePreview();
    updatePromptUI();
  });

  // Save settings when changed
  const saveOptions = () => {
    chrome.storage.local.set({
      showFloatingButton: showFabEl.checked,
      floatingButtonStyle: fabStyleEl.value,
      floatingButtonOpacity: parseInt(fabOpacityEl.value, 10),
      systemPrompt: systemPromptEl.value,
      useCustomPrompt: useCustomPromptEl.checked
    });
    updatePreview();
  };

  showFabEl.addEventListener('change', saveOptions);
  fabStyleEl.addEventListener('change', saveOptions);
  
  fabOpacityEl.addEventListener('input', (e) => {
    opacityValEl.textContent = e.target.value + '%';
  });
  fabOpacityEl.addEventListener('change', saveOptions);
  systemPromptEl.addEventListener('change', saveOptions);
  
  useCustomPromptEl.addEventListener('change', () => {
    updatePromptUI();
    saveOptions();
  });

  // ── Account / Logout ──────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logout-btn');

  function setSignedIn() {
    logoutBtn.style.display = 'block';
    logoutBtn.textContent   = 'Log Out';
    logoutBtn.className     = 'logout-btn';
    logoutBtn.onclick       = doLogout;
  }

  function setSignedOut() {
    logoutBtn.style.display = 'block';
    logoutBtn.textContent   = 'Sign In';
    logoutBtn.className     = 'logout-btn signin-btn';
    logoutBtn.onclick       = doSignIn;
  }

  function refreshAuthStatus() {
    chrome.storage.local.get(['token'], ({ token }) => {
      token ? setSignedIn() : setSignedOut();
    });
  }

  function doLogout() {
    chrome.storage.local.remove('token', () => {
      logoutBtn.textContent = 'Logged Out ✓';
      logoutBtn.classList.add('done');
      setTimeout(() => setSignedOut(), 1500);
    });
  }

  function doSignIn() {
    chrome.tabs.create({ url: 'https://chat.torcons.ai/' });
    // Watch for the token to arrive after the user logs in
    const unwatch = chrome.storage.onChanged.addListener((changes, ns) => {
      if (ns === 'local' && changes.token && changes.token.newValue) {
        refreshAuthStatus();
        chrome.storage.onChanged.removeListener(unwatch);
      }
    });
  }

  refreshAuthStatus();
  // ─────────────────────────────────────────────────────────────────────────
});
