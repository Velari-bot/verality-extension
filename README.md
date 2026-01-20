# Verality - YouTube Creator Finder Extension

A premium Chrome extension that helps you discover and enrich YouTube creators directly from your search results.

## Features
- **Smart Discovery**: Detects search intent (e.g., "fashion creators") and finds the top 50 relevant channels.
- **Premium UI**: Blends seamlessly into YouTube with a glassmorphism overlay.
- **Email Enrichment**: Uses the **Clay API** to find public business emails for creators.
- **ToS Compliant**: Uses official APIs and only accesses public information.

## Installation
1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `verality-extension` folder.

## Setup
1. Click the Verality extension icon in your toolbar.
2. Enter your **YouTube Data API Key** and **Clay API Key**.
3. Click **Save Configuration**.

## How to Use
1. Go to [YouTube](https://www.youtube.com).
2. Search for a niche (e.g., "tech reviewers" or "beauty influencers").
3. A Verality badge will appear above the search results.
4. Click **Analyze with Verality** to see the top 50 creators and their contact info.

## Technical Architecture
- **Detection**: Content script observes URL changes to identify search queries.
- **Orchestration**: Background service worker calls the YouTube Data API for channel discovery and metrics.
- **Enrichment**: Creator data is passed to Clay for email finding.
- **Display**: Results are rendered in a high-performance, beautiful overlay.
