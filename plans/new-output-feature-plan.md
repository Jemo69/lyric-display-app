# New Custom Output Feature Plan

## Goal

Add a way to create a new output display by entering an output name. After creation, visiting `/<outputname>` opens that display. The user chooses whether the new display is a regular output or a stage display, then the app copies settings from an existing display of that same type. The new output should behave like the copied display type, with its own route, settings, enabled state, socket sync, media backgrounds, and live lyric updates.

## Interpretation of the Feature

1. User opens the control panel and clicks **New Output**.
2. App asks for:
   - **Output name**: shown as a human label and converted to a URL slug.
   - **Display type**: `Regular` or `Stage`.
   - **Copy settings from**:
     - Regular can copy from Output 1, Output 2, or another regular custom output.
     - Stage can copy from Stage or another stage custom output.
3. If the user creates `Main Screen`, the app shows the URL as `/main-screen`.
4. Visiting `/main-screen` renders the same display behavior as the chosen type.
5. After creation, the new output can be selected in the settings tabs and adjusted independently.

## Current Code Findings

The app is mostly hardcoded around three display keys:

- `output1`
- `output2`
- `stage`

Important files currently tied to these keys:

- `src/App.jsx`: routes `/output1`, `/output2`, and `/stage` are hardcoded.
- `src/pages/Output1.jsx` and `src/pages/Output2.jsx`: almost identical regular output renderers.
- `src/pages/Stage.jsx`: hardcoded stage renderer.
- `src/context/LyricsStore.js`: persisted settings and enabled flags exist only for `output1`, `output2`, and `stage`.
- `src/hooks/useStoreSelectors.js`: selectors exist only for the three built-in displays.
- `src/components/LyricDisplayApp.jsx`: settings tabs are hardcoded.
- `src/components/OutputSettingsPanel.jsx`: assumes only `output1`, `output2`, or `stage`.
- `server/events.js`: socket state stores settings and enabled state for only the three built-in displays.
- `server/index.js`: valid socket client types and background media cleanup are limited to `output1`, `output2`, and `stage`.
- `main/ipc.js`, `main/windows.js`, `main/cleanup.js`, `main/startup.js`, and `main/displayDetection.js`: Electron output windows and display assignment logic are route-key hardcoded.

## Proposed Data Model

Keep built-in displays for backward compatibility, but add a dynamic output registry.

```js
customOutputs: [
  {
    id: 'custom_main-screen',
    name: 'Main Screen',
    slug: 'main-screen',
    type: 'regular',
    sourceOutputKey: 'output1',
    createdAt: 1710000000000,
    updatedAt: 1710000000000
  }
]

customOutputSettings: {
  'custom_main-screen': { ...copiedRegularSettings }
}

customOutputEnabled: {
  'custom_main-screen': true
}
```

Built-in outputs stay available as normalized output definitions:

- `output1`: slug `output1`, type `regular`
- `output2`: slug `output2`, type `regular`
- `stage`: slug `stage`, type `stage`

This allows old settings to keep working while new screens can use the same generic code path.

## URL and Naming Rules

- Convert the output name into a slug:
  - Trim whitespace.
  - Lowercase.
  - Replace spaces with single hyphens.
  - Remove unsafe URL characters.
- Show the route preview before creation: `/<slug>`.
- Block duplicate slugs.
- Reserve existing app routes:
  - `/`
  - `/output1`
  - `/output2`
  - `/stage`
  - `/new-song`
- If exact URL naming is important, add an editable **URL name** field beside the display name.

## Implementation Phases

### 1. Add Output Registry Helpers

Create shared helpers, likely in `src/utils/outputs.js`:

- `slugifyOutputName(name)`
- `isReservedOutputSlug(slug)`
- `getBuiltInOutputs()`
- `getAllOutputs(state)`
- `findOutputBySlug(state, slug)`
- `getOutputSettings(state, outputKey)`
- `getOutputEnabled(state, outputKey)`
- `cloneSettingsForType(type, sourceOutputKey, state)`

These helpers prevent spreading dynamic-output logic across the app.

### 2. Extend Zustand Store

Update `src/context/LyricsStore.js`:

- Add `customOutputs`, `customOutputSettings`, and `customOutputEnabled`.
- Add actions:
  - `createCustomOutput({ name, slug, type, sourceOutputKey })`
  - `updateCustomOutputSettings(outputKey, partialSettings)`
  - `setCustomOutputEnabled(outputKey, enabled)`
  - `renameCustomOutput(outputKey, name, slug)`
  - `deleteCustomOutput(outputKey)`
- Persist the custom output registry and settings in the existing `lyrics-store` persistence.
- Keep built-in `output1Settings`, `output2Settings`, and `stageSettings` unchanged for migration safety.

### 3. Refactor Output Renderers

Replace the duplicate regular output pages with one parameterized component:

- New file: `src/pages/RegularOutput.jsx`
- Props:
  - `outputKey`
  - `displayName`
  - `settings`
  - `enabled`
  - `updateSettings`

Then make wrappers:

- `Output1.jsx` renders `RegularOutput` with `outputKey="output1"`.
- `Output2.jsx` renders `RegularOutput` with `outputKey="output2"`.
- Dynamic regular routes render the same component with the custom output key.

Refactor `Stage.jsx` the same way:

- Keep `Stage.jsx` as the built-in wrapper.
- Extract the real renderer to `StageOutput.jsx`.
- Pass `outputKey`, settings, and enabled state into it.

### 4. Add Dynamic Route Resolution

Update `src/App.jsx`:

- Keep existing explicit routes for `/`, `/output1`, `/output2`, `/stage`, and `/new-song`.
- Add a catch route like `/:outputName`.
- The route component should:
  1. Resolve the slug against the output registry.
  2. If it is a regular display, render `RegularOutput`.
  3. If it is a stage display, render `StageOutput`.
  4. If not found, show a quiet full-screen message: `Output not found`.

Important: external browser sources may not share the control panel local storage, so route resolution should not rely only on local persisted state. Add a small server endpoint that returns only public output metadata:

- `GET /api/outputs/resolve/:slug`
- Response: `{ id, name, slug, type }`

The display page can use that type to authenticate as the correct socket client before joining live sync.

### 5. Update Socket and Server State

Update `server/events.js`:

- Add server-side state for custom outputs:
  - `customOutputs`
  - `currentCustomOutputSettings`
  - `currentCustomOutputEnabled`
- Add socket events:
  - `outputRegistryUpdate`
  - `customOutputCreate`
  - `customOutputDelete`
- Include custom output data in `buildCurrentState()`.
- Let `styleUpdate` accept any known output key, not only the three built-ins.
- Let `individualOutputToggle` accept any known output key.
- Let `outputMetrics` accept custom regular output keys.

Update `server/index.js`:

- Add the output resolve endpoint.
- Allow background upload cleanup for safe custom output keys, for example lowercase letters, numbers, and hyphens.
- Keep socket client types simple:
  - Regular custom outputs authenticate with the existing regular output permission profile.
  - Stage custom outputs authenticate with the existing stage permission profile.

### 6. Update Client Socket Hooks

Update `src/hooks/useSocket.js` and `src/hooks/useSocketEvents.js`:

- Add support for `outputKey` separate from socket `clientType`.
- Regular custom output page:
  - client type can map to existing regular output permissions.
  - event output key is the custom id.
- Stage custom output page:
  - client type maps to stage permissions.
  - event output key is the custom id.
- When receiving `styleUpdate`, update the correct built-in or custom settings object.
- When receiving `individualOutputToggle`, update the correct built-in or custom enabled flag.

### 7. Add Control Panel Creation UI

Update `src/components/LyricDisplayApp.jsx` near the output settings tabs:

- Add a **New Output** button beside the tabs.
- Open a compact create panel or modal with:
  - Output name input.
  - URL preview.
  - Display type select: Regular, Stage.
  - Copy settings from select filtered by type.
  - Create button.
- After create:
  - Clone the selected source settings.
  - Add the new output to the registry.
  - Emit the registry and settings to the server.
  - Select the new output tab.
  - Show a success toast with **Copy URL** and **Open Output** actions.

### 8. Make Settings Panel Generic

Update `src/components/OutputSettingsPanel.jsx`:

- Stop branching only on `output1`, `output2`, and `stage`.
- Use output metadata to decide whether the panel is regular or stage.
- Use generic store actions for custom outputs.
- Show labels using the display name, not only `Output 1`, `Output 2`, or `Stage`.
- Keep existing built-in behavior unchanged.

Also check these related pieces:

- `useAdvancedSectionPersistence(outputKey)` should work with custom keys.
- `useFullscreenBackground({ outputKey })` should work with custom media filenames.
- `OutputTemplatesModal` should support dynamic regular output keys.
- `StageTemplatesModal` should support dynamic stage output keys.
- `SaveTemplateModal` can keep using `templateType: 'output'` or `templateType: 'stage'` based on display type.

### 9. Update Manual Sync and Preview

Update `src/hooks/useSyncOutputs.js`:

- Sync all built-in and custom output settings.
- Sync custom enabled states.
- Include stage settings in manual sync, since the current hook only handles Output 1 and Output 2.

Update `src/components/PreviewOutputsModal.jsx`:

- Replace the fixed two-preview layout with either:
  - a selectable preview target, or
  - a grid generated from all regular outputs.
- Include custom output URLs with `?preview=true`.
- Stage previews can be added as a second section if needed.

### 10. Update Electron Window and Display Assignment Support

Update Electron files so custom output routes behave like output windows:

- `main/windows.js`
  - Do not detect output windows only by `/output` or `/stage`.
  - Add an explicit option like `createWindow(route, { outputWindow: true })`.
- `main/ipc.js`
  - Add a generic open output API that receives `{ route, outputKey }`.
  - Update display assignment handlers to use route metadata instead of mapping only three keys.
- `main/displayDetection.js`
  - Include custom outputs in the display assignment dropdown.
- `main/cleanup.js` and `main/startup.js`
  - Close output windows by window metadata or explicit output-window flag, not hardcoded routes.
- `preload.js`
  - Expose any new generic output window APIs needed by the renderer.

This keeps `/main-screen` transparent and frameless like the existing output windows.

## UX Details

- Use a restrained inline creation flow that fits the control panel style.
- The URL preview should be immediate and clear.
- Validation should happen before the user clicks Create.
- Error messages should be direct:
  - `Name is required.`
  - `That output URL already exists.`
  - `This URL is reserved by the app.`
- After creation, show the new tab selected so the operator can verify settings immediately.
- Include a copy URL action because OBS and browser-source setup often needs the exact route.

## Edge Cases

- Duplicate output name or slug.
- Empty or unsafe output name.
- Route collides with app pages.
- Output deleted while browser source is open.
- Server restarted before custom registry syncs from the control panel.
- Browser source opens before the control panel has synced custom outputs.
- Custom stage outputs need stage timer and message behavior. If they must be independent, parameterize stage auxiliary events by `outputKey`; if they can share the default stage timer and messages, document that clearly.
- Background media cleanup should not delete media belonging to other custom outputs.
- Importing old persisted stores should not break existing Output 1, Output 2, or Stage.

## Testing Checklist

### Regular Output

- Create `Main Screen` as Regular copied from Output 1.
- Visit `/main-screen` and confirm it shows current lyrics.
- Change font size, color, background, transitions, and media background.
- Confirm Output 1 does not change after editing Main Screen.
- Toggle Main Screen off while other outputs remain on.
- Confirm manual sync updates Main Screen.
- Confirm `?preview=true` works.

### Stage Output

- Create `Choir Monitor` as Stage copied from Stage.
- Visit `/choir-monitor` and confirm current, next, and previous lines render like Stage.
- Change live line, next line, top bar, bottom bar, and background settings.
- Confirm Stage does not change after editing Choir Monitor.
- Confirm timer, custom messages, and upcoming song behavior matches the chosen stage strategy.

### Routing and Persistence

- Reload the control panel and confirm custom outputs remain.
- Restart the server and confirm the control panel re-syncs custom outputs.
- Open the custom route in a new browser profile or OBS browser source.
- Try reserved names and duplicates.
- Delete a custom output and confirm its route shows `Output not found`.

### Electron

- Open custom output in a separate window.
- Assign custom output to an external display.
- Close the main window and confirm custom output windows close.
- Confirm custom output windows are transparent when they should be.

## Suggested Build Order

1. Add output registry and store actions.
2. Extract generic regular and stage output renderers.
3. Add dynamic route resolution.
4. Add server-side custom output state and socket events.
5. Add New Output UI in the control panel.
6. Make settings panel generic.
7. Update media upload, templates, preview, and manual sync.
8. Update Electron display/window support.
9. Run full regular and stage testing.

## Acceptance Criteria

- User can create a named output from the control panel.
- The app gives the user a route like `/<outputname>`.
- The new output can be Regular or Stage.
- The new output starts with copied settings from the selected display type.
- The new output can be edited independently.
- The new route renders live lyrics and listens to socket updates.
- Built-in `/output1`, `/output2`, and `/stage` continue to work exactly as before.
