import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Search, Loader2, Key, Music, AlertCircle, Globe, Plus } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import useToast from '../hooks/useToast';
import useRccgTphbStore from '../context/RccgTphbStore';
import useLyricsStore from '../context/LyricsStore';

const RccgTphbSongModal = ({ isOpen, onClose, darkMode, onImportLyrics, emitSetlistAdd, selectLine, emitLineUpdate, isDesktopApp }) => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [entering, setEntering] = useState(false);
  const [screen, setScreen] = useState('apikey');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activeSongId, setActiveSongId] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);

  const { apiKey, baseUrl, setApiKey, setBaseUrl, isConnected, setConnected, clearCredentials } = useRccgTphbStore();
  const { showToast } = useToast();
  const searchRef = useRef(null);
  const searchTimerRef = useRef(null);
  const abortRef = useRef(null);
  const animDuration = 220;

  const apiBase = baseUrl;

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setExiting(false);
      setEntering(true);
      const raf = requestAnimationFrame(() => setEntering(false));
      if (apiKey && baseUrl) {
        setScreen('search');
      } else {
        setScreen('apikey');
        setApiKeyInput(apiKey || '');
        setBaseUrlInput(baseUrl || '');
      }
      return () => cancelAnimationFrame(raf);
    }
    setEntering(false);
    setExiting(true);
    const timeout = setTimeout(() => {
      setExiting(false);
      setVisible(false);
    }, animDuration);
    return () => clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && screen === 'search' && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, screen]);

  const resetState = () => {
    setQuery('');
    setSongs([]);
    setTotal(0);
    setActiveSongId(null);
    setActiveAction(null);
    setOffset(0);
    setError(null);
    setApiKeyInput('');
    setBaseUrlInput('');
  };

  const verifyKey = async () => {
    const key = apiKeyInput.trim();
    const url = baseUrlInput.trim().replace(/\/+$/, '');
    if (!key || !url) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`${url}/api/songs?limit=1`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApiKey(key);
      setBaseUrl(url);
      setConnected(true);
      setScreen('search');
      showToast({ title: 'Connected', message: 'Successfully connected to RCCGTPHB DB.', variant: 'success' });
    } catch (err) {
      setError('Unable to connect. Check your API key and base URL.');
      setConnected(false);
    } finally {
      setVerifying(false);
    }
  };

  const searchSongs = useCallback(async (searchQuery, searchOffset = 0) => {
    if (!searchQuery.trim()) {
      setSongs([]);
      setTotal(0);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        search: searchQuery.trim(),
        limit: '20',
        offset: String(searchOffset),
      });
      const res = await fetch(`${apiBase}/api/songs?${params}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSongs(data.songs || []);
      setTotal(data.total || 0);
      setOffset(searchOffset);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError('Search failed. Please try again.');
        setSongs([]);
      }
    } finally {
      setLoading(false);
    }
  }, [apiBase, apiKey]);

  const handleSearchInput = (val) => {
    setQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setOffset(0);
      searchSongs(val, 0);
    }, 400);
  };

  const fetchSongLyrics = async (songId) => {
    const res = await fetch(`${apiBase}/api/songs/${songId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const importSong = async (songData, action) => {
    if (!onImportLyrics) return;
    const imported = await onImportLyrics({
      providerId: 'rccgtpb',
      providerName: 'RCCGTPHB DB',
      lyric: {
        content: songData.lyrics || '',
        title: songData.title || 'Untitled Song',
        artist: '',
        album: null,
        year: null,
      },
    });
    if (imported === false) return false;

    const title = songData.title || 'Untitled Song';

    if (action === 'display') {
      if (selectLine && emitLineUpdate) {
        setTimeout(() => {
          selectLine(0);
          emitLineUpdate(0);
        }, 50);
      }
    }

    if (action === 'setlist' && isDesktopApp && emitSetlistAdd) {
      const rawContent = useLyricsStore.getState().rawLyricsContent;
      if (rawContent) {
        emitSetlistAdd([{
          name: `${title}.txt`,
          content: rawContent,
          lastModified: Date.now(),
          metadata: { title, origin: 'RCCGTPHB DB' }
        }]);
      }
    }

    return true;
  };

  const handleSongClick = async (song) => {
    if (activeSongId) return;
    setActiveSongId(song.id);
    setActiveAction('display');
    setError(null);
    try {
      const songData = await fetchSongLyrics(song.id);
      const success = await importSong(songData, 'display');
      if (success !== false) {
        resetState();
        onClose?.();
      }
    } catch (err) {
      setError('Failed to load song.');
    } finally {
      setActiveSongId(null);
      setActiveAction(null);
    }
  };

  const handleAddToSetlist = async (e, song) => {
    e.stopPropagation();
    if (activeSongId) return;
    setActiveSongId(song.id);
    setActiveAction('setlist');
    setError(null);
    try {
      const songData = await fetchSongLyrics(song.id);
      const success = await importSong(songData, 'setlist');
      if (success !== false) {
        showToast({ title: 'Added to setlist', message: song.title, variant: 'success' });
      }
    } catch (err) {
      showToast({ title: 'Failed', message: 'Could not load song.', variant: 'error' });
    } finally {
      setActiveSongId(null);
      setActiveAction(null);
    }
  };

  const handleClose = () => {
    resetState();
    onClose?.();
  };

  const handleDisconnect = () => {
    clearCredentials();
    resetState();
    setScreen('apikey');
  };

  if (!visible) return null;

  const modalClasses = [
    'rounded-2xl border shadow-2xl ring-1 w-[90vw] max-w-2xl mx-4',
    'flex flex-col h-[650px]',
    darkMode ? 'bg-gray-900 text-gray-50 border-gray-800 ring-blue-500/35' : 'bg-white text-gray-900 border-gray-200 ring-blue-500/20',
    'transition-all duration-200 ease-out',
    (exiting || entering) ? 'opacity-0 translate-y-8 scale-95' : 'opacity-100 translate-y-0 scale-100',
  ].join(' ');

  const topMenuHeight = typeof document !== 'undefined'
    ? (getComputedStyle(document.body).getPropertyValue('--top-menu-height')?.trim() || '0px')
    : '0px';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ top: topMenuHeight }}>
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${(exiting || entering) ? 'opacity-0' : 'opacity-100'}`}
        onClick={handleClose}
      />
      <div className={modalClasses}>
        <div className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              RCCGTPHB Song Database
            </h2>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {screen === 'apikey' ? 'Enter your API credentials to connect' : 'Click a song to display it'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {screen !== 'apikey' && (
              <Tooltip content={isConnected ? 'Connected' : 'Not connected'}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors ${
                  isConnected
                    ? (darkMode ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700')
                    : (darkMode ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700')
                }`}>
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
              </Tooltip>
            )}
            <button
              onClick={handleClose}
              className={`p-1.5 rounded-md transition-colors ${darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {screen === 'apikey' && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${darkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                <Key className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div className="text-center">
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Connect to RCCGTPHB DB
                </h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Enter the API base URL and your API key
                </p>
              </div>
              <div className="w-full max-w-sm space-y-3">
                <div>
                  <label className={`text-xs font-medium mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    API Base URL
                  </label>
                  <Input
                    type="url"
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                    placeholder="https://your-api-url.com"
                    className={darkMode ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500 h-10' : 'h-10'}
                  />
                </div>
                <div>
                  <label className={`text-xs font-medium mb-1 block ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    API Key
                  </label>
                  <Input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && verifyKey()}
                    placeholder="sk_live_..."
                    className={darkMode ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500 h-10' : 'h-10'}
                  />
                </div>
                {error && (
                  <div className={`flex items-center gap-2 text-sm ${darkMode ? 'text-red-400' : 'text-red-600'}`}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <Button
                  onClick={verifyKey}
                  disabled={!apiKeyInput.trim() || !baseUrlInput.trim() || verifying}
                  className="w-full h-10"
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                  {verifying ? 'Verifying...' : 'Connect'}
                </Button>
              </div>
            </div>
          )}

          {screen === 'search' && (
            <div className="space-y-4">
              <div className="relative">
                <Input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  placeholder="Search songs by title or lyrics..."
                  className={darkMode ? 'border-gray-700 bg-gray-800 text-white placeholder-gray-500 pr-10 h-10' : 'pr-10 h-10'}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(''); setSongs([]); setTotal(0); }}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                      darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className={`w-6 h-6 animate-spin ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </div>
              )}

              {error && !loading && (
                <div className={`rounded-md border px-4 py-3 ${darkMode ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'}`}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className={`w-4 h-4 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                    <span className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-700'}`}>{error}</span>
                  </div>
                </div>
              )}

              {!loading && songs.length > 0 && (
                <div className="space-y-1">
                  <p className={`text-xs font-medium ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {total} result{total === 1 ? '' : 's'}
                  </p>
                  <div className={`rounded-lg border divide-y ${darkMode ? 'border-gray-700 divide-gray-700' : 'border-gray-200 divide-gray-200'}`}>
                    {songs.map((song) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        darkMode={darkMode}
                        isActive={activeSongId === song.id}
                        activeAction={activeAction}
                        onClick={() => handleSongClick(song)}
                        onAddToSetlist={(e) => handleAddToSetlist(e, song)}
                        isDesktopApp={isDesktopApp}
                      />
                    ))}
                  </div>
                  {songs.length < total && (
                    <button
                      onClick={() => searchSongs(query, offset + 20)}
                      className={`w-full text-sm py-2 underline underline-offset-4 ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                    >
                      Load more ({total - songs.length} remaining)
                    </button>
                  )}
                </div>
              )}

              {!loading && query && songs.length === 0 && !error && (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No songs found for "{query}"</p>
                </div>
              )}

              {!query && songs.length === 0 && (
                <div className={`text-center py-12 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Type to search the RCCGTPHB song database</p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleDisconnect}
                  className={`text-xs underline underline-offset-4 ${darkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  Disconnect & change credentials
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const SongRow = ({ song, darkMode, isActive, activeAction, onClick, onAddToSetlist, isDesktopApp }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={!isActive ? onClick : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors cursor-pointer ${
        isActive
          ? darkMode ? 'bg-blue-500/10' : 'bg-blue-50'
          : darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
      }`}
    >
      <Music className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium truncate ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {song.title}
        </p>
        {song.slug && (
          <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {song.slug}
          </p>
        )}
      </div>
      {isActive ? (
        <Loader2 className={`w-4 h-4 animate-spin flex-shrink-0 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
      ) : (
        hovered && isDesktopApp && (
          <Tooltip content="Add to setlist" side="left">
            <button
              onClick={onAddToSetlist}
              className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                darkMode
                  ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </Tooltip>
        )
      )}
    </div>
  );
};

export default RccgTphbSongModal;
