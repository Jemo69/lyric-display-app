# Lite Mode Proposal for Older Devices

## Goal

Make LyricDisplay easier and faster to run on older phones, tablets, laptops, and low-power computers by adding a lightweight interface that avoids heavy UI, unnecessary animations, and large feature bundles.

## Problem

The full LyricDisplay app is designed for desktop operators and includes many powerful features: output settings, modals, templates, Bible tools, imports, previews, online search, and editing tools. These are useful on the main computer, but older devices may struggle with the full interface.

Older devices need a smaller, simpler experience focused only on live control.

## Proposed Solution

Add a dedicated **Lite Mode** route for low-power devices.

Suggested route:

```txt
/lite
```

Lite Mode would be a separate lightweight controller that loads only the features needed during a live service.

## Lite Mode Features

### Core Controls

- Show current song name
- Show current lyric line
- Show next lyric line
- Previous line button
- Next line button
- Output on/off toggle
- Connection status
- Simple lyric list for direct line selection

### Optional Controls

- Blank screen toggle
- Reload current state
- Basic stage/output status
- Larger touch-friendly buttons for older tablets and phones

## What Lite Mode Should Avoid

Lite Mode should not load or include heavy desktop features unless absolutely needed.

Avoid:

- Full output settings panel
- Font picker
- Color picker
- Templates editor
- Bible browser
- Online lyrics search
- Setlist editor
- Preview output modal
- Import tools
- Heavy animations
- Blur effects
- Large shadows
- Complex nested layouts

## Technical Plan

### 1. Create a New Route

Add a new route in `src/App.jsx`:

```jsx
<Route path="/lite" element={<LiteController />} />
```

The `LiteController` component should be lazy-loaded so it does not affect the main app startup bundle.

### 2. Create a Lightweight Controller Component

Create:

```txt
src/pages/LiteController.jsx
```

This component should:

- Connect to the socket
- Receive current lyrics state
- Show only essential controls
- Emit line changes
- Emit output toggle changes
- Use minimal local state

### 3. Keep the UI Simple

Use plain layout and minimal styling:

- No complex modals
- No animated transitions
- No expensive visual effects
- Large buttons
- High contrast
- Simple scrolling lyric list

### 4. Add Low Power Styling

Add a low-power class or CSS mode that disables visual effects:

```css
.low-power * {
  animation: none !important;
  transition: none !important;
  backdrop-filter: none !important;
  box-shadow: none !important;
}
```

This can be applied automatically on Lite Mode.

### 5. Reduce Socket Work

Lite Mode should subscribe only to events it needs:

- current state
- lyric line updates
- lyrics load
- output toggle
- connection status

It should not listen to style editor updates unless they are needed for display.

## Expected Benefits

- Faster load time on older devices
- Lower memory usage
- Smoother button response
- Less battery drain on phones and tablets
- More reliable remote control during live services
- Keeps the full desktop app powerful without slowing down low-power clients

## Recommended First Version

Build the first version with only:

1. Connection status
2. Current song name
3. Current lyric line
4. Previous button
5. Next button
6. Output on/off button
7. Simple lyric list

After that works well, add optional features carefully.

## Success Criteria

Lite Mode is successful if:

- It loads noticeably faster than the full app
- It works smoothly on older phones and tablets
- It can control lyrics during a service without lag
- It does not increase the main desktop bundle size
- Operators can understand it without training

## Future Improvements

- Auto-detect older devices and suggest Lite Mode
- Add a QR code specifically for Lite Mode
- Add a setting: “Use Lite Mode for mobile controllers”
- Add offline-friendly reconnect behavior
- Add an ultra-simple stage-only viewer
