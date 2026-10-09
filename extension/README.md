# Browser Automation Extension

A Chrome extension that provides AI-powered browser automation using LLM decision making.

## Features

- **DOM Inventory**: Automatically collects page elements with visibility, accessibility, and interaction properties
- **Network Idle Detection**: Waits for network requests to complete before taking actions
- **SPA Support**: Handles single-page application navigation and route changes
- **LLM Integration**: Uses backend service for intelligent decision making
- **Action Execution**: Clicks, types, navigates, and handles form interactions
- **Session Tracking**: Records all automation steps for debugging and improvement

## Installation

### Load as Unpacked Extension

1. **Open Chrome Extensions Page**:
   - Navigate to `chrome://extensions/`
   - Or go to Chrome menu → More tools → Extensions

2. **Enable Developer Mode**:
   - Toggle the "Developer mode" switch in the top right corner

3. **Load Extension**:
   - Click "Load unpacked" button
   - Select the `extension/` folder from this project
   - The extension should appear in your extensions list

4. **Verify Installation**:
   - Look for "Browser Automation Extension" in the extensions list
   - The extension icon should appear in your Chrome toolbar

## Usage

### Prerequisites

Make sure the backend server is running:
```bash
# From the project root
pnpm dev:backend
```

The backend should be accessible at `http://localhost:3000`

### Starting Automation

1. **Navigate to a webpage** where you want to run automation
2. **Click the extension icon** in the Chrome toolbar
3. **Click "Start Automation"** in the popup
4. **Enter your goal** when prompted (e.g., "Search for information about AI")
5. **Watch the automation** as it observes, decides, and executes actions

### How It Works

The extension follows this loop:

1. **COLLECT**: Gathers DOM elements and page state
2. **OBSERVE**: Sends observation to backend
3. **DECIDE**: Gets AI decision from backend
4. **EXECUTE**: Performs the action on the page
5. **Repeat** until goal is achieved or stopped

### Safety Features

- **Single Tab Enforcement**: Only one tab can be automated at a time
- **Network Idle Detection**: Waits for page to be stable before acting
- **File Input Detection**: Stops when file upload is requested
- **Consecutive Failure Limits**: Prevents infinite loops
- **Tab Close Handling**: Gracefully stops if tab is closed

## Development

### File Structure

```
extension/
├─ manifest.json        # Extension configuration
├─ bg.js               # Background service worker
├─ content.js          # Content script (DOM interaction)
├─ popup.html          # Extension popup UI
├─ popup.js            # Popup functionality
└─ README.md           # This file
```

### Key Components

- **Background Service Worker** (`bg.js`): Manages automation loop and API communication
- **Content Script** (`content.js`): Handles DOM observation and action execution
- **Popup** (`popup.html/js`): User interface for starting automation

### Backend Integration

The extension communicates with the backend API:
- `POST /v1/sessions` - Create new automation session
- `POST /v1/steps/observe` - Send page observations
- `POST /v1/steps/decide` - Get AI decisions
- `POST /v1/steps/execute` - Report action results
- `POST /v1/rate` - Submit user ratings

## Troubleshooting

### Extension Not Loading
- Ensure Developer mode is enabled
- Check that all files are present in the extension folder
- Look for errors in the Extensions page

### Backend Connection Issues
- Verify backend is running on `http://localhost:3000`
- Check browser console for network errors
- Ensure CORS is properly configured

### Automation Not Working
- Check browser console for JavaScript errors
- Verify the page allows content scripts
- Look for network idle detection issues

### Debugging
- Open Chrome DevTools
- Check Console tab for extension logs
- Use the Extensions page to inspect background service worker
- Monitor Network tab for API calls

## Security Notes

- The extension requires broad permissions to function
- It can read and modify page content
- It communicates with localhost backend
- Use only on trusted websites
- Review the code before loading in production

## License

This extension is part of the browser automation project.
