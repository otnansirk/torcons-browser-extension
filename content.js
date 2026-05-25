// content.js
// Runs on chat.torcons.ai to extract the auth token from localStorage

const extractAndSyncToken = () => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      chrome.runtime.sendMessage({ type: "TOKEN_SYNC", token: token }, (response) => {
        if (chrome.runtime.lastError) {
          // Extension might not be ready or reloaded
          console.warn("Torcons extension not ready to receive token.");
        }
      });
    }
  } catch (error) {
    console.error("Torcons: Failed to read token from localStorage", error);
  }
};

// Check immediately on load
extractAndSyncToken();

// Listen for changes in localStorage in case the user logs in without refreshing
window.addEventListener("storage", (event) => {
  if (event.key === "token") {
    extractAndSyncToken();
  }
});
