import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/models.dart';
import '../services/api_client.dart';
import '../services/auth_storage.dart';
import '../services/discovery_service.dart';
import '../services/socket_client.dart';

class AuthState {
  final bool restoring;
  final AuthSession? session;
  final String? error;

  const AuthState({this.restoring = false, this.session, this.error});
}

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());
final discoveryProvider =
    Provider<DiscoveryService>((ref) => DiscoveryService());

class AppController extends Notifier<AppState> {
  ApiClient? _api;
  SocketClient? _socket;

  @override
  AppState build() => const AppState();

  void _handleSocketEvent(String event, dynamic payload) {
    switch (event) {
      case 'currentState':
        state = state.copyWith(
          lyrics: _toStringList(payload?['lyrics']),
          selectedLine: _toInt(payload?['selectedLine']) ?? 0,
          fileName: payload?['fileName']?.toString() ?? '',
          isOutputOn: payload?['isOutputOn'] == true,
        );
        break;
      case 'lineUpdate':
        final index = _toInt(payload is Map ? payload['index'] : payload);
        if (index != null && index != state.selectedLine) {
          state = state.copyWith(selectedLine: index);
        }
        break;
      case 'lyricsLoad':
        state = state.copyWith(
          lyrics: _toStringList(payload),
          selectedLine: 0,
        );
        break;
      case 'outputToggle':
        state = state.copyWith(
          isOutputOn: payload == true || (payload is Map && payload['on'] == true),
        );
        break;
      case 'setlistUpdate':
        final items = (payload as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(SetlistItem.fromJson)
            .toList(growable: false);
        state = state.copyWith(setlist: items);
        break;
    }
  }

  Future<void> restoreSession() async {
    final storage = ref.read(authStorageProvider);
    try {
      final saved = await storage.loadSession();
      if (saved == null) return;
      await _establishSession(saved);
      await _refresh();
      state = state.copyWith(status: ConnectionStatus.connected);
    } on AuthException catch (e) {
      state = state.copyWith(error: e.message);
      await storage.clear();
    } catch (_) {
      // Fall back to discovery screen.
    }
  }

  Future<List<DiscoveredHost>> discover() =>
      ref.read(discoveryProvider).discover();

  Future<DiscoveredHost?> verifyHost(String host, int port) =>
      ref.read(discoveryProvider).verifyHost(host, port);

  Future<bool> connect({
    required String host,
    required int port,
    required String joinCode,
  }) async {
    final storage = ref.read(authStorageProvider);
    state = state.copyWith(status: ConnectionStatus.connecting);
    try {
      final deviceId = await storage.deviceId();
      final api = ApiClient(null);
      final session = await api.authenticate(host, port, joinCode, deviceId);
      await _establishSession(session);
      await storage.saveSession(session);
      await _refresh();
      state = state.copyWith(status: ConnectionStatus.connected);
      return true;
    } on AuthException catch (e) {
      state = state.copyWith(status: ConnectionStatus.disconnected, error: e.message);
      return false;
    } catch (e) {
      state = state.copyWith(
        status: ConnectionStatus.disconnected,
        error: 'Connection failed: $e',
      );
      return false;
    }
  }

  Future<void> disconnect() async {
    _socket?.disconnect();
    _api = null;
    _socket = null;
    await ref.read(authStorageProvider).clear();
    state = const AppState();
  }

  Future<void> next() async {
    if (!state.hasLyrics) return;
    final target = (state.selectedLine + 1).clamp(0, state.lyrics.length - 1);
    state = state.copyWith(selectedLine: target);
    _socket?.emit('lineUpdate', {'index': target});
    unawaited(_safe(() => _api?.nextLine()));
  }

  Future<void> prev() async {
    if (!state.hasLyrics) return;
    final target = (state.selectedLine - 1).clamp(0, state.lyrics.length - 1);
    state = state.copyWith(selectedLine: target);
    _socket?.emit('lineUpdate', {'index': target});
    unawaited(_safe(() => _api?.prevLine()));
  }

  Future<void> gotoLine(int index) async {
    if (!state.hasLyrics) return;
    final target = index.clamp(0, state.lyrics.length - 1);
    state = state.copyWith(selectedLine: target);
    _socket?.emit('lineUpdate', {'index': target});
    unawaited(_safe(() => _api?.gotoLine(target)));
  }

  Future<void> toggleOutput(bool on) async {
    state = state.copyWith(isOutputOn: on);
    _socket?.emit('outputToggle', on);
    unawaited(_safe(() => _api?.toggleOutput(on)));
  }

  Future<void> loadSetlistItem(SetlistItem item) async {
    await _safe(() => _api?.loadSetlistItem(item.id));
    _socket?.requestCurrentState();
  }

  Future<void> refresh() => _refresh();

  Future<void> _establishSession(AuthSession session) async {
    _api ??= ApiClient(session)..updateSession(session);
    _api!.updateSession(session);

    _socket?.disconnect();
    final socket = SocketClient()
      ..onEvent = _handleSocketEvent
      ..onConnected = () {
        requestRefresh();
      }
      ..connect(session);
    _socket = socket;
  }

  void requestRefresh() {
    _socket?.requestCurrentState();
    _socket?.requestSetlist();
  }

  Future<void> _refresh() async {
    try {
      await _api?.getStatus();
    } catch (_) {}
    requestRefresh();
  }

  Future<void> _safe(FutureOr<void> Function() action) async {
    try {
      await action();
    } on DioException catch (e) {
      if (e.response?.statusCode != 401) return;
      state = state.copyWith(status: ConnectionStatus.disconnected);
    } catch (_) {}
  }

  List<String> _toStringList(dynamic value) {
    if (value is! List) return const [];
    return value.map((line) => line.toString()).toList(growable: false);
  }

  int? _toInt(dynamic value) => value is int ? value : int.tryParse('$value');
}

final appControllerProvider =
    NotifierProvider<AppController, AppState>(AppController.new);
