class DiscoveredHost {
  final String name;
  final String host;
  final int port;
  final Duration? latency;

  const DiscoveredHost({
    required this.name,
    required this.host,
    required this.port,
    this.latency,
  });

  String get origin => 'http://$host:$port';

  @override
  bool operator ==(Object other) =>
      other is DiscoveredHost && other.host == host && other.port == port;

  @override
  int get hashCode => Object.hash(host, port);
}

class AuthSession {
  final String token;
  final String host;
  final int port;
  final String deviceId;
  final String joinCode;

  const AuthSession({
    required this.token,
    required this.host,
    required this.port,
    required this.deviceId,
    required this.joinCode,
  });

  String get origin => 'http://$host:$port';
}

class SetlistItem {
  final String id;
  final String name;

  const SetlistItem({required this.id, required this.name});

  factory SetlistItem.fromJson(Map<String, dynamic> json) => SetlistItem(
        id: json['id']?.toString() ?? '',
        name: json['name']?.toString() ?? json['fileName']?.toString() ?? '',
      );
}

enum ConnectionStatus { disconnected, connecting, connected }

class AppState {
  final ConnectionStatus status;
  final List<String> lyrics;
  final int selectedLine;
  final String fileName;
  final bool isOutputOn;
  final List<SetlistItem> setlist;
  final String? error;

  const AppState({
    this.status = ConnectionStatus.disconnected,
    this.lyrics = const [],
    this.selectedLine = 0,
    this.fileName = '',
    this.isOutputOn = false,
    this.setlist = const [],
    this.error,
  });

  bool get hasLyrics => lyrics.isNotEmpty;

  AppState copyWith({
    ConnectionStatus? status,
    List<String>? lyrics,
    int? selectedLine,
    String? fileName,
    bool? isOutputOn,
    List<SetlistItem>? setlist,
    String? error,
  }) {
    return AppState(
      status: status ?? this.status,
      lyrics: lyrics ?? this.lyrics,
      selectedLine: selectedLine ?? this.selectedLine,
      fileName: fileName ?? this.fileName,
      isOutputOn: isOutputOn ?? this.isOutputOn,
      setlist: setlist ?? this.setlist,
      error: error ?? this.error,
    );
  }
}
