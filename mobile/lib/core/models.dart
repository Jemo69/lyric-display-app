/// Shared data models for the LyricDisplay mobile controller.
library;

/// Explicit show-control states (feature #18). Mirrors
/// `shared/showControl.js` on the server.
enum ShowControlState {
  live('LIVE', 'Live'),
  clear('CLEAR', 'Clear'),
  blackout('BLACKOUT', 'Blackout'),
  logo('LOGO', 'Logo');

  const ShowControlState(this.wire, this.label);

  final String wire;
  final String label;

  /// Only LIVE reads as master output ON; everything else is dark.
  bool get isMasterOn => this == ShowControlState.live;

  static ShowControlState fromWire(Object? value) {
    final upper = value?.toString().trim().toUpperCase();
    return ShowControlState.values.firstWhere(
      (state) => state.wire == upper,
      // The legacy boolean is the only other thing the server sends.
      orElse: () =>
          value == false ? ShowControlState.blackout : ShowControlState.live,
    );
  }
}

/// One queued announcement (feature #18).
class TickerItem {
  const TickerItem({
    required this.id,
    required this.text,
    this.targetOutput,
    this.targetName,
  });

  final String id;
  final String text;
  final String? targetOutput;
  final String? targetName;

  static TickerItem fromJson(Map<String, dynamic> json) => TickerItem(
        id: (json['id'] ?? '').toString(),
        text: (json['text'] ?? '').toString(),
        targetOutput: json['targetOutput']?.toString(),
        targetName: json['targetName']?.toString(),
      );
}

class DiscoveredServer {
  const DiscoveredServer({
    required this.name,
    required this.host,
    required this.port,
  });

  final String name;
  final String host;
  final int port;

  String get baseUrl => 'http://$host:$port';

  @override
  bool operator ==(Object other) =>
      other is DiscoveredServer && other.host == host && other.port == port;

  @override
  int get hashCode => Object.hash(host, port);
}

class SavedConnection {
  const SavedConnection({
    required this.serverName,
    required this.host,
    required this.port,
    required this.token,
    required this.deviceId,
  });

  final String serverName;
  final String host;
  final int port;
  final String token;
  final String deviceId;

  String get baseUrl => 'http://$host:$port';

  Map<String, dynamic> toJson() => {
        'serverName': serverName,
        'host': host,
        'port': port,
        'token': token,
        'deviceId': deviceId,
      };

  static SavedConnection fromJson(Map<String, dynamic> json) => SavedConnection(
        serverName: json['serverName'] as String? ?? 'LyricDisplay',
        host: json['host'] as String,
        port: json['port'] as int? ?? 4000,
        token: json['token'] as String,
        deviceId: json['deviceId'] as String,
      );
}

class SetlistItem {
  const SetlistItem({
    required this.id,
    required this.displayName,
    this.fileType = 'txt',
  });

  final String id;
  final String displayName;
  final String fileType;

  static SetlistItem fromJson(Map<String, dynamic> json) => SetlistItem(
        id: json['id']?.toString() ?? '',
        displayName: (json['displayName'] ?? json['name'] ?? json['originalName'] ?? '')
            .toString()
            .replaceFirst(RegExp(r'\.(txt|lrc)$', caseSensitive: false), ''),
        fileType: json['fileType'] as String? ?? 'txt',
      );
}

class BibleResult {
  const BibleResult({required this.reference, required this.text});

  final String reference;
  final String text;

  static BibleResult fromJson(Map<String, dynamic> json) => BibleResult(
        reference: (json['reference'] ?? '').toString(),
        text: (json['text'] ?? '').toString(),
      );
}

/// Extracts printable text from a lyric entry, which may be a plain string
/// or a grouped object carrying `displayText`.
String lyricEntryText(Object? entry) {
  if (entry is String) return entry;
  if (entry is Map) {
    return (entry['displayText'] ??
            entry['mainLine'] ??
            entry['text'] ??
            entry['line1'] ??
            '')
        .toString();
  }
  return '';
}

/// Full live state mirrored from the desktop over Socket.IO.
class ShowState {
  const ShowState({
    this.lyrics = const [],
    this.selectedLine,
    this.fileName = '',
    this.isOutputOn = false,
    this.showControl = ShowControlState.live,
    this.tickerQueue = const [],
    this.tickerActiveId,
    this.announcementTargetOutputKey = 'all',
    this.output1Enabled = true,
    this.output2Enabled = true,
    this.stageEnabled = true,
    this.setlist = const [],
  });

  final List<String> lyrics;
  final int? selectedLine;
  final String fileName;

  /// Legacy master flag. Prefer [showControl]; only LIVE is master ON.
  final bool isOutputOn;
  final ShowControlState showControl;
  final List<TickerItem> tickerQueue;
  final String? tickerActiveId;
  final String announcementTargetOutputKey;
  final bool output1Enabled;
  final bool output2Enabled;
  final bool stageEnabled;
  final List<SetlistItem> setlist;

  bool get hasLyrics => lyrics.isNotEmpty;

  String? get currentLine =>
      selectedLine != null && selectedLine! >= 0 && selectedLine! < lyrics.length
          ? lyrics[selectedLine!]
          : null;

  String? get upcomingLine {
    final idx = selectedLine;
    if (idx == null || !hasLyrics) return null;
    final next = idx + 1;
    return next < lyrics.length ? lyrics[next] : null;
  }

  ShowState copyWith({
    List<String>? lyrics,
    int? selectedLine,
    bool clearSelectedLine = false,
    String? fileName,
    bool? isOutputOn,
    ShowControlState? showControl,
    List<TickerItem>? tickerQueue,
    String? tickerActiveId,
    bool clearTickerActiveId = false,
    String? announcementTargetOutputKey,
    bool? output1Enabled,
    bool? output2Enabled,
    bool? stageEnabled,
    List<SetlistItem>? setlist,
  }) =>
      ShowState(
        lyrics: lyrics ?? this.lyrics,
        selectedLine:
            clearSelectedLine ? null : (selectedLine ?? this.selectedLine),
        fileName: fileName ?? this.fileName,
        isOutputOn: isOutputOn ?? this.isOutputOn,
        showControl: showControl ?? this.showControl,
        tickerQueue: tickerQueue ?? this.tickerQueue,
        tickerActiveId: clearTickerActiveId
            ? null
            : (tickerActiveId ?? this.tickerActiveId),
        announcementTargetOutputKey:
            announcementTargetOutputKey ?? this.announcementTargetOutputKey,
        output1Enabled: output1Enabled ?? this.output1Enabled,
        output2Enabled: output2Enabled ?? this.output2Enabled,
        stageEnabled: stageEnabled ?? this.stageEnabled,
        setlist: setlist ?? this.setlist,
      );

  static ShowState fromCurrentState(Map<String, dynamic> data) {
    final rawLyrics = (data['lyrics'] as List?) ?? const [];
    // Full state (`currentState`) carries `setlistFiles`; the periodic
    // summary (`periodicStateSync`) carries `setlistSummary` instead.
    // Accept both so the setlist survives background syncs.
    final rawSetlist = (data['setlistFiles'] as List?) ??
        (data['setlistSummary'] as List?) ??
        const [];
    final sel = data['selectedLine'];
    final masterOn = data['isOutputOn'] == true;
    return ShowState(
      lyrics: rawLyrics.map(lyricEntryText).toList(growable: false),
      selectedLine: sel is num ? sel.toInt() : null,
      fileName: (data['lyricsFileName'] ?? '').toString(),
      isOutputOn: masterOn,
      // Fall back to the legacy boolean when the server sends no explicit
      // state, so an older server still drives the mobile dock correctly.
      showControl: data['showState'] != null
          ? ShowControlState.fromWire(data['showState'])
          : (masterOn ? ShowControlState.live : ShowControlState.blackout),
      tickerQueue: tickerQueueFrom(data),
      tickerActiveId: data['tickerActiveId']?.toString(),
      announcementTargetOutputKey:
          (data['announcementTargetOutputKey'] ?? 'all').toString(),
      output1Enabled: data['output1Enabled'] != false,
      output2Enabled: data['output2Enabled'] != false,
      stageEnabled: data['stageEnabled'] != false,
      setlist: rawSetlist
          .whereType<Map>()
          .map((e) => SetlistItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(growable: false),
    );
  }

  /// Reads the queue from either the full state or a `tickerUpdate` event.
  static List<TickerItem> tickerQueueFrom(Map<String, dynamic> data) {
    final raw = (data['tickerQueue'] as List?) ??
        (data['tickerItems'] as List?) ??
        const [];
    return raw
        .whereType<Map>()
        .map((e) => TickerItem.fromJson(Map<String, dynamic>.from(e)))
        .toList(growable: false);
  }
}
