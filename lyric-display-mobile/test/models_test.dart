import 'package:flutter_test/flutter_test.dart';
import 'package:lyric_display_mobile/models/models.dart';

void main() {
  group('DiscoveredHost', () {
    test('equality is host+port based', () {
      const a = DiscoveredHost(name: 'A', host: '1.2.3.4', port: 4000);
      const b = DiscoveredHost(name: 'B', host: '1.2.3.4', port: 4000);
      const c = DiscoveredHost(name: 'C', host: '1.2.3.5', port: 4000);
      expect(a, equals(b));
      expect(a, isNot(equals(c)));
    });

    test('origin builds URL', () {
      const a = DiscoveredHost(name: 'A', host: '192.168.1.50', port: 4000);
      expect(a.origin, 'http://192.168.1.50:4000');
    });
  });

  group('SetlistItem', () {
    test('parses json with name', () {
      final item =
          SetlistItem.fromJson({'id': 'x1', 'name': 'Amazing Grace.txt'});
      expect(item.id, 'x1');
      expect(item.name, 'Amazing Grace.txt');
    });

    test('falls back to fileName field', () {
      final item = SetlistItem.fromJson({'id': 7, 'fileName': 'Song.lrc'});
      expect(item.id, '7');
      expect(item.name, 'Song.lrc');
    });
  });

  group('AppState', () {
    test('copyWith updates selected line', () {
      const state = AppState(lyrics: ['a', 'b', 'c'], selectedLine: 0);
      final updated = state.copyWith(selectedLine: 2);
      expect(updated.selectedLine, 2);
      expect(updated.lyrics.length, 3);
    });
  });
}
