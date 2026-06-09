// content.js
// Runs on chat.torcons.ai to extract the auth token from localStorage

let tokenSynced = false;

const extractAndSyncToken = () => {
  if (tokenSynced) return;
  
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const urlParams = new URLSearchParams(window.location.search);
      const isFromExtension = urlParams.has('source');
      const returnTabIdStr = urlParams.get('returnTabId');
      const returnTabId = returnTabIdStr ? parseInt(returnTabIdStr, 10) : null;
      
      try {
        chrome.runtime.sendMessage({ 
          type: "TOKEN_SYNC", 
          token: token, 
          closeTab: isFromExtension,
          returnTabId: returnTabId
        }, (response) => {
          if (chrome.runtime.lastError) {
            // Extension might not be ready or reloaded
            console.warn("Torcons extension not ready to receive token.");
          } else {
            tokenSynced = true;
          }
        });
      } catch (err) {
        if (err.message.includes('Extension context invalidated')) {
          console.warn('Torcons: Extension context invalidated. Please refresh the page.');
          if (window.torconsTokenInterval) clearInterval(window.torconsTokenInterval);
        } else {
          console.error(err);
        }
      }
    }
  } catch (error) {
    console.error("Torcons: Failed to read token from localStorage", error);
  }
};

// Check immediately on load
extractAndSyncToken();

// Poll periodically to catch Single Page Application (SPA) logins/redirects.
// The 'storage' event does not fire in the same tab that modifies localStorage.
window.torconsTokenInterval = setInterval(extractAndSyncToken, 1000);

// Listen for changes in localStorage from other tabs
window.addEventListener("storage", (event) => {
  if (event.key === "token") {
    extractAndSyncToken();
  }
});
