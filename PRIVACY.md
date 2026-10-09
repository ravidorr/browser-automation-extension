# Privacy Policy

## Overview

Browser Automation Extension processes browser-page information only to perform the automation requested by the user.

## Data processed

When automation runs, the extension can process the active page URL, visible page elements, browser events, network activity metadata, screenshots when enabled, and the user-entered automation goal. The backend stores session traces and user ratings in memory while it is running.

## Permissions

- `activeTab` accesses the user-selected active tab for an automation run.
- `scripting` injects the automation content script into matching pages.
- `storage` stores extension preferences and the most recent goal locally.
- `management` reads extension-management state required by the extension.
- Host access to all URLs lets the content script operate on pages the user asks it to automate.

## Third parties

The backend sends the automation context to OpenAI when it requests a decision. OpenAI processes that context under its own privacy terms. No other third-party analytics service is configured by this repository.

## Retention

Session data is held in the backend process memory and is lost when that process stops. The extension does not implement a remote persistence service.

## Contact

For privacy questions, contact [raanan@avidor.org](mailto:raanan@avidor.org).
