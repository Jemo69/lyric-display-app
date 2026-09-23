import React, { useState, useMemo } from 'react';
import { FolderOpen, FileText, Database, Search, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronDown, MonitorPlay, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PresentationImport');

const STEPS = { SOURCE: 0, PREVIEW: 1, DONE: 2 };

const hasBridge = () => Boolean(window?.electronAPI?.presentation?.browseFiles);

let localId = 0;
const withIds = (songs) => (songs || []).map((song) => ({ ...song, _id: `doc-${Date.now()}-${localId++}` }));

export default function PresentationImportModal({ isOpen, onClose, darkMode, onImportLyrics, emitSetlistAdd, isDesktopApp }) {
    const [currentStep, setCurrentStep] = useState(STEPS.SOURCE);
    const [sourceTab, setSourceTab] = useState('files');
    const [ewVersion, setEwVersion] = useState('7');
    const [ewPath, setEwPath] = useState('');
    const [songs, setSongs] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [expanded, setExpanded] = useState(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [loadingLabel, setLoadingLabel] = useState('');
    const [error, setError] = useState('');
    const [notices, setNotices] = useState([]);
    const [doneSummary, setDoneSummary] = useState(null);

    if (!isOpen) return null;

    const reset = () => {
        setCurrentStep(STEPS.SOURCE);
        setSongs([]);
        setSelected(new Set());
        setSearchQuery('');
        setExpanded(new Set());
        setEwPath('');
        setError('');
        setNotices([]);
        setDoneSummary(null);
    };

    const handleClose = () => {
        if (isLoading) return;
        reset();
        onClose();
    };

    const collect = (list) => {
        const items = withIds(list);
        setSongs(items);
        setSelected(new Set(items.map((s) => s._id)));
        setCurrentStep(STEPS.PREVIEW);
    };

    const handleBrowseFiles = async () => {
        setError('');
        setNotices([]);
        try {
            const picked = await window.electronAPI.presentation.browseFiles();
            if (!picked || picked.canceled || !picked.success) return;
            setIsLoading(true);
            const imported = [];
            const problems = [];
            for (const filePath of picked.files || []) {
                setLoadingLabel(filePath.split(/[\\/]/).pop() || 'Reading file…');
                try {
                    const result = await window.electronAPI.presentation.importFile(filePath);
                    if (result?.success && result.song) {
                        imported.push({ ...result.song, source: { ...result.song.source, filePath } });
                    } else {
                        problems.push(`${filePath.split(/[\\/]/).pop()}: ${result?.error || 'Could not read this file.'}`);
                    }
                } catch (err) {
                    problems.push(`${filePath}: ${err?.message || 'Could not read this file.'}`);
                }
            }
            setNotices(problems);
            if (imported.length === 0) {
                setError(problems.length > 0 ? problems[0] : 'No songs found in the chosen files.');
            } else {
                collect(imported);
            }
        } catch (err) {
            logger.error('Browse files failed', err);
            setError('Could not open the file picker. Please try again.');
        } finally {
            setIsLoading(false);
            setLoadingLabel('');
        }
    };

    const handleBrowseEwPath = async () => {
        setError('');
        try {
            const picked = await window.electronAPI.presentation.browseEw(ewVersion);
            if (!picked || picked.canceled || !picked.success) return;
            setEwPath(picked.path || '');
        } catch (err) {
            logger.error('Browse EW path failed', err);
            setError('Could not open the picker. Please try again.');
        }
    };

    const handleLoadEw = async () => {
        if (!ewPath.trim()) {
            setError('Choose your EasyWorship library location first.');
            return;
        }
        setError('');
        setNotices([]);
        setIsLoading(true);
        setLoadingLabel('Reading EasyWorship library… This can take a moment.');
        try {
            const result = await window.electronAPI.presentation.importEw(ewPath.trim(), ewVersion);
            if (result?.success && Array.isArray(result.songs) && result.songs.length > 0) {
                const extra = [];
                if (result.truncated) extra.push('Large library: showing the first songs only.');
                if (result.fieldMap && ewVersion === '2009') {
                    extra.push(`2009 fields used — title: ${result.fieldMap.title || '?'}, author: ${result.fieldMap.author || '?'}, lyrics: ${result.fieldMap.lyrics || '?'}.`);
                }
                setNotices(extra);
                collect(result.songs);
            } else {
                setError(result?.error || 'No songs found in this library.');
            }
        } catch (err) {
            logger.error('Load EW library failed', err);
            setError('Could not read this library. Please check the location and try again.');
        } finally {
            setIsLoading(false);
            setLoadingLabel('');
        }
    };

    const filteredSongs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return songs;
        return songs.filter((s) =>
            s.title?.toLowerCase().includes(q) || s.author?.toLowerCase().includes(q)
        );
    }, [songs, searchQuery]);

    const toggleOne = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === filteredSongs.length) setSelected(new Set());
        else setSelected(new Set(filteredSongs.map((s) => s._id)));
    };

    const toggleExpanded = (id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const songToText = async (song) => {
        const result = await window.electronAPI.presentation.toText({
            title: song.title,
            author: song.author,
            verses: song.verses,
            source: song.source,
        });
        if (!result?.success) throw new Error(result?.error || 'Could not prepare song text.');
        return result.text;
    };

    const handleShowNow = async () => {
        const first = songs.find((s) => selected.has(s._id));
        if (!first || !onImportLyrics) return;
        setIsLoading(true);
        setLoadingLabel(`Showing “${first.title}”…`);
        try {
            const content = await songToText(first);
            const imported = await onImportLyrics({
                providerId: 'document-import',
                providerName: 'Document import',
                lyric: { content, title: first.title, artist: first.author || '', album: null, year: null },
            });
            if (imported === false) return;
            setDoneSummary({ action: 'shown', count: 1, title: first.title });
            setCurrentStep(STEPS.DONE);
        } catch (err) {
            logger.error('Show now failed', err);
            setError(err?.message || 'Could not show this song. Please try again.');
        } finally {
            setIsLoading(false);
            setLoadingLabel('');
        }
    };

    const handleAddToSetlist = async () => {
        const chosen = songs.filter((s) => selected.has(s._id));
        if (chosen.length === 0 || !emitSetlistAdd) return;
        setIsLoading(true);
        let added = 0;
        const problems = [];
        for (const song of chosen) {
            setLoadingLabel(`Adding “${song.title}”…`);
            try {
                const content = await songToText(song);
                emitSetlistAdd([{
                    name: `${(song.title || 'Untitled').replace(/[<>:"/\\|?*]/g, '')}.txt`,
                    content,
                    lastModified: Date.now(),
                    metadata: { title: song.title, origin: song.source?.origin || 'Document import' },
                }]);
                added += 1;
            } catch (err) {
                problems.push(`${song.title}: ${err?.message || 'Could not add.'}`);
            }
        }
        setNotices(problems);
        setDoneSummary({ action: 'setlist', count: added, title: '' });
        setIsLoading(false);
        setLoadingLabel('');
        setCurrentStep(STEPS.DONE);
    };

    return (
        <div className="fixed inset-x-0 bottom-0 top-0 z-[1400] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={isLoading ? undefined : handleClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Import document and presentation files"
                className={cn(
                    'relative w-full max-w-3xl rounded-2xl border shadow-2xl flex flex-col h-[650px]',
                    darkMode ? 'bg-gray-900 text-gray-50 border-gray-800' : 'bg-white text-gray-900 border-gray-200'
                )}
            >
                <div className={cn('px-6 py-5 border-b flex-shrink-0', darkMode ? 'border-gray-800' : 'border-gray-200')}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={cn(
                            'flex h-11 w-11 items-center justify-center rounded-xl',
                            darkMode ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-500/10 text-blue-600'
                        )}>
                            <FileText className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold">Import Documents &amp; Presentations</h2>
                            <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                Word, Rich Text, Markdown files and EasyWorship libraries
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-1" aria-hidden="true">
                        {[0, 1, 2].map((step) => (
                            <div
                                key={step}
                                className={cn(
                                    'h-1 flex-1 rounded-full transition-colors',
                                    step <= currentStep ? 'bg-blue-500' : darkMode ? 'bg-gray-700' : 'bg-gray-200'
                                )}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {!hasBridge() || !isDesktopApp ? (
                        <div className={cn('p-4 rounded-lg text-sm', darkMode ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200' : 'bg-yellow-50 border border-yellow-200 text-yellow-800')}>
                            Document import needs the LyricDisplay desktop app. Open this window on the main computer to import files.
                        </div>
                    ) : currentStep === STEPS.SOURCE ? (
                        <div className="space-y-6">
                            <div className="flex gap-2" role="tablist" aria-label="Import source">
                                <Button
                                    type="button"
                                    variant={sourceTab === 'files' ? 'default' : 'outline'}
                                    onClick={() => { setSourceTab('files'); setError(''); }}
                                    className={cn(sourceTab !== 'files' && darkMode && 'border-gray-700 hover:bg-gray-800')}
                                >
                                    <FileText className="w-4 h-4 mr-2" /> Document files
                                </Button>
                                <Button
                                    type="button"
                                    variant={sourceTab === 'easyworship' ? 'default' : 'outline'}
                                    onClick={() => { setSourceTab('easyworship'); setError(''); }}
                                    className={cn(sourceTab !== 'easyworship' && darkMode && 'border-gray-700 hover:bg-gray-800')}
                                >
                                    <Database className="w-4 h-4 mr-2" /> EasyWorship library
                                </Button>
                            </div>

                            {sourceTab === 'files' ? (
                                <div className="space-y-4">
                                    <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                        Choose Word (.docx), Rich Text (.rtf), Markdown (.md) or plain text (.txt) files.
                                        The first line becomes the song title, a “By …” line becomes the author, and blank
                                        lines split slides — review everything on the next screen before showing it live.
                                    </p>
                                    <Button type="button" onClick={handleBrowseFiles} disabled={isLoading} className={darkMode ? 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300' : 'focus-visible:ring-2 focus-visible:ring-blue-500'}>
                                        {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
                                        Choose files…
                                    </Button>
                                    {isLoading && <p className="text-sm text-gray-500">{loadingLabel}</p>}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                        Import a whole EasyWorship library at once. EasyWorship 6/7 uses the database
                                        folder (Songs.db + SongWords.db). EasyWorship 2009 uses the Songs.DB Paradox file.
                                    </p>
                                    <div>
                                        <label htmlFor="pres-ew-version" className={cn('block text-sm font-medium mb-2', darkMode ? 'text-gray-300' : 'text-gray-700')}>
                                            EasyWorship version
                                        </label>
                                        <Select value={ewVersion} onValueChange={(v) => { setEwVersion(v); setEwPath(''); setError(''); }}>
                                            <SelectTrigger id="pres-ew-version" className={darkMode ? 'bg-gray-800 border-gray-700' : ''}>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[1450]">
                                                <SelectItem value="7">EasyWorship 6 / 7 (database folder)</SelectItem>
                                                <SelectItem value="2009">EasyWorship 2009 (Songs.DB file)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label htmlFor="pres-ew-path" className={cn('block text-sm font-medium mb-2', darkMode ? 'text-gray-300' : 'text-gray-700')}>
                                            {ewVersion === '2009' ? 'Songs.DB file' : 'Database folder'}
                                        </label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="pres-ew-path"
                                                value={ewPath}
                                                onChange={(e) => setEwPath(e.target.value)}
                                                placeholder={ewVersion === '2009' ? '…\\Databases\\Data\\Songs.DB' : '…\\Databases\\Data'}
                                                className={cn('flex-1', darkMode ? 'bg-gray-800 border-gray-700' : '')}
                                            />
                                            <Button type="button" variant="outline" onClick={handleBrowseEwPath} disabled={isLoading} className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}>
                                                <FolderOpen className="w-4 h-4 mr-2" /> Browse
                                            </Button>
                                        </div>
                                    </div>
                                    <Button type="button" onClick={handleLoadEw} disabled={isLoading || !ewPath.trim()} className={darkMode ? 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300' : 'focus-visible:ring-2 focus-visible:ring-blue-500'}>
                                        {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                        Read library
                                    </Button>
                                    {isLoading && <p className="text-sm text-gray-500">{loadingLabel}</p>}
                                </div>
                            )}

                            {error && (
                                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
                                    <AlertCircle className="w-4 h-4" /> {error}
                                </p>
                            )}
                        </div>
                    ) : currentStep === STEPS.PREVIEW ? (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold mb-1">Review before showing live</h3>
                                <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                    Check titles and slides now — what you see here is what the room will see.
                                </p>
                            </div>

                            {notices.length > 0 && (
                                <div className={cn('p-3 rounded-lg text-sm space-y-1', darkMode ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200' : 'bg-yellow-50 border border-yellow-200 text-yellow-800')}>
                                    {notices.map((n, i) => <p key={i}>• {n}</p>)}
                                </div>
                            )}
                            {error && (
                                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1" role="alert">
                                    <AlertCircle className="w-4 h-4" /> {error}
                                </p>
                            )}

                            <div className="flex gap-3">
                                <div className="flex-1 relative">
                                    <Search className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', darkMode ? 'text-gray-500' : 'text-gray-400')} />
                                    <Input
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search by title or author…"
                                        aria-label="Search imported songs"
                                        className={cn('pl-10', darkMode ? 'bg-gray-800 border-gray-700' : '')}
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <Checkbox
                                    checked={filteredSongs.length > 0 && selected.size === filteredSongs.length}
                                    onCheckedChange={toggleAll}
                                    aria-label="Select all songs"
                                />
                                <span className="text-sm font-medium">
                                    Select all ({selected.size} of {filteredSongs.length} selected)
                                </span>
                            </label>

                            <div className={cn('border rounded-lg max-h-80 overflow-y-auto', darkMode ? 'border-gray-700' : 'border-gray-200')}>
                                {filteredSongs.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500">No songs match your search.</div>
                                ) : (
                                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {filteredSongs.map((song) => (
                                            <div key={song._id} className={cn('p-3 transition-colors', darkMode ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50')}>
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={selected.has(song._id)}
                                                        onCheckedChange={() => toggleOne(song._id)}
                                                        aria-label={`Select ${song.title}`}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium truncate">{song.title || 'Untitled'}</p>
                                                        <p className={cn('text-sm truncate', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                                            {[song.author, `${song.verses.length} slide${song.verses.length !== 1 ? 's' : ''}`, song.source?.origin].filter(Boolean).join(' • ')}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleExpanded(song._id)}
                                                        aria-expanded={expanded.has(song._id)}
                                                        aria-label={`${expanded.has(song._id) ? 'Hide' : 'Show'} slides for ${song.title}`}
                                                    >
                                                        <ChevronDown className={cn('w-4 h-4 transition-transform', expanded.has(song._id) && 'rotate-180')} />
                                                    </Button>
                                                </div>
                                                {expanded.has(song._id) && (
                                                    <div className={cn('mt-2 ml-8 p-3 rounded-lg text-sm whitespace-pre-wrap', darkMode ? 'bg-gray-800' : 'bg-gray-50')}>
                                                        {song.verses.map((verse, i) => (
                                                            <p key={i} className="mb-2 last:mb-0">
                                                                <span className="font-semibold">Slide {i + 1}:</span>{'\n'}{verse}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 py-4">
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-green-500/10 text-green-500">
                                    <CheckCircle2 className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">
                                    {doneSummary?.action === 'shown'
                                        ? `“${doneSummary.title}” is ready`
                                        : `${doneSummary?.count || 0} song${doneSummary?.count !== 1 ? 's' : ''} added to the setlist`}
                                </h3>
                                <p className={cn('text-sm', darkMode ? 'text-gray-400' : 'text-gray-600')}>
                                    {doneSummary?.action === 'shown'
                                        ? 'The song is loaded in the control panel — press Enter or double-click to project it.'
                                        : 'Open the setlist to reorder or project them during the service.'}
                                </p>
                            </div>
                            {notices.length > 0 && (
                                <div className={cn('p-3 rounded-lg text-sm space-y-1', darkMode ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200' : 'bg-yellow-50 border border-yellow-200 text-yellow-800')}>
                                    {notices.map((n, i) => <p key={i}>• {n}</p>)}
                                </div>
                            )}
                            <div className="flex justify-center">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => { setCurrentStep(STEPS.SOURCE); setSongs([]); setSelected(new Set()); setDoneSummary(null); setNotices([]); }}
                                    className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}
                                >
                                    Import more
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <div className={cn('px-6 py-4 border-t flex items-center justify-between flex-shrink-0', darkMode ? 'border-gray-800' : 'border-gray-200')}>
                    <div>
                        {currentStep === STEPS.PREVIEW && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => { setCurrentStep(STEPS.SOURCE); setSongs([]); setSelected(new Set()); setError(''); setNotices([]); }}
                                disabled={isLoading}
                                className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}
                            >
                                Back
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        {currentStep === STEPS.DONE ? (
                            <Button type="button" onClick={handleClose}>Done</Button>
                        ) : currentStep === STEPS.PREVIEW ? (
                            <>
                                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading} className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}>
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleAddToSetlist}
                                    disabled={isLoading || selected.size === 0 || !emitSetlistAdd}
                                    title={!emitSetlistAdd ? 'Setlist is only available in the desktop app' : undefined}
                                    className={darkMode ? 'border-gray-700 hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-blue-300' : 'focus-visible:ring-2 focus-visible:ring-blue-500'}
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ListPlus className="w-4 h-4 mr-2" />}
                                    Add to setlist
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleShowNow}
                                    disabled={isLoading || selected.size === 0 || !onImportLyrics}
                                    className={darkMode ? 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-300' : 'focus-visible:ring-2 focus-visible:ring-blue-500'}
                                >
                                    <MonitorPlay className="w-4 h-4 mr-2" /> Show now <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        ) : (
                            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading} className={darkMode ? 'border-gray-700 hover:bg-gray-800' : ''}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
