# Bible Logic and Performance Analysis

This document details how the Bible functionality works in this application, identifies current performance bottlenecks, and proposes solutions for optimization.

## 1. Bible Logic Overview

### Data Structure
Bibles are stored as hierarchical JSON objects:
- **Bible**: Contains metadata (name, id) and an array of `books`.
- **Book**: Contains `number`, `name`, `abbreviation`, and an array of `chapters`.
- **Chapter**: Contains `number` and an array of `verses`.
- **Verse**: Contains `number` and the `text`.

### Import Process
1. **Selection**: User selects an XML or JSON file in `BibleImportModal`.
2. **Parsing**: `parseBibleFromFile` (in `shared/bible/index.js`) reads the file and detects the format (Zefania, OSIS, Beblia, or OpenSong).
3. **Storage**: The parsed Bible is added to `BibleStore` (Zustand).

### Storage Mechanism
Currently, `BibleStore` uses the Zustand `persist` middleware with the default `localStorage` engine. This means:
- The entire Bible library is serialized into a JSON string and saved to the browser's `localStorage`.
- Every time a Bible is added or modified, the entire library is rewritten to disk.

### Search Mechanism
Search is implemented in `shared/bible/index.js`:
- **Reference Search**: Uses Regex to detect patterns like "John 3:16" and quickly jumps to the verse.
- **Full-Text Search**: If no reference is matched, it performs a nested loop through every book, chapter, and verse of the active Bible (and potentially others) to find matching text.

---

## 2. Identified Slowdowns (Performance Bottlenecks)

### A. LocalStorage Synchronization
`localStorage` is a **synchronous** API and has a strict size limit (usually 5MB - 10MB).
- **Issue**: A single Bible (e.g., KJV) can be 4-5MB. Importing 2-3 Bibles will exceed the storage limit, causing the app to fail to save data.
- **Impact**: Every time the store updates, the main thread blocks while the browser writes several megabytes of text to disk. This causes the "stuttering" or "freezing" when switching versions or importing.

### B. Main-Thread Search
Searching is performed on the **main UI thread**.
- **Issue**: Iterating through ~31,000 verses (for one Bible) to perform string matching is CPU-intensive.
- **Impact**: The UI becomes unresponsive (the "slow down") during the search process, especially on older hardware.

### C. Memory Overhead
- **Issue**: The application keeps all imported Bibles in the React state at all times.
- **Impact**: High RAM usage, which can lead to browser tab crashes on low-end devices.

---

## 3. Recommended Solutions

### 1. Migrate to IndexedDB
**Replace `localStorage` with IndexedDB for Bible storage.**
- **Why**: IndexedDB is asynchronous and has much higher storage limits (hundreds of MBs).
- **Action**: Use a library like `idb-keyval` or `localforage` as the custom storage engine for Zustand's `persist` middleware.

### 2. Offload Search to Web Workers
**Move the `searchBible` logic to a background worker.**
- **Why**: This keeps the UI thread free and responsive while the search is processing.
- **Action**: Create a `bibleSearch.worker.js` that receives the query and Bible data, performs the search, and posts the results back to the main thread.

### 3. Implement Virtualized Lists
**Use virtualization for the Bible Browser and Search Results.**
- **Why**: Rendering hundreds of DOM nodes for search results or long chapters is slow.
- **Action**: Use `react-window` or `react-virtuoso` to only render the verses currently visible on the screen.

### 4. Search Index Optimization
**Improve the `buildSearchIndex` function.**
- **Why**: The current "index" is a simple Map that isn't fully utilized for complex queries.
- **Action**: Use a lightweight full-text search library like `FlexSearch` or `MiniSearch` inside the Web Worker for near-instant results.

### 5. On-Demand Loading
**Only load the active Bible into memory.**
- **Why**: No need to keep 10 Bibles in RAM if the user is only reading one.
- **Action**: Store Bible metadata (names/IDs) in the main store, and fetch the actual verse content from IndexedDB only when the Bible becomes active.
