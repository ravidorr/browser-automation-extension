# Browser Automation Extension

A monorepo containing a browser automation extension with a backend service.

## Prerequisites

- Node.js 20 or higher
- pnpm 8 or higher
- OpenAI API key (get one at https://platform.openai.com/api-keys)

## Project Structure

```
.
├─ backend/          # Backend service
├─ extension/        # Browser extension
├─ package.json      # Root package with workspaces
├─ pnpm-workspace.yaml
├─ tsconfig.json     # Base TypeScript config
└─ smoke.yaml        # Smoke test intents
```

## Quick Start

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure OpenAI API:**
   ```bash
   cd backend
   cp env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Start backend server:**
   ```bash
   pnpm dev:backend
   ```

3. **Load the extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `extension/` folder
   - The extension icon should appear in your toolbar

4. **Test automation:**
   - Navigate to any website
   - Click the extension icon to open the popup
   - Enter a goal like "Search for information about browser automation"
   - Click "Start Automation"
   - Watch the AI-powered automation in action!

## Features

### 🎯 **Goal Input UI**
- **User-friendly popup** with goal input field
- **Goal persistence** - saves your last goal for convenience
- **Input validation** - prevents empty goals from being submitted
- **Keyboard shortcuts** - Ctrl+Enter to submit
- **Real-time status** - shows when automation is running

### 🤖 **AI-Powered Automation**
- **OpenAI Integration** - Real AI decisions based on page content
- **Context-aware** - Analyzes page elements and user intent
- **Schema-compliant** - Structured JSON responses
- **Error handling** - Graceful handling of API failures

### 📊 **Event Tracking System**
- **Route Changes** - Tracks SPA navigation and URL changes
- **DOM Mutations** - Monitors element changes and page updates
- **Network Activity** - Tracks requests, responses, and network idle
- **Event Filtering** - Intelligent deduplication and significance filtering
- **Real-time Logging** - Comprehensive event logging for debugging

### ⚙️ **Configurable Event Tracking**
- **Multiple Profiles** - Sensitive, balanced, and conservative configurations
- **Granular Thresholds** - Fine-tune timing for each event type
- **Advanced Filtering** - Filter by URLs, elements, attributes, and more
- **Performance Settings** - Sampling, burst limits, and size controls
- **Runtime Configuration** - Change settings without reloading

### 🔧 **Developer Tools**
- **Comprehensive testing** - Unit, integration, and smoke tests
- **Real-time logging** - Detailed logs for debugging
- **Extension packaging** - Easy deployment scripts

## Development

### Backend
- Located in `backend/`
- Run with: `pnpm dev:backend`
- Requires OpenAI API key (see `backend/env.example`)
- API endpoints: `/v1/sessions`, `/v1/steps/*`, `/v1/rate`, `/v1/kpi`
- Trace viewer: `http://localhost:3000/trace.html`

### Extension
- Located in `extension/`
- Chrome MV3 extension with content script and background service worker
- Load as unpacked extension in Chrome
- See `extension/README.md` for detailed instructions

## Scripts

- `dev` - Start backend in development mode (alias for dev:backend)
- `dev:backend` - Start backend in development mode
- `typecheck` - Run TypeScript type checking across all packages
- `lint` - Run linting (currently skipped)
- `zip:extension` - Create extension.zip for distribution
- `test:smoke` - Validate smoke test intents
- `test:openai` - Test OpenAI integration
- `test:popup` - Test popup functionality
- `test:events` - Test event tracking functionality
- `test:integration` - Test full system integration
- `test:config` - Test event tracking configuration system

## Testing

### Smoke Tests
The `smoke.yaml` file contains 10 test intents from PRD Appendix G:

1. **Search for information** - Find and use search functionality
2. **Fill out contact form** - Complete web forms
3. **Navigate to specific page** - Find and click navigation links
4. **Download file** - Locate and trigger downloads
5. **Add item to cart** - E-commerce interactions
6. **Complete checkout** - Payment form completion
7. **Subscribe to newsletter** - Email signup forms
8. **Book appointment** - Date/time selection
9. **Upload file** - File picker interactions (should finish with FILE_PICKER_REACHED)
10. **Open external link** - External link handling (should finish with NEW_TAB_BLOCKED)

### Test Websites
- Google Search: `https://www.google.com`
- GitHub: `https://github.com`
- Wikipedia: `https://en.wikipedia.org`

## Workspaces

This project uses pnpm workspaces with two packages:
- `backend` - Backend service with Express API
- `extension` - Chrome MV3 extension
