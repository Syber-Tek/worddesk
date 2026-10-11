# WordDesk Update: Sequential Service Progression, Draggable Service Planner, YouTube & Online Media Integration, and Auto-Update Reliability

## Overview

This update delivers major workflow enhancements to WordDesk:
1. **Sequential Bible Verse & Hymn Stanza Stepping from Playlist**: When presenting a scripture passage or hymn from your Service Plan, "Present Next" automatically queues and presents the consecutive verses (e.g. Matthew 3:16 → Matthew 3:17 → 18...) and consecutive hymn stanzas (Stanza 1 → Stanza 2 → Stanza 3...).
2. **Auto-Updater Fix & Legacy Migration**: Solved the issue where older WorshipDesk installations could persist or interrupt updates with modal prompts; updates now install silently and reliably, and legacy shortcuts/data from v1.1.4 automatically migrate cleanly to WordDesk.
3. **Draggable Service Order Arrangement**: Reorganize service items effortlessly with drag-and-drop handles and visual drop target feedback.
4. **YouTube & Online Media Streaming**: Paste YouTube video URLs or web image links directly into the service plan with live thumbnail previews and audio routing.
5. **Freeze Prevention & System Stability**: Eliminated blocking modal alerts that froze search bars and inputs; replaced with non-blocking Sonner toasts.
6. **Documents Default Directory**: Open and Save service plan dialogs now default cleanly to the user's `Documents` folder.
7. **WordDesk Header Branding**: Unified presentation header branding to **WordDesk**.

---

## 1. Sequential Scripture & Hymn Progression in Service Planner

- **Sequential Bible Verses**: When you add a Bible verse (e.g., Matthew 3:16) to the Service Playlist and present it live, WordDesk automatically stages the next verse (Matthew 3:17) as **Next Staged**. Pressing **Present Next** (or Right Arrow / Page Down) smoothly broadcasts verse 17 and stages verse 18, continuing down the chapter with zero interruption to your service flow.
- **Sequential Hymn Stanzas**: Presenting a hymn from the playlist automatically initializes its stanzas, presenting Stanza 1 on air while staging Stanza 2. Subsequent advances seamlessly step through each stanza in order.
- **Parallel Translation Synchronization**: Bilingual parallel scripture displays remain synchronized throughout sequential progression.
- **Stage Monitor & Confidence Display Sync**: Live output and stage display confidence screens mirror the upcoming verse or stanza in real time.

---

## 2. Auto-Updater Reliability & Legacy "WorshipDesk" Migration

- **Why v1.1.4 Appeared to Revert**: When WordDesk was rebranded from WorshipDesk, v1.1.4 remained installed in its legacy application folder with existing desktop and taskbar shortcuts pointing to `worshipdesk.exe`. Clicking older pinned icons launched v1.1.4 instead of the new WordDesk.
- **Silent Background Installation**: Electron-updater now applies updates silently without modal prompt delays (`quitAndInstall(true, true)`), preventing installation cancellations.
- **Automatic Shortcut & Data Migration**: WordDesk now automatically detects legacy WorshipDesk desktop shortcuts and cleans them up, while migrating existing `church.db` SQLite databases, custom hymnals, and user preferences into the new WordDesk environment on first run.

---

## 3. Draggable Service Order Planning

- **Effortless Reordering**: Service schedule items can now be easily reordered via intuitive drag-and-drop handles (`FaGripVertical`).
- **Visual Drag Feedback**: Real-time visual feedback highlights the dragged item and target drop position.
- **Accessible Controls**: Maintained classic Move Up / Move Down buttons alongside drag-and-drop for maximum accessibility.

---

## 4. YouTube Video & Online Media Slides

- **Direct YouTube Video Streaming**: Users can now paste YouTube links (standard `watch?v=`, short `youtu.be/`, shorts, or 11-character video IDs) directly into the Service Planner to stream videos during church services when connected to the internet.
- **Web Image Support**: Support for pasting direct image URLs (JPG, PNG, WebP) with options to display full aspect ("Show whole") or cropped fill ("Fill screen").
- **Live Preview & Thumbnails**: Automatic video thumbnail previews in both the Service Planner modal and control rail preview cards.
- **Audio Routing**: YouTube audio seamlessly routes to the primary projector output window without echo.
- **Offline Resilience**: Graceful fallbacks and offline notices if the internet connection drops, ensuring the presenter never crashes or displays a blank error screen.

---

## 5. Eliminated Input & Search Bar Freeze (Native Non-Blocking Toasts)

- **Root Cause Fixed**: Previously, native synchronous dialogs (`window.alert` / `window.confirm`) in Electron temporarily detached Chromium's keyboard focus manager on Windows, leaving search bars, filter inputs, and modal textareas unresponsive to keystrokes after saving or loading plans.
- **Modern Sonner Toasts**: All playlist operations (saving, loading, clearing, reordering, and item updates) now use non-blocking in-app toasts. The application remains 100% interactive at all times.

---

## 6. Default Save & Open Directory: Documents

- **Documents Folder by Default**: Open and Save dialogs for WordDesk Service Plans (`.worship`, `.word`, `.json`) now open directly in the user's system `Documents` folder (`app.getPath('documents')`), replacing any unexpected fallback to `Downloads`.

---

## 7. Header Branding Alignment to "WordDesk"

- **Branding Migration**: Default branding text for the presentation header overlay and configuration input in Presentation Settings has been standardized to **WordDesk** instead of legacy "WorshipDesk", with automatic migration of existing local storage configurations.
