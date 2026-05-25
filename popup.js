// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const chatView = document.getElementById('chat-view');
  const signinBtn = document.getElementById('signin-btn');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  const chatHistory = document.getElementById('chat-history');
  const modelSelect = document.getElementById('model-select');

  let authToken = null;
  let modelsFetched = false;
  let chatMessages = [];
  let currentPageKey = null;

  const initPageKey = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab && tab.url ? tab.url.split('#')[0] : 'unknown_page';
      currentPageKey = `history_${url}`;
    } catch (e) {
      currentPageKey = 'history_unknown_page';
    }
  };

  const saveHistory = () => {
    if (currentPageKey) {
      chrome.storage.local.set({ [currentPageKey]: chatMessages });
    }
  };

  async function loadSystemConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL('config/system.json'));
      const config = await response.json();
      return { role: "system", content: config.system_prompt };
    } catch (e) {
      console.error("Failed to load system config", e);
      return { role: "system", content: "You are Torcons, an intelligent AI assistant." };
    }
  }

  const loadHistory = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get([currentPageKey], async (result) => {
        chatHistory.innerHTML = ''; // Clear hardcoded welcome message

        if (result[currentPageKey] && result[currentPageKey].length > 0) {
          chatMessages = result[currentPageKey];

          // Render existing messages
          chatMessages.forEach(msg => {
            if (msg.role !== 'system') {
              appendMessage(msg.role === 'assistant' ? 'ai' : 'user', msg.content);
            }
          });
        } else {
          // New day or no history
          const systemMsg = await loadSystemConfig();
          chatMessages = [systemMsg];
          // Render welcome message
          appendMessage('ai', "Hello! I'm Torcons. How can I help you today? You can also ask me to summarize the page you're currently on.");

          addInlineSummarizeButton();
          saveHistory();
        }
        resolve();
      });
    });
  };

  // 1. Authentication Check
  const checkAuth = async () => {
    await initPageKey();

    chrome.storage.local.get(['token'], async (result) => {
      if (result.token) {
        authToken = result.token;
        loginView.classList.add('hidden');
        chatView.classList.remove('hidden');
        if (!modelsFetched) {
          fetchModels();
          modelsFetched = true;
        }

        if (chatMessages.length === 0) {
          await loadHistory();
        }
      } else {
        loginView.classList.remove('hidden');
        chatView.classList.add('hidden');
      }
    });
  };

  // Listen for storage changes in case the background script syncs the token while popup is open
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.token) {
      checkAuth();
    }
  });

  checkAuth();

  // 2. Sign In Button Action
  signinBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.torcons.ai' });
  });

  // 3. UI Interactions
  // Auto-resize textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
    sendBtn.disabled = chatInput.value.trim().length === 0;
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  sendBtn.addEventListener('click', handleSend);

  // 4. Send Message Logic
  async function handleSend() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Reset input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;

    // Remove inline summarize button if it exists
    const inlineContainer = document.getElementById('inline-summarize-container');
    if (inlineContainer) inlineContainer.remove();

    // Add User Message to UI
    appendMessage('user', text);
    chatMessages.push({ role: "user", content: text });
    saveHistory();

    // Fetch AI Response
    await fetchAIResponse();
  }

  // 5. Append Message to UI
  function appendMessage(role, content) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}-message`;

    if (role === 'ai') {
      msgDiv.innerHTML = `
        <div class="avatar">T</div>
        <div class="bubble" style="line-height: 1.6;">${renderMarkdown(content)}</div>
      `;
    } else {
      msgDiv.innerHTML = `<div class="bubble">${escapeHTML(content)}</div>`;
    }

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return msgDiv;
  }

  function appendTypingIndicator() {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ai-message typing-indicator-wrapper`;
    msgDiv.id = 'typing-indicator';
    msgDiv.innerHTML = `
      <div class="avatar">T</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }

  async function getCurrentPageContext() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.url.startsWith('chrome://')) return null;

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const article = document.querySelector('article') || document.querySelector('main');
          return (article || document.body).innerText;
        }
      });
      const pageContent = injectionResults[0]?.result;
      if (pageContent) {
        const truncatedContent = pageContent.substring(0, 15000);
        return `Title: ${tab.title}\nURL: ${tab.url}\n\nContent:\n${truncatedContent}`;
      }
    } catch (err) {
      console.warn("Could not extract page context", err);
    }
    return null;
  }

  // 6. Fetch AI Response
  async function fetchAIResponse() {
    appendTypingIndicator();

    try {
      let apiMessages = [...chatMessages];
      const pageContext = await getCurrentPageContext();

      if (pageContext && apiMessages.length > 0 && apiMessages[0].role === 'system') {
        apiMessages[0] = {
          ...apiMessages[0],
          content: `${apiMessages[0].content}\n\n--- CURRENT PAGE CONTEXT ---\n${pageContext}`
        };
      }

      // Sending request to the correct endpoint without /v1
      const response = await fetch('https://chat.torcons.ai/openai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          model: modelSelect.value || 'default', // standard placeholder for compatible APIs
          messages: apiMessages,
          stream: true
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          chrome.storage.local.remove(['token']);
          throw new Error("Authentication failed. Please sign in again.");
        }
        throw new Error(`API Error: ${response.status}`);
      }

      removeTypingIndicator();

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      let fullContent = '';
      const msgDiv = appendMessage('ai', '');
      const bubble = msgDiv.querySelector('.bubble');
      let buffer = '';
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep partial line

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.choices && data.choices.length > 0) {
                  const delta = data.choices[0].delta;
                  if (delta && delta.content) {
                    fullContent += delta.content;
                    bubble.innerHTML = renderMarkdown(fullContent);
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                  }
                }
              } catch (e) {
                // Ignore incomplete JSON chunks
              }
            }
          }
        }
      }

      chatMessages.push({ role: "assistant", content: fullContent });
      saveHistory();

    } catch (error) {
      removeTypingIndicator();
      console.error(error);
      appendMessage('ai', `Oops, something went wrong: ${error.message}`);

      // Remove the last user message from memory so it doesn't pollute the context
      chatMessages.pop();
      saveHistory();
    }
  }

  // 7. Summarize Page Logic
  async function triggerSummarize() {
    const inlineContainer = document.getElementById('inline-summarize-container');
    if (inlineContainer) inlineContainer.remove();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active tab found");

      if (tab.url.startsWith('chrome://')) {
        throw new Error("Cannot summarize internal Chrome pages.");
      }

      const prompt = `Please summarize the current page concisely. Highlight the main points.`;

      appendMessage('user', `Summarize this page: ${tab.title}`);

      chatMessages.push({ role: "user", content: prompt });
      saveHistory();

      await fetchAIResponse();

    } catch (error) {
      console.error(error);
      appendMessage('ai', `Could not summarize page: ${error.message}`);
    }
  }

  function addInlineSummarizeButton() {
    const btnDiv = document.createElement('div');
    btnDiv.id = 'inline-summarize-container';
    btnDiv.style.textAlign = 'center';
    btnDiv.style.marginTop = '20px';
    btnDiv.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
        <span style="margin: 0 15px; font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1.5px;">Quick Tools</span>
        <div style="flex: 1; height: 1px; background: rgba(255,255,255,0.1);"></div>
      </div>
      <button id="inline-summarize-btn" class="btn secondary-btn" style="padding: 10px 20px; border-radius: 20px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); cursor: pointer; color: rgba(255,255,255,0.8);">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        Summarize Current Page
      </button>
    `;
    chatHistory.appendChild(btnDiv);

    document.getElementById('inline-summarize-btn').addEventListener('click', triggerSummarize);
  }

  // 8. Fetch Models
  async function fetchModels() {
    try {
      const response = await fetch('https://chat.torcons.ai/openai/models', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (!response.ok) throw new Error("Failed to fetch models");
      const data = await response.json();

      if (data.data && data.data.length > 0) {
        modelSelect.innerHTML = '';
        data.data.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          modelSelect.appendChild(option);
        });
        modelSelect.disabled = false;
      } else {
        modelSelect.innerHTML = '<option value="default">Default Model</option>';
      }
    } catch (error) {
      console.error(error);
      modelSelect.innerHTML = '<option value="default">Default Model</option>';
    }
  }

  function renderMarkdown(str) {
    if (!str) return '';

    let html = str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Code blocks
    html = html.replace(/```(?:[a-z0-9]*\n)?([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;overflow-x:auto;margin:8px 0;font-family:monospace;font-size:12px;"><code>$1</code></pre>');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code style="background:rgba(0,0,0,0.3);padding:2px 4px;border-radius:4px;font-family:monospace;font-size:13px;">$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3 style="margin: 12px 0 6px 0; font-size: 15px;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="margin: 14px 0 8px 0; font-size: 16px;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="margin: 16px 0 10px 0; font-size: 18px;">$1</h1>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#818cf8; text-decoration:none;">$1</a>');
    // Lists
    html = html.replace(/^\s*[\-\*] (.*$)/gim, '<li style="margin-left: 20px;">$1</li>');
    html = html.replace(/^\s*\d+\. (.*$)/gim, '<li style="margin-left: 20px;">$1</li>');

    // Process newlines outside of pre blocks
    const parts = html.split(/(<pre[\s\S]*?<\/pre>)/);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('<pre')) {
        parts[i] = parts[i].replace(/\n/g, '<br>');
      }
    }
    return parts.join('');
  }

  // Utility to prevent XSS in simple strings
  function escapeHTML(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML.replace(/\n/g, '<br>');
  }
});
