import 'dart:async';
import 'dart:collection';

import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/config.dart';
import '../models/models.dart';

class SocketClient {
  io.Socket? _socket;
  final _queue = Queue<(String, Object?)>();
  Timer? _heartbeat;
  final List<String> events;

  SocketClient({this.events = const [
    'currentState',
    'lineUpdate',
    'lyricsLoad',
    'outputToggle',
    'setlistUpdate',
    'permissionError',
  ]});

  void Function(String event, dynamic payload)? onEvent;
  void Function()? onConnected;
  void Function(String message)? onError;

  bool get isConnected => _socket?.connected ?? false;

  void connect(AuthSession session) {
    disconnect();
    _socket = io.io(
      session.origin,
      io.OptionBuilder()
          .setTransports(<String>['websocket', 'polling'])
          .setAuth(<String, dynamic>{'token': session.token})
          .enableReconnection()
          .build(),
    );

    for (final event in events) {
      _socket!.on(event, (data) => onEvent?.call(event, data));
    }
    _socket!.onConnect((_) {
      onConnected?.call();
      flushQueue();
      _startHeartbeat();
    });
    _socket!.onConnectError((data) => onError?.call(data.toString()));
    _socket!.onDisconnect((_) => _stopHeartbeat());
  }

  void emit(String event, [Object? data]) {
    if (isConnected) {
      _socket!.emit(event, data);
    } else if (_queue.length < AppConfig.maxQueuedSocketEvents) {
      _queue.add((event, data));
    }
  }

  void flushQueue() {
    while (_queue.isNotEmpty && isConnected) {
      final (event, data) = _queue.removeFirst();
      _socket!.emit(event, data);
    }
  }

  void requestCurrentState() => emit('requestCurrentState');
  void requestSetlist() => emit('requestSetlist');

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeat = Timer.periodic(AppConfig.heartbeatInterval, (_) {
      if (isConnected) _socket!.emit('heartbeat');
    });
  }

  void _stopHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = null;
  }

  void disconnect() {
    _stopHeartbeat();
    _queue.clear();
    _socket?.dispose();
    _socket = null;
  }
}
