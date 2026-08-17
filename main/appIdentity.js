// Local minimal port of upstream main/appIdentity.js.
// LOCAL WINS: upstream bundled NDI companion management and user-data
// migration in this module; those features are intentionally not ported.
// Only the identity constants consumed by the file navigator are kept.

export const APP_NAME = 'LyricDisplay';
export const LEGACY_APP_NAME = 'lyric-display-app';
export const LEGACY_EASYWORSHIP_IMPORT_FOLDER_NAME = 'Imported Songs from EW';
export const EASYWORSHIP_IMPORT_FOLDER_NAME = 'Imported Lyrics from EW';
export const PRESENTATION_IMPORT_FOLDER_NAME = 'Imported Lyrics from Presentations';