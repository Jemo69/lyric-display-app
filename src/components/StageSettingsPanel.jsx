import React, { useEffect } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from '@/components/ui/tooltip';
import { ColorPicker } from "@/components/ui/color-picker";
import useStageDisplayControls from '../hooks/OutputSettingsPanel/useStageDisplayControls';
import useFullscreenBackground from '../hooks/OutputSettingsPanel/useFullscreenBackground';
import { Type, PaintBucket, Square, ScreenShare, ListMusic, ChevronRight, Languages, Palette, Power, TextAlignJustify, SquareMenu, Timer, GalleryVerticalEnd, ArrowRightLeft, Gauge, Save, Image, Video, X } from 'lucide-react';
import FontSelect from './FontSelect';
import { blurInputOnEnter, AdvancedToggle, FontSettingsRow, EmphasisRow, AlignmentRow, LabelWithIcon } from './OutputSettingsShared';
import useToast from '../hooks/useToast';
import { sanitizeIntegerInput } from '../utils/numberInput';

const StageSettingsPanel = ({ settings, applySettings, update, darkMode, showModal, isOutputEnabled, handleToggleOutput, ensureValidToken }) => {
  const { showToast } = useToast();

  // Use the same server-upload mechanism as Output1/Output2 so the media
  // URL is persistent and accessible from the Stage window (which opens
  // as a separate page and cannot access blob: URLs created in the
  // control panel window).
  const {
    fileInputRef,
    handleMediaSelection,
    triggerFileDialog,
    hasBackgroundMedia,
    uploadedMediaName,
    validateExistingMedia,
  } = useFullscreenBackground({
    outputKey: 'stage',
    settings,
    applySettings,
    ensureValidToken,
    showToast,
  });

  useEffect(() => {
    if (settings.fullScreenBackgroundType === 'media') {
      validateExistingMedia();
    }
  }, [settings.fullScreenBackgroundType, settings.fullScreenBackgroundMedia?.url, validateExistingMedia]);

  const {
    state,
    setters,
    handlers
  } = useStageDisplayControls({ settings, applySettings, update, showModal });

  const {
    customMessages,
    newMessage,
    timerDuration,
    timerRunning,
    timerPaused,
    timerEndTime,
    timeRemaining,
    customUpcomingSongName,
    upcomingSongAdvancedExpanded,
    hasUnsavedUpcomingSongName,
    timerAdvancedExpanded,
    customMessagesAdvancedExpanded
  } = state;

  const {
    setNewMessage,
    setCustomUpcomingSongName,
    setUpcomingSongAdvancedExpanded,
    setTimerAdvancedExpanded,
    setCustomMessagesAdvancedExpanded
  } = setters;

  const {
    handleCustomUpcomingSongNameChange,
    handleConfirmUpcomingSongName,
    handleFullScreenToggle,
    handleAddMessage,
    handleRemoveMessage,
    handleStartTimer,
    handlePauseTimer,
    handleResumeTimer,
    handleStopTimer,
    handleTimerDurationChange
  } = handlers;

  const switchBaseClasses = `!h-8 !w-16 !border-0 shadow-sm transition-colors ${darkMode
    ? 'data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600'
    : 'data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-300'
    }`;
  const switchThumbClass = "!h-6 !w-7 data-[state=checked]:!translate-x-8 data-[state=unchecked]:!translate-x-1";

  const FullScreenToggleRow = ({ label, checked, onChange, disabled, ariaLabel }) => (
    <div className="flex items-center justify-between w-full">
      <label className={`text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-700'} ${disabled ? 'opacity-50' : ''}`}>
        {label}
      </label>
      <div className="flex items-center gap-3">
        <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} ${disabled ? 'opacity-50' : ''}`}>
          {checked ? 'Enabled' : 'Disabled'}
        </span>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={ariaLabel}
          className={`${switchBaseClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          thumbClassName={switchThumbClass}
        />
      </div>
    </div>
  );

  const lineSections = [
    {
      title: 'Live Line (Current)',
      sizeKey: 'liveFontSize',
      colorKey: 'liveColor',
      boldKey: 'liveBold',
      italicKey: 'liveItalic',
      underlineKey: 'liveUnderline',
      allCapsKey: 'liveAllCaps',
      alignKey: 'liveAlign',
      tooltip: 'Font size and color for current lyric line',
      alignTooltip: 'Text alignment for current line',
      extra: (
        <div className="flex items-center justify-between gap-4 mt-4">
          <Tooltip content="Color for translation lines in grouped lyrics" side="right">
            <LabelWithIcon icon={Languages} text="Translation Colour" darkMode={darkMode} />
          </Tooltip>
          <ColorPicker
            value={settings.translationLineColor || '#FBBF24'}
            onChange={(val) => update('translationLineColor', val)}
            darkMode={darkMode}
            className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}
          />
        </div>
      )
    },
    {
      title: 'Next Line (Upcoming)',
      sizeKey: 'nextFontSize',
      colorKey: 'nextColor',
      boldKey: 'nextBold',
      italicKey: 'nextItalic',
      underlineKey: 'nextUnderline',
      allCapsKey: 'nextAllCaps',
      alignKey: 'nextAlign',
      tooltip: 'Font size and color for upcoming lyric line',
      alignTooltip: 'Text alignment for upcoming line',
      extra: (
        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between gap-4">
            <Tooltip content="Enable or disable the upcoming line on stage display" side="right">
              <LabelWithIcon icon={ListMusic} text="Show Next Line" darkMode={darkMode} />
            </Tooltip>
            <div className="flex items-center gap-3 justify-end w-full">
              <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {settings.showNextLine ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={settings.showNextLine ?? true}
                onCheckedChange={(checked) => update('showNextLine', checked)}
                aria-label="Toggle show next line"
                className={switchBaseClasses}
                thumbClassName={switchThumbClass}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Tooltip content="Show arrow indicator before upcoming line" side="right">
              <LabelWithIcon icon={ChevronRight} text="Arrow" darkMode={darkMode} />
            </Tooltip>
            <div className="flex items-center gap-2 justify-end w-full">
              <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {settings.showNextArrow ? 'Enabled' : 'Disabled'}
              </span>
              <Switch
                checked={settings.showNextArrow}
                onCheckedChange={(checked) => update('showNextArrow', checked)}
                aria-label="Toggle show arrow"
                className={switchBaseClasses}
                thumbClassName={switchThumbClass}
              />
              <PaintBucket className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <ColorPicker
                value={settings.nextArrowColor}
                onChange={(val) => update('nextArrowColor', val)}
                darkMode={darkMode}
                className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      title: 'Previous Line',
      sizeKey: 'prevFontSize',
      colorKey: 'prevColor',
      boldKey: 'prevBold',
      italicKey: 'prevItalic',
      underlineKey: 'prevUnderline',
      allCapsKey: 'prevAllCaps',
      alignKey: 'prevAlign',
      tooltip: 'Font size and color for previous lyric line',
      alignTooltip: 'Text alignment for previous line',
      extra: (
        <div className="flex items-center justify-between gap-4 mt-4">
          <Tooltip content="Enable or disable the previous line on stage display" side="right">
            <LabelWithIcon icon={ListMusic} text="Show Previous Line" darkMode={darkMode} />
          </Tooltip>
          <div className="flex items-center gap-3 justify-end w-full">
            <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {settings.showPrevLine ? 'Enabled' : 'Disabled'}
            </span>
            <Switch
              checked={settings.showPrevLine ?? true}
              onCheckedChange={(checked) => update('showPrevLine', checked)}
              aria-label="Toggle show previous line"
              className={switchBaseClasses}
              thumbClassName={switchThumbClass}
            />
          </div>
        </div>
      )
    },
  ];

  const renderLineSection = (section) => (
    <>
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>{section.title}</h4>

      <FontSettingsRow
        darkMode={darkMode}
        sizeValue={settings[section.sizeKey]}
        colorValue={settings[section.colorKey]}
        onSizeChange={(val) => update(section.sizeKey, val)}
        onColorChange={(val) => update(section.colorKey, val)}
        minSize={24}
        maxSize={200}
        tooltip={section.tooltip}
      />

      <EmphasisRow
        darkMode={darkMode}
        LabelWithIcon={LabelWithIcon}
        icon={SquareMenu}
        boldValue={settings[section.boldKey]}
        italicValue={settings[section.italicKey]}
        underlineValue={settings[section.underlineKey]}
        allCapsValue={settings[section.allCapsKey]}
        onBoldChange={(val) => update(section.boldKey, val)}
        onItalicChange={(val) => update(section.italicKey, val)}
        onUnderlineChange={(val) => update(section.underlineKey, val)}
        onAllCapsChange={(val) => update(section.allCapsKey, val)}
      />

      <AlignmentRow
        darkMode={darkMode}
        LabelWithIcon={LabelWithIcon}
        icon={TextAlignJustify}
        value={settings[section.alignKey]}
        onChange={(val) => update(section.alignKey, val)}
        tooltip={section.alignTooltip || 'Text alignment'}
      />

      {section.extra}
    </>
  );

  return (
    <div className="space-y-4" onKeyDown={blurInputOnEnter}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-sm font-medium uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          STAGE DISPLAY SETTINGS
        </h3>

        <div className="flex items-center gap-2">
          {/* Toggle Output Button */}
          <Tooltip content={isOutputEnabled ? "Turn off Stage Display" : "Turn on Stage Display"} side="bottom">
            <button
              onClick={handleToggleOutput}
              className={`p-1.5 rounded-lg transition-colors ${!isOutputEnabled
                ? darkMode
                  ? 'bg-red-600/80 text-white hover:bg-red-600'
                  : 'bg-red-500 text-white hover:bg-red-600'
                : darkMode
                  ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
            >
              <Power className="w-4 h-4" />
            </button>
          </Tooltip>

          {/* Save as Template button */}
          <Tooltip content="Save current settings as a reusable template" side="bottom">
            <button
              onClick={() => {
                showModal({
                  title: 'Save as Template',
                  headerDescription: 'Save your current stage display settings as a reusable template',
                  component: 'SaveTemplate',
                  variant: 'info',
                  size: 'sm',
                  actions: [],
                  templateType: 'stage',
                  settings: settings,
                  onSave: (template) => {
                    showToast({
                      title: 'Template Saved',
                      message: `"${template.name}" has been saved successfully`,
                      variant: 'success',
                    });
                  }
                });
              }}
              className={`p-1.5 rounded-lg transition-colors ${darkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
            >
              <Save className="w-4 h-4" />
            </button>
          </Tooltip>

          {/* Templates trigger button */}
          <Tooltip content="Choose from professionally designed stage display templates" side="bottom">
            <button
              onClick={() => {
                showModal({
                  title: 'Stage Display Templates',
                  headerDescription: 'Choose from professionally designed stage display presets',
                  component: 'StageTemplates',
                  variant: 'info',
                  size: 'large',
                  scrollBehavior: 'scroll',
                  dismissLabel: 'Close',
                  onApplyTemplate: (template) => {
                    applySettings(template.settings);
                    showToast({
                      title: 'Template Applied',
                      message: `${template.title} template has been applied successfully`,
                      variant: 'success',
                    });
                  }
                });
              }}
              className={`p-1.5 rounded-lg transition-colors ${darkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
            >
              <Palette className="w-4 h-4" />
            </button>
          </Tooltip>

          {/* Help trigger button */}
          <Tooltip content="Stage Settings Help" side="bottom">
            <button
              onClick={() => {
                showModal({
                  title: 'Stage Display Help',
                  headerDescription: 'Configure your stage display for performers and worship leaders',
                  component: 'StageDisplayHelp',
                  variant: 'info',
                  size: 'large',
                  dismissLabel: 'Got it'
                });
              }}
              className={`p-1.5 rounded-lg transition-colors ${darkMode
                ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Font Style */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Select font family for stage display" side="right">
          <LabelWithIcon icon={Type} text="Font Style" darkMode={darkMode} />
        </Tooltip>
        <FontSelect
          value={settings.fontStyle}
          onChange={(val) => update('fontStyle', val)}
          darkMode={darkMode}
          triggerClassName="w-full"
          containerClassName="relative w-full"
        />
      </div>

      {/* Unified Background Control */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Choose background type for stage display" side="right">
          <LabelWithIcon icon={PaintBucket} text="Background" darkMode={darkMode} />
        </Tooltip>
        <Select
          value={settings.fullScreenBackgroundType || 'color'}
          onValueChange={(val) => {
            update('fullScreenBackgroundType', val);
            if (val === 'media' && !settings.fullScreenBackgroundMedia?.url && !settings.fullScreenBackgroundMedia?.dataUrl) {
              // Don't clear anything if switching to media
            }
          }}
        >
          <SelectTrigger className={`w-[160px] ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}>
            <SelectItem value="color">Colour</SelectItem>
            <SelectItem value="media">Image / Video</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transparent Background */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Enable pure transparent background (overrides other background settings)" side="right">
          <label className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Transparent Background</label>
        </Tooltip>
        <div className="flex items-center gap-3 justify-end w-full">
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {settings.transparentBackground ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={Boolean(settings.transparentBackground)}
            onCheckedChange={(checked) => update('transparentBackground', checked)}
            aria-label="Toggle transparent background"
            className={switchBaseClasses}
            thumbClassName={switchThumbClass}
          />
        </div>
      </div>

      {/* Background Type Options */}
      {settings.fullScreenBackgroundType === 'color' && (
        <div className="flex items-center gap-3 justify-end">
          <ColorPicker
            value={settings.fullScreenBackgroundColor || '#000000'}
            onChange={(val) => update('fullScreenBackgroundColor', val)}
            darkMode={darkMode}
            className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}
          />
        </div>
      )}

      {settings.fullScreenBackgroundType === 'media' && (
        <div className="flex items-center gap-2 ml-auto min-w-0 max-w-full">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaSelection}
          />
          {hasBackgroundMedia && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'}`}>
              {settings.fullScreenBackgroundMedia?.mimeType?.startsWith('video/') ||
                (typeof settings.fullScreenBackgroundMedia?.url === 'string' && /\.(mp4|webm|ogg|m4v|mov)$/i.test(settings.fullScreenBackgroundMedia.url))
                ? <Video className="w-4 h-4" />
                : <Image className="w-4 h-4" />
              }
              <span className="text-xs font-medium">Active</span>
            </div>
          )}
          <Button
            variant="outline"
            onClick={triggerFileDialog}
            className={`h-9 px-4 flex-shrink-0 ${hasBackgroundMedia
              ? (darkMode ? 'border-blue-600 text-blue-400 hover:bg-blue-900/30' : 'border-blue-500 text-blue-600 hover:bg-blue-50')
              : (darkMode ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : '')
              }`}
          >
            {hasBackgroundMedia ? 'Change' : 'Add File'}
          </Button>
          {hasBackgroundMedia && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                update('fullScreenBackgroundMedia', null);
                update('fullScreenBackgroundMediaName', '');
              }}
              className={`h-9 w-9 flex-shrink-0 ${darkMode ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'}`}
              title="Remove background"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {hasBackgroundMedia && (
            <span
              className={`text-sm max-w-[180px] min-w-0 truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}
              title={uploadedMediaName}
            >
              {uploadedMediaName}
            </span>
          )}
        </div>
      )}

      {/* Always Show Background */}
      {settings.fullScreenBackgroundType === 'media' && (
        <div className="flex items-center justify-between gap-4">
          <Tooltip content="Show background even when the output is toggled off" side="right">
            <label className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>Always Show Background</label>
          </Tooltip>
          <Switch
            checked={Boolean(settings.alwaysShowBackground)}
            onCheckedChange={(checked) => update('alwaysShowBackground', checked)}
            aria-label="Toggle always show background"
            className={`!h-7 !w-14 !border-0 shadow-sm transition-colors ${darkMode
              ? 'data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-gray-600'
              : 'data-[state=checked]:bg-black data-[state=unchecked]:bg-gray-300'
              }`}
          />
        </div>
      )}

      {/* Upcoming Song */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Show upcoming song in stage display" side="right">
          <LabelWithIcon icon={ListMusic} text="Show Upcoming Song" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-3 justify-end w-full">
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {settings.showUpcomingSong ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={settings.showUpcomingSong || false}
            onCheckedChange={(checked) => update('showUpcomingSong', checked)}
            aria-label="Toggle show upcoming song"
            className={switchBaseClasses}
            thumbClassName={switchThumbClass}
          />
        </div>
      </div>

      {/* Upcoming Song Configuration */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Configure upcoming song display mode" side="right">
          <LabelWithIcon icon={ListMusic} text="Upcoming Song Mode" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-2 justify-end w-full">
          <Tooltip content={(upcomingSongAdvancedExpanded ? "Hide" : "Show") + " advanced settings"} side="top">
            <AdvancedToggle
              expanded={upcomingSongAdvancedExpanded}
              onToggle={() => setUpcomingSongAdvancedExpanded(!upcomingSongAdvancedExpanded)}
              darkMode={darkMode}
              ariaLabel="Toggle upcoming song advanced settings"
              disabled={!settings.showUpcomingSong}
            />
          </Tooltip>
          <Select
            value={settings.upcomingSongMode || 'automatic'}
            onValueChange={(val) => update('upcomingSongMode', val)}
            disabled={!settings.showUpcomingSong}
          >
            <SelectTrigger className={`w-[140px] ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'} ${!settings.showUpcomingSong ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}>
              <SelectItem value="automatic">Automatic</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Upcoming Song Advanced Settings Row */}
      <div
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${upcomingSongAdvancedExpanded
          ? 'max-h-40 opacity-100 translate-y-0 pointer-events-auto mt-1'
          : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none m-0 p-0'
          }`}
        aria-hidden={!upcomingSongAdvancedExpanded}
        style={{ marginTop: upcomingSongAdvancedExpanded ? undefined : 0 }}
      >
        <div className="space-y-3">
          {/* Custom Name Input with OK Button */}
          <div className="flex items-center justify-between w-full gap-2">
            <label className={`text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-700'} ${settings.upcomingSongMode !== 'custom' ? 'opacity-50' : ''}`}>
              Custom Name
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={customUpcomingSongName}
                onChange={(e) => handleCustomUpcomingSongNameChange(e.target.value)}
                placeholder="Enter song name..."
                disabled={settings.upcomingSongMode !== 'custom'}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && hasUnsavedUpcomingSongName && settings.upcomingSongMode === 'custom') {
                    handleConfirmUpcomingSongName();
                  }
                }}
                className={`w-full ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'} ${settings.upcomingSongMode !== 'custom' ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              {hasUnsavedUpcomingSongName && settings.upcomingSongMode === 'custom' && (
                <Button
                  size="sm"
                  onClick={handleConfirmUpcomingSongName}
                  className={`${darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white px-3 py-1 h-9`}
                >
                  OK
                </Button>
              )}
            </div>
          </div>

          <FullScreenToggleRow
            label="Send Full Screen"
            checked={settings.upcomingSongFullScreen || false}
            onChange={(checked) => handleFullScreenToggle('upcomingSong', checked)}
            disabled={settings.timerFullScreen || settings.customMessagesFullScreen}
            ariaLabel="Toggle upcoming song full screen"
          />
        </div>
      </div>

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {/* Auto-scale Text Settings */}
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Auto-Scale Text</h4>

      <div className="flex items-center justify-between gap-4 mt-3">
        <Tooltip content="Automatically shrink text to fit within specified lines" side="right">
          <LabelWithIcon icon={Gauge} text="Auto-Scale to Fit" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-3 justify-end w-full">
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {settings.maxLinesEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={settings.maxLinesEnabled}
            onCheckedChange={(checked) => update('maxLinesEnabled', checked)}
            aria-label="Toggle auto-scale text"
            className={switchBaseClasses}
            thumbClassName={switchThumbClass}
          />
        </div>
      </div>

      {settings.maxLinesEnabled && (
        <div className="space-y-3 mt-3">
          <div className="flex items-center justify-between gap-4">
            <label className={`text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Max Lines
            </label>
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.maxLines}
              onChange={(e) => update('maxLines', sanitizeIntegerInput(e.target.value, 3, 1, 10))}
              className={`w-20 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label className={`text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Min Font Size (px)
            </label>
            <Input
              type="number"
              min={12}
              max={100}
              value={settings.minFontSize}
              onChange={(e) => update('minFontSize', sanitizeIntegerInput(e.target.value, 24, 12, 100))}
              className={`w-20 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
            />
          </div>
          <div className="flex items-center justify-between gap-4 mt-2">
            <label className={`text-sm whitespace-nowrap ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Max Font Size (px)
            </label>
            <Input
              type="number"
              min={100}
              max={400}
              value={settings.maxFontSize || 300}
              onChange={(e) => update('maxFontSize', sanitizeIntegerInput(e.target.value, 300, 100, 400))}
              className={`w-20 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
            />
          </div>
        </div>
      )}

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {lineSections.map((section) => (
        <React.Fragment key={section.title}>
          {renderLineSection(section)}
          <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>
        </React.Fragment>
      ))}

      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Show 'Waiting for lyrics' while the stage is idle. Turn it off to keep the stage blank." side="right">
          <LabelWithIcon icon={Timer} text="Show Waiting for Lyrics" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-3 justify-end w-full">
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {settings.showWaitingForLyrics ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={settings.showWaitingForLyrics ?? false}
            onCheckedChange={(checked) => update('showWaitingForLyrics', checked)}
            aria-label="Toggle show waiting for lyrics"
            className={switchBaseClasses}
            thumbClassName={switchThumbClass}
          />
        </div>
      </div>

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {/* Song Info Settings */}
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Top Bar</h4>

      <FontSettingsRow
        darkMode={darkMode}
        sizeValue={settings.currentSongSize}
        colorValue={settings.currentSongColor}
        onSizeChange={(val) => update('currentSongSize', val)}
        onColorChange={(val) => update('currentSongColor', val)}
        minSize={12}
        maxSize={48}
        label="Current Song"
        tooltip="Font size and color for current song name"
      />

      <FontSettingsRow
        darkMode={darkMode}
        sizeValue={settings.upcomingSongSize}
        colorValue={settings.upcomingSongColor}
        onSizeChange={(val) => update('upcomingSongSize', val)}
        onColorChange={(val) => update('upcomingSongColor', val)}
        minSize={12}
        maxSize={48}
        label="Upcoming Song"
        tooltip="Font size and color for upcoming song name"
      />

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {/* Bottom Bar Settings */}
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Bottom Bar</h4>

      <div className="flex items-center justify-between gap-4 mt-4">
        <Tooltip content="Display current real-world time" side="right">
          <LabelWithIcon icon={ScreenShare} text="Show Time" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-3 justify-end w-full">
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {settings.showTime ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            checked={settings.showTime}
            onCheckedChange={(checked) => update('showTime', checked)}
            aria-label="Toggle show time"
            className={switchBaseClasses}
            thumbClassName={switchThumbClass}
          />
        </div>
      </div>

      {/* Timer Controls */}
      <div className="flex items-center justify-between gap-4">
        <Tooltip content="Set countdown timer duration in minutes" side="right">
          <LabelWithIcon icon={Timer} text="Countdown Timer" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-2 justify-end">
          <Tooltip content={(timerAdvancedExpanded ? "Hide" : "Show") + " advanced settings"} side="top">
            <AdvancedToggle
              expanded={timerAdvancedExpanded}
              onToggle={() => setTimerAdvancedExpanded(!timerAdvancedExpanded)}
              darkMode={darkMode}
              ariaLabel="Toggle timer advanced settings"
            />
          </Tooltip>
          <Input
            type="number"
            value={timerDuration}
            onChange={(e) => handleTimerDurationChange(e.target.value)}
            min="0"
            max="180"
            placeholder="Minutes"
            disabled={timerRunning}
            className={`w-24 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'} ${timerRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>

      {/* Timer Advanced Settings Row */}
      <div
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${timerAdvancedExpanded
          ? 'max-h-40 opacity-100 translate-y-0 pointer-events-auto mt-1'
          : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none m-0 p-0'
          }`}
        aria-hidden={!timerAdvancedExpanded}
        style={{ marginTop: timerAdvancedExpanded ? undefined : 0 }}
      >
        <div className="space-y-3">
          <FullScreenToggleRow
            label="Send Full Screen"
            checked={settings.timerFullScreen || false}
            onChange={(checked) => handleFullScreenToggle('timer', checked)}
            disabled={settings.upcomingSongFullScreen || settings.customMessagesFullScreen}
            ariaLabel="Toggle timer full screen"
          />
        </div>
      </div>

      {/* Timer Control Buttons Row */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Timer Display */}
        <div className={`flex items-center justify-center px-4 py-2 rounded-lg min-w-[120px] ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
          <div className={`text-xl font-mono font-bold ${timerRunning && !timerPaused ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>
            {timeRemaining || '0:00'}
          </div>
        </div>

        {/* Right: Control Buttons */}
        <div className="flex items-center gap-2">
          {!timerRunning ? (
            <Button
              size="sm"
              onClick={handleStartTimer}
              disabled={timerDuration <= 0}
              className={`${darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white`}
            >
              Start
            </Button>
          ) : (
            <>
              {timerPaused ? (
                <Button
                  size="sm"
                  onClick={handleResumeTimer}
                  className={`${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'} text-white`}
                >
                  Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handlePauseTimer}
                  className={`${darkMode ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-yellow-500 hover:bg-yellow-600'} text-white`}
                >
                  Pause
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleStopTimer}
                className={darkMode ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : ''}
              >
                Stop
              </Button>
            </>
          )}
        </div>
      </div>

      <FontSettingsRow
        darkMode={darkMode}
        sizeValue={settings.bottomBarSize}
        colorValue={settings.bottomBarColor}
        onSizeChange={(val) => update('bottomBarSize', val)}
        onColorChange={(val) => update('bottomBarColor', val)}
        minSize={12}
        maxSize={36}
        tooltip="Font size and color for bottom bar text"
      />

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {/* Custom Messages */}
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Custom Messages</h4>

      <div className="flex items-center justify-between gap-4 mt-4">
        <Tooltip content="Time between message transitions (1000-10000ms)" side="right">
          <LabelWithIcon icon={GalleryVerticalEnd} text="Scroll Speed (ms)" darkMode={darkMode} />
        </Tooltip>
        <div className="flex items-center gap-2 justify-end">
          <Tooltip content={(customMessagesAdvancedExpanded ? "Hide" : "Show") + " advanced settings"} side="top">
            <AdvancedToggle
              expanded={customMessagesAdvancedExpanded}
              onToggle={() => setCustomMessagesAdvancedExpanded(!customMessagesAdvancedExpanded)}
              darkMode={darkMode}
              ariaLabel="Toggle custom messages advanced settings"
            />
          </Tooltip>
          <Input
            type="number"
            value={settings.messageScrollSpeed}
            onChange={(e) => update(
              'messageScrollSpeed',
              sanitizeIntegerInput(
                e.target.value,
                settings.messageScrollSpeed ?? 3000,
                { min: 1000, max: 10000, clampMin: false }
              )
            )}
            min="1000"
            max="10000"
            step="500"
            className={`w-24 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
          />
        </div>
      </div>

      {/* Custom Messages Advanced Settings Row */}
      <div
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-300 ease-out ${customMessagesAdvancedExpanded
          ? 'max-h-40 opacity-100 translate-y-0 pointer-events-auto mt-1'
          : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none m-0 p-0'
          }`}
        aria-hidden={!customMessagesAdvancedExpanded}
        style={{ marginTop: customMessagesAdvancedExpanded ? undefined : 0 }}
      >
        <div className="space-y-3">
          <FullScreenToggleRow
            label="Send Full Screen"
            checked={settings.customMessagesFullScreen || false}
            onChange={(checked) => handleFullScreenToggle('customMessages', checked)}
            disabled={settings.upcomingSongFullScreen || settings.timerFullScreen}
            ariaLabel="Toggle custom messages full screen"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddMessage()}
            placeholder="Enter custom message..."
            className={`flex-1 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
          />
          <Button onClick={handleAddMessage} className={darkMode ? 'bg-blue-600 hover:bg-blue-700' : ''}>
            Add
          </Button>
        </div>

        {customMessages.length > 0 && (
          <div className={`space-y-2 max-h-40 overflow-y-auto p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            {customMessages.map((msg) => (
              <div key={msg.id} className={`flex items-center justify-between p-2 rounded ${darkMode ? 'bg-gray-600' : 'bg-white'}`}>
                <span className={`text-sm ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  {typeof msg === 'string' ? msg : msg.text}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveMessage(msg.id)}
                  className={darkMode ? 'hover:bg-gray-500 text-gray-300' : ''}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`border-t my-4 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}></div>

      {/* Transition Settings */}
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'} mt-2`}>Transition Style</h4>

      <div className="flex items-center justify-between gap-4 mt-4">
        <Tooltip content="Choose animation style when lyrics change" side="right">
          <LabelWithIcon icon={ArrowRightLeft} text="Animation" darkMode={darkMode} />
        </Tooltip>
        <Select value={settings.transitionAnimation} onValueChange={(val) => update('transitionAnimation', val)}>
          <SelectTrigger className={`w-[140px] ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="fade">Fade</SelectItem>
            <SelectItem value="slide">Slide (Wheel)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {settings.transitionAnimation !== 'none' && (
        <div className="flex items-center justify-between gap-4">
          <Tooltip content="Animation duration (100-1000ms)" side="right">
            <LabelWithIcon icon={Gauge} text="Speed (ms)" darkMode={darkMode} />
          </Tooltip>
          <Input
            type="number"
            value={settings.transitionSpeed}
            onChange={(e) => update(
              'transitionSpeed',
              sanitizeIntegerInput(
                e.target.value,
                settings.transitionSpeed ?? 300,
                { min: 100, max: 1000, clampMin: false }
              )
            )}
            min="100"
            max="1000"
            step="50"
            className={`w-24 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300'}`}
          />
        </div>
      )}
    </div>
  );
};

export default StageSettingsPanel;
