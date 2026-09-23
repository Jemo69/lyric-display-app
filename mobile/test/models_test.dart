import 'package:flutter_test/flutter_test.dart';
import 'package:lyricdisplay_mobile/core/models.dart';

void main() {
  group('DiscoveredServer', () {
    test('equality is host+port based', () {
      const a = DiscoveredServer(name: 'A', host: '1.2.3.4', port: 4000);
      const b = DiscoveredServer(name: 'B', host: '1.2.3.4', port: 4000);
      const c = DiscoveredServer(name: 'C', host: '1.2.3.5', port: 4000);
      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('baseUrl builds URL', () {
      const a = DiscoveredServer(name: 'A', host: '192.168.1.50', port: 4000);
      expect(a.baseUrl, 'http://192.168.1.50:4000');
    });
  });

  group('SavedConnection', () {
    test('json round-trip', () {
      const original = SavedConnection(
        serverName: 'Sanctuary PC',
        host: '192.168.1.50',
        port: 4000,
        token: 'jwt-token',
        deviceId: 'mobile_123_abc',
      );
      final restored = SavedConnection.fromJson(original.toJson());
      expect(restored.serverName, original.serverName);
      expect(restored.host, original.host);
      expect(restored.port, original.port);
      expect(restored.token, original.token);
      expect(restored.deviceId, original.deviceId);
    });
  });

  group('ShowState.fromCurrentState', () {
    test('parses setlistSummary from periodic syncs (not just setlistFiles)', () {
      final state = ShowState.fromCurrentState({
        'lyrics': ['Amazing grace'],
        'selectedLine': 0,
        'lyricsFileName': 'Grace',
        'isOutputOn': true,
        // periodicStateSync shape: no setlistFiles, summary instead.
        'setlistSummary': [
          {'id': 's1', 'displayName': 'Song One.txt', 'fileType': 'txt'},
        ],
      });

      expect(state.setlist, hasLength(1));
      expect(state.setlist.single.displayName, 'Song One');
    });

    test('prefers setlistFiles when both shapes are present', () {
      final state = ShowState.fromCurrentState({
        'lyrics': [],
        'setlistFiles': [
          {'id': 'full', 'displayName': 'Full Song', 'fileType': 'txt'},
        ],
        'setlistSummary': [
          {'id': 'sum', 'displayName': 'Summary Song', 'fileType': 'txt'},
        ],
      });

      expect(state.setlist.single.id, 'full');
    });
  });

  group('SetlistItem', () {
    test('parses displayName and strips extension', () {
      final item = SetlistItem.fromJson(
          {'id': 'x1', 'displayName': 'Amazing Grace.txt'});
      expect(item.id, 'x1');
      expect(item.displayName, 'Amazing Grace');
    });

    test('falls back to name then originalName', () {
      final item = SetlistItem.fromJson({'id': 7, 'name': 'Song.lrc'});
      expect(item.displayName, 'Song');
      final alt = SetlistItem.fromJson(
          {'id': 8, 'originalName': 'Hymn.txt', 'fileType': 'txt'});
      expect(alt.displayName, 'Hymn');
      expect(alt.fileType, 'txt');
    });
  });
}
