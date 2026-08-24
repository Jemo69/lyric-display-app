/// Socket.IO connection: authenticates with the pairing JWT and exposes
/// server events as a broadcast stream for Riverpod providers.
library;

import 'dart:async';
import 'dart:collection';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'config.dart';

enum ConnectionPhase { disconnected, connecting, connected }

class SocketEvent {
  const SocketEvent(this.name, this.data);
  final String name;
  final Object? data;
}

class SocketService {
  io.Socket? _socket;
  StreamController<SocketEvent>? _events;
  StreamController<ConnectionPhase>? _phase;
  final Queue<(String, Object?)> _sendQueue = Queue();
  Timer? _heartbeat;

  Stream<SocketEvent> get events =>
      (_events ??= StreamController.broadcast()).stream;

  Stream<ConnectionPhase> get phaseStream =>
      (_phase ??= StreamController.broadcast()).stream;

  ConnectionPhase get phase => _currentPhase;
  ConnectionPhase _currentPhase = ConnectionPhase.disconnected;

  void connect({required String host, required int port, required String token}) {
    disconnect();
    _setPhase(ConnectionPhase.connecting);

    final socket = io.io(
      'http://$host:$port',
      io.OptionBuilder()
          .setTransports(['polling', 'websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(8000)
          .setTimeout(10000)
          .build(),
    );

    socket.onConnect((_) {
      socket.emit('clientConnect', {'type': 'mobile'});
      socket.emit('requestCurrentState');
      _setPhase(ConnectionPhase.connected);
      _flushQueue();
      _startHeartbeat();
    });

    socket.onDisconnect((_) {
      _stopHeartbeat();
      _setPhase(ConnectionPhase.disconnected);
    });
    socket.onConnectError(
      (data) => _emit(SocketEvent('connectError', data.toString())),
    );

    for (final name in [
      'currentState',
      'periodicStateSync',
      'lineUpdate',
      'lyricsLoad',
      'lyricsTimestampsUpdate',
      'lyricsSectionsUpdate',
      'fileNameUpdate',
      'setlistUpdate',
      'outputToggle',
      'individualOutputToggle',
      'setlistLoadSuccess',
      'permissionError',
      'authError',
    ]) {
      socket.on(name, (data) => _emit(SocketEvent(name, data)));
    }

    _socket = socket;
  }

  void emit(String event, [Object? data]) {
    final socket = _socket;
    if (socket != null && socket.connected) {
      socket.emit(event, data);
    } else if (_sendQueue.length < AppConfig.maxQueuedSocketEvents) {
      _sendQueue.add((event, data));
    }
  }

  void disconnect() {
    _stopHeartbeat();
    _sendQueue.clear();
    _socket?.dispose();
    _socket = null;
    _setPhase(ConnectionPhase.disconnected);
  }

  void dispose() {
    disconnect();
    _events?.close();
    _events = null;
    _phase?.close();
    _phase = null;
  }

  void _setPhase(ConnectionPhase value) {
    _currentPhase = value;
    _phase?.add(value);
  }

  void _emit(SocketEvent event) {
    if (!(_events?.isClosed ?? true)) _events!.add(event);
  }

  void _flushQueue() {
    final socket = _socket;
    while (_sendQueue.isNotEmpty && socket != null && socket.connected) {
      final (event, data) = _sendQueue.removeFirst();
      socket.emit(event, data);
    }
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeat = Timer.periodic(AppConfig.heartbeatInterval, (_) {
      final socket = _socket;
      if (socket != null && socket.connected) socket.emit('heartbeat');
    });
  }

  void _stopHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = null;
  }
}
