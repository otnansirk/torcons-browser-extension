# Torcons Chrome Extension

Torcons is an AI-powered sidebar copilot designed to seamlessly integrate into your browsing experience. With a premium, macOS Tahoe-inspired glassmorphism aesthetic, Torcons helps you summarize web pages, ask questions, and chat directly within a resizable sidebar.

## Features

- **Context-Aware AI:** Automatically reads the current webpage's content, allowing you to ask "Summarize this page" and get immediate, contextually accurate results.
- **Floating Action Button (FAB):** A gorgeous, draggable floating icon injected into all pages. Drop it anywhere, and it smoothly snaps to the edges. Click it to summon the sidebar.
- **Edge-Snapping & Dynamic Bounds:** The floating button dynamically avoids the sidebar when it opens, keeping your screen clear and usable.
- **Premium Glassmorphism Design:** Rich, animated gradient backgrounds paired with deeply blurred, frosted glass UI components for a modern, sleek feel.
- **Chat History:** Conversations are automatically keyed to the specific URL you are visiting and saved locally, so you never lose context when refreshing or revisiting a page.
- **Customizable Settings:** A dedicated Options page allows you to toggle the floating button, switch styles (Gradient, Ice Glass, Solid Dark), and adjust opacity in real-time.

## Installation (Developer Mode)

To install this extension locally on your machine for testing or development:

1. Download or clone this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left corner.
5. Select the folder containing this extension (`Chromium Extension`).
6. The Torcons extension is now installed! You can pin it to your toolbar for easy access.

## Packaging for Distribution

To share this extension as a single file (`.crx`) with your team:

1. Go to `chrome://extensions/` with Developer mode enabled.
2. Click **Pack extension**.
3. Select this folder as the extension root directory.
4. Chrome will generate a `.crx` file and a `.pem` private key file. **Keep the `.pem` file safe and do not commit it to version control** (it is excluded by `.gitignore`).
5. Share the `.crx` (or zip the folder) with your team!

## Technologies Used

- Vanilla JavaScript (ES6)
- HTML5 & CSS3 (Custom Glassmorphism UI)
- Chrome Extension API (Manifest V3)
- Server-Sent Events (SSE) for streaming AI responses
