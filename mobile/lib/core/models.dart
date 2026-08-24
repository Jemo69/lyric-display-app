/// Shared data models for the LyricDisplay mobile controller.
library;

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
    this.output1Enabled = true,
    this.output2Enabled = true,
    this.stageEnabled = true,
    this.setlist = const [],
  });

  final List<String> lyrics;
  final int? selectedLine;
  final String fileName;
  final bool isOutputOn;
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
        output1Enabled: output1Enabled ?? this.output1Enabled,
        output2Enabled: output2Enabled ?? this.output2Enabled,
        stageEnabled: stageEnabled ?? this.stageEnabled,
        setlist: setlist ?? this.setlist,
      );

  static ShowState fromCurrentState(Map<String, dynamic> data) {
    final rawLyrics = (data['lyrics'] as List?) ?? const [];
    final rawSetlist = (data['setlistFiles'] as List?) ?? const [];
    final sel = data['selectedLine'];
    return ShowState(
      lyrics: rawLyrics.map(lyricEntryText).toList(growable: false),
      selectedLine: sel is num ? sel.toInt() : null,
      fileName: (data['lyricsFileName'] ?? '').toString(),
      isOutputOn: data['isOutputOn'] == true,
      output1Enabled: data['output1Enabled'] != false,
      output2Enabled: data['output2Enabled'] != false,
      stageEnabled: data['stageEnabled'] != false,
      setlist: rawSetlist
          .whereType<Map>()
          .map((e) => SetlistItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(growable: false),
    );
  }
}
