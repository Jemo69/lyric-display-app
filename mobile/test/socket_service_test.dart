import 'package:flutter_test/flutter_test.dart';
import 'package:lyricdisplay_mobile/core/socket_service.dart';

void main() {
  // Regression for the missed-phase race: connectionPhaseProvider used a
  // broadcast stream with no replay, so subscribers added after the
  // `connected` event fired saw `disconnected` forever — the banner stuck
  // even though the socket was healthy. The listener API must deliver the
  // current status at subscription time, always.
  test('addListener receives current status immediately', () {
    final service = SocketService();
    addTearDown(service.dispose);

    ConnectionStatus? received;
    void listener(ConnectionStatus s) => received = s;

    // No connect() call: initial status must still arrive synchronously.
    service.addListener(listener);
    expect(received, isNotNull);
    expect(received!.phase, ConnectionPhase.disconnected);
    expect(service.status.phase, ConnectionPhase.disconnected);
    expect(service.status.isConnected, isFalse);

    service.removeListener(listener);
  });

  test('status snapshot stays consistent for late listeners', () {
    final service = SocketService();
    addTearDown(service.dispose);

    final seen = <ConnectionStatus>[];
    service.addListener(seen.add);
    expect(seen, hasLength(1));
    // Snapshot and pushed value agree — no stale/disagreement window.
    expect(seen.single.phase, service.status.phase);
  });

  group('isAuthConnectError', () {
    test('flags token rejections from the server auth middleware', () {
      expect(isAuthConnectError('Invalid or expired token'), isTrue);
      expect(isAuthConnectError('Authentication token required'), isTrue);
    });

    test('does not flag network/transport failures', () {
      expect(isAuthConnectError('websocket error'), isFalse);
      expect(isAuthConnectError('timeout'), isFalse);
    });
  });
}
