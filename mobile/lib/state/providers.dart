/// Central Riverpod wiring: saved pairing, live show state, and commands.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/mdns_discovery.dart';
import '../core/models.dart';
import '../core/pairing_store.dart';
import '../core/server_api.dart';
import '../core/socket_service.dart';

final pairingStoreProvider = Provider<PairingStore>((ref) => PairingStore());

final socketServiceProvider = Provider<SocketService>((ref) {
  final service = SocketService();
  ref.onDispose(service.dispose);
  return service;
});

final mdnsDiscoveryProvider = Provider<MdnsDiscovery>((ref) {
  final discovery = MdnsDiscovery();
  ref.onDispose(discovery.dispose);
  return discovery;
});

/// The saved pairing, if any. Null means the app starts at discovery.
class SessionState {
  const SessionState({this.connection, this.loading = true});
  final SavedConnection? connection;
  final bool loading;

  bool get isPaired => connection != null;
}

class SessionNotifier extends AsyncNotifier<SessionState> {
  @override
  Future<SessionState> build() async {
    final connection = await ref.read(pairingStoreProvider).load();
    return SessionState(connection: connection, loading: false);
  }

  Future<void> pair(SavedConnection connection) async {
    await ref.read(pairingStoreProvider).save(connection);
    state = AsyncData(SessionState(connection: connection));
    _startRealtime();
  }

  Future<void> forget() async {
    ref.read(socketServiceProvider).disconnect();
    await ref.read(pairingStoreProvider).clear();
    state = const AsyncData(SessionState());
  }

  void reconnect() => _startRealtime();

  void _startRealtime() {
    final connection = state.value?.connection;
    if (connection == null) return;
    ref.read(showStateProvider.notifier).attach(connection);
  }
}

final sessionProvider =
    AsyncNotifierProvider<SessionNotifier, SessionState>(SessionNotifier.new);

/// Live mirror of the desktop show state, fed by the Socket.IO stream.
class ShowStateNotifier extends Notifier<ShowState> {
  StreamSubscription<SocketEvent>? _events;
  StreamSubscription<ConnectionPhase>? _phases;

  @override
  ShowState build() => const ShowState();

  ConnectionPhase get connectionPhase =>
      ref.read(socketServiceProvider).phase;

  void attach(SavedConnection connection) {
    final socket = ref.read(socketServiceProvider);
    _events?.cancel();
    _phases?.cancel();

    socket.connect(
      host: connection.host,
      port: connection.port,
      token: connection.token,
    );

    _phases = socket.phaseStream.listen((_) {});

    _events = socket.events.listen(_handleEvent);
  }

  void _handleEvent(SocketEvent event) {
    switch (event.name) {
      case 'currentState':
      case 'periodicStateSync':
        if (event.data is Map) {
          state = ShowState.fromCurrentState(
            Map<String, dynamic>.from(event.data as Map),
          );
        }
        break;
      case 'lineUpdate':
        if (event.data is Map) {
          final data = Map<String, dynamic>.from(event.data as Map);
          if (data['index'] is num) {
            state = state.copyWith(selectedLine: (data['index'] as num).toInt());
          }
        }
        break;
      case 'lyricsLoad':
        if (event.data is List) {
          state = state.copyWith(
            lyrics: (event.data as List).map(lyricEntryText).toList(),
            clearSelectedLine: true,
          );
        }
        break;
      case 'fileNameUpdate':
        state = state.copyWith(fileName: event.data?.toString() ?? '');
        break;
      case 'setlistUpdate':
        if (event.data is List) {
          state = state.copyWith(
            setlist: (event.data as List)
                .whereType<Map>()
                .map((e) =>
                    SetlistItem.fromJson(Map<String, dynamic>.from(e)))
                .toList(),
          );
        }
        break;
      case 'outputToggle':
        state = state.copyWith(isOutputOn: event.data == true);
        break;
      case 'individualOutputToggle':
        if (event.data is Map) {
          final map = Map<String, dynamic>.from(event.data as Map);
          final enabled = map['enabled'] == true;
          switch (map['output']) {
            case 'output1':
              state = state.copyWith(output1Enabled: enabled);
              break;
            case 'output2':
              state = state.copyWith(output2Enabled: enabled);
              break;
            case 'stage':
              state = state.copyWith(stageEnabled: enabled);
              break;
          }
        }
        break;
    }
  }

  void detach() {
    _events?.cancel();
    _events = null;
    _phases?.cancel();
    _phases = null;
    ref.read(socketServiceProvider).disconnect();
    state = const ShowState();
  }
}

final showStateProvider =
    NotifierProvider<ShowStateNotifier, ShowState>(ShowStateNotifier.new);

final connectionPhaseProvider = StreamProvider<ConnectionPhase>((ref) {
  return ref.watch(socketServiceProvider).phaseStream;
});

/// REST command helper built from the current pairing.
final serverApiProvider = Provider<ServerApi?>((ref) {
  final connection =
      ref.watch(sessionProvider).valueOrNull?.connection;
  if (connection == null) return null;
  return ServerApi(baseUrl: connection.baseUrl, token: connection.token);
});
