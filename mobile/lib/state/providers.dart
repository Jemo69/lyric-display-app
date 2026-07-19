/// Central Riverpod wiring: saved pairing, live show state, and commands.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/discovery_service.dart';
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

final discoveryServiceProvider = Provider<DiscoveryService>((ref) {
  return DiscoveryService();
});

/// The saved pairing, if any. Null means the app starts at discovery.
class SessionState {
  const SessionState({
    this.connection,
    this.loading = true,
    this.connectError,
    this.authFailure = false,
  });
  final SavedConnection? connection;
  final bool loading;

  /// Set when the last connect attempt failed; drives the shell's error UI.
  final String? connectError;

  /// True when [connectError] is a token rejection — re-pairing is required.
  final bool authFailure;

  bool get isPaired => connection != null;

  SessionState copyWith({
    SavedConnection? connection,
    bool? loading,
    String? connectError,
    bool clearConnectError = false,
    bool? authFailure,
  }) =>
      SessionState(
        connection: connection ?? this.connection,
        loading: loading ?? this.loading,
        connectError:
            clearConnectError ? null : (connectError ?? this.connectError),
        authFailure: authFailure ?? this.authFailure,
      );
}

class SessionNotifier extends AsyncNotifier<SessionState> {
  @override
  Future<SessionState> build() async {
    final connection = await ref.read(pairingStoreProvider).load();
    // Auto-connect on launch when we have a saved pairing.
    if (connection != null) _startRealtime();
    return SessionState(connection: connection, loading: false);
  }

  Future<void> pair(SavedConnection connection) async {
    await ref.read(pairingStoreProvider).save(connection);
    state = AsyncData(SessionState(connection: connection));
    await _startRealtime();
  }

  Future<void> forget() async {
    ref.read(socketServiceProvider).disconnect();
    await ref.read(pairingStoreProvider).clear();
    state = const AsyncData(SessionState());
  }

  Future<void> reconnect() => _startRealtime();

  Future<void> _startRealtime() async {
    final connection = state.value?.connection;
    if (connection == null) return;
    state = AsyncData(state.value!.copyWith(clearConnectError: true));
    try {
      await ref.read(showStateProvider.notifier).attach(connection);
    } on SocketConnectFailure catch (e) {
      if (e.cancelled) return; // superseded by another connect/forget
      state = AsyncData(state.value!.copyWith(
        connectError: e.isAuthError
            ? 'Pairing expired — enter the code again'
            : 'Could not reach ${connection.host}:${connection.port}',
        authFailure: e.isAuthError,
      ));
    }
  }
}

final sessionProvider =
    AsyncNotifierProvider<SessionNotifier, SessionState>(SessionNotifier.new);

/// Live mirror of the desktop show state, fed by the Socket.IO stream.
class ShowStateNotifier extends Notifier<ShowState> {
  StreamSubscription<SocketEvent>? _events;

  @override
  ShowState build() => const ShowState();

  ConnectionPhase get connectionPhase =>
      ref.read(socketServiceProvider).status.phase;

  /// Starts the socket connection and completes once the socket is connected
  /// (or throws [SocketConnectFailure] on the first failed attempt).
  Future<void> attach(SavedConnection connection) async {
    final socket = ref.read(socketServiceProvider);
    _events?.cancel();

    final connected = socket.connect(
      host: connection.host,
      port: connection.port,
      token: connection.token,
    );

    _events = socket.events.listen(_handleEvent);

    await connected;
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
    ref.read(socketServiceProvider).disconnect();
    state = const ShowState();
  }
}

final showStateProvider =
    NotifierProvider<ShowStateNotifier, ShowState>(ShowStateNotifier.new);

/// Push-based connection status. The SocketService listener pattern means a
/// subscriber added at any moment immediately receives the current status,
/// so the banner never shows stale or missed states.
final connectionStatusProvider =
    NotifierProvider<ConnectionStatusNotifier, ConnectionStatus>(
        ConnectionStatusNotifier.new);

class ConnectionStatusNotifier extends Notifier<ConnectionStatus> {
  @override
  ConnectionStatus build() {
    final socket = ref.watch(socketServiceProvider);
    late final void Function(ConnectionStatus) listener;
    listener = (status) => state = status;
    ref.onDispose(() => socket.removeListener(listener));
    socket.addListener(listener);
    return socket.status;
  }
}

/// REST command helper built from the current pairing.
final serverApiProvider = Provider<ServerApi?>((ref) {
  final connection =
      ref.watch(sessionProvider).valueOrNull?.connection;
  if (connection == null) return null;
  return ServerApi(baseUrl: connection.baseUrl, token: connection.token);
});
