/**
 * CCLI SongSelect provider bridge (setup-required stub).
 *
 * CCLI SongSelect is a commercial catalog: live search/import requires a CCLI
 * organization account with API access under CCLI's terms
 * (https://songselect.ccli.com). LyricDisplay must not scrape SongSelect,
 * replay user sessions, or harvest credentials to work around that — so this
 * module registers the provider surface (definition + key storage + setup
 * guidance) and returns a clean disabled state until a sanctioned live
 * integration lands. Follow-up: implement OAuth/API search + import once CCLI
 * grants API access, then replace SETUP_REQUIRED with real calls.
 */

export const definition = {
  id: 'songselect',
  displayName: 'SongSelect (CCLI)',
  description:
    'CCLI SongSelect catalog for licensed chord/lyric import and CCLI reporting. ' +
    'Live access requires a CCLI organization account with API access — save your API key below, ' +
    'then see setup docs. No scraping, no credential reuse: only the official API.',
  requiresKey: true,
  homepage: 'https://songselect.ccli.com/',
  setupGuide: 'https://songselect.ccli.com/',
  supportedFeatures: {
    suggestions: false,
    search: false,
    lyrics: false,
    import: false,
  },
  availability: 'setup-required',
};

export const SETUP_REQUIRED_MESSAGE =
  'SongSelect live integration is not configured yet. ' +
  'It needs official CCLI API access for your organization (CCLI terms apply). ' +
  'Save your API key in Advanced Options, then watch the release notes — ' +
  'live search and licensed import will light up without any scraping or workarounds. ' +
  'Meanwhile, paste ChordPro text directly or export the CCLI usage CSV from any setlist.';

export async function search(query, { limit = 10 } = {}) {
  void query;
  void limit;
  return { results: [], errors: [SETUP_REQUIRED_MESSAGE] };
}

export async function getLyrics() {
  throw new Error(SETUP_REQUIRED_MESSAGE);
}
