# Off Screen Image Mode Implementation

## Summary

This feature implements an "off screen image mode" that allows users to specify a dedicated image (or video) that displays when the output screen is turned off, while preserving the ability to show the fullscreen background when the output is active.

## Key Features

1. **Off Screen Background Option**: Added a new setting "Show background when output is off" that allows users to select an image/video to display when the screen is off

2. **Separate Image for Off Screen**: Created an "Off Screen Background" option that is independent of the regular fullscreen background setting, showing when:
   - Output is turned off (screen is black)
   - No lyrics are being displayed
   - The user has configured an off-screen image

3. **Preserved On Screen Experience**: When the output is active and displaying lyrics, the regular fullscreen background continues to work as before (based on the existing "Always Show Background" setting)

4. **Consistent Across All Outputs**: Implemented for both regular outputs (Output 1, Output 2) and stage display

## Implementation Details

### 1. New Settings in Output Settings Panel

Added two new settings in the Output Settings Panel (Output1, Output2, Stage):

**For Regular Outputs:**
- "Show Background When Output is Off" (Output 1, Output 2)
- "Off Screen Background" (file selector for image/video)

**For Stage Display:**
- "Show Background When Output is Off" (Stage)
- "Off Screen Background" (file selector for image/video)

### 2. Modified Background Display Logic

**RegularOutput.jsx:**
- Updated `shouldShowFullScreenBackground` logic to consider both `alwaysShowBackground` and `isOutputActive` states
- Added new `shouldShowOffScreenBackground` logic for off-screen display

**StageOutput.jsx:**
- Similar updates to support off-screen background functionality

### 3. New Component: OffScreenBackgroundDisplay

Created a new component that handles the display of off-screen images:
- Shows when output is inactive and no lyrics are being displayed
- Uses the same media player (video/image) as regular fullscreen background
- Handles fallback scenarios (no image selected)

### 4. Updated Styling and UX

**User Interface Changes:**
- Added "Off Screen" tab/section in the background settings
- Clear visual distinction between "On Screen" and "Off Screen" backgrounds
- Consistent button labels and tooltips
- Improved tooltip text to clarify the purpose

**Visual Indicators:**
- Shows different indicators when off-screen background is active
- Clear labeling to distinguish between the two background types

## Files Modified

1. **src/pages/RegularOutput.jsx**
   - Updated background display logic
   - Added off-screen background state management
   - Implemented new background display component

2. **src/pages/StageOutput.jsx**
   - Similar updates for stage output
   - Integrated off-screen background functionality

3. **src/components/OutputSettingsPanel.jsx**
   - Added "Off Screen Background" section
   - New toggle for "Show Background When Output is Off"
   - File selector for off-screen image/video

4. **src/components/StageSettingsPanel.jsx**
   - Same updates as OutputSettingsPanel for consistency

5. **src/hooks/OutputSettingsPanel/useFullscreenBackground.js**
   - Enhanced to support both on-screen and off-screen backgrounds
   - Added validation and upload handling for off-screen media

6. **src/utils/outputs.js**
   - Updated output settings handling to support new off-screen settings
   - Modified output cloning logic to include off-screen settings

## Usage Instructions

### Setting Up Off Screen Background

1. Open the Output Settings Panel for the desired output (Output 1, Output 2, or Stage)
2. Navigate to the "Background" section
3. Click the "Off Screen" tab (or section, depending on implementation)
4. Toggle "Show Background When Output is Off" to enable
5. Click "Add File" to select an image or video file for the off-screen display
6. The selected file will be uploaded and available for display when the output is turned off

### Selecting Media Types

- **Images**: Supported formats: JPG, JPEG, PNG, GIF, WebP, AVIF
- **Videos**: Supported formats: MP4, WebM, OGG, QuickTime
- **Maximum file size**: 200MB per file
- **Aspect ratio**: No specific requirements, will be scaled to fit

### Behavior When Output is Off

When the output is turned off and no lyrics are being displayed:
1. If an off-screen background is configured and enabled, it will be displayed
2. The image/video will fill the entire screen
3. For videos, they will loop continuously with muted audio
4. For images, they will be displayed statically
5. This happens regardless of the regular fullscreen background settings

## Benefits

1. **Consistent Worship Experience**: When the screen is off, worshippers can still see the worship theme/background
2. **Flexibility**: Separate control over on-screen and off-screen backgrounds
3. **Professional Appearance**: Prevents the screen from appearing completely blank when turned off
4. **Easy Management**: Media can be uploaded and managed through the familiar interface
5. **Backward Compatible**: Existing functionality is preserved

## Testing

To test the off screen image mode:

1. **Setup Test Environment**
   - Ensure backend server is running
   - Start the application

2. **Test Setup**
   - Go to Output Settings Panel for a specific output
   - Select "Off Screen" background settings
   - Upload an image or video file
   - Enable "Show Background When Output is Off"

3. **Test Display**
   - Turn on the output display and load lyrics to verify normal behavior
   - Turn off the output to verify off-screen background displays
   - Test with different media types (image vs video)

4. **Edge Cases**
   - Test with no media selected
   - Test with media selected but toggle disabled
   - Test switching between outputs
   - Test with stage output vs regular output

## Notes

1. **Performance**: Large video files will be preloaded as per existing implementation to ensure smooth display
2. **Fallback**: If the off-screen media fails to load, a simple colored background will be shown
3. **Permissions**: Background media upload requires appropriate permissions, handled by existing authentication system
4. **Storage**: Off-screen media follows the same storage and cleanup patterns as regular background media
5. **Dependency**: Requires backend API endpoints for media upload and retrieval

## Future Enhancements (Optional)

1. **Timed Transitions**: Ability to fade between on-screen and off-screen backgrounds
2. **Multiple Off Screen Images**: Support for cycling through multiple images when screen is off
3. **Custom Overlays**: Option to add custom overlays or text to off-screen displays
4. **Control Integration**: Integration with existing control panel for off-screen image control
5. **Preview Mode**: Preview of off-screen background in control panel