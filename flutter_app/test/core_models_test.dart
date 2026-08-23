import 'package:flutter_test/flutter_test.dart';
import 'package:lyric_display_app/models/song.dart';
import 'package:lyric_display_app/models/bible.dart';
import 'package:lyric_display_app/utils/lyrics_parser.dart';

void main() {
  group('LyricsParser Tests', () {
    test('parseTxtContent correctly handles bracketed translations and section tags', () {
      const raw = '''
[Verse 1]
Amazing grace how sweet the sound
[Oh grace divine]
That saved a wretch like me
''';

      final song = parseTxtContent(raw, title: 'Amazing Grace');

      expect(song.title, equals('Amazing Grace'));
      expect(song.processedLines.isNotEmpty, isTrue);
      // Check section tag
      expect(song.sections.length, equals(1));
      expect(song.sections.first.label, equals('Verse 1'));

      // Check translation grouping
      final groupLine = song.processedLines.firstWhere((l) => l.type == 'group');
      expect(groupLine.mainLine, equals('Amazing grace how sweet the sound'));
      expect(groupLine.translation, equals('[Oh grace divine]'));
    });

    test('parseLrcContent parses timestamps properly', () {
      const lrcRaw = '''
[00:12.34]Amazing grace how sweet the sound
[00:18.50]That saved a wretch like me
''';

      final song = parseLrcContent(lrcRaw, title: 'Amazing Grace LRC');

      expect(song.processedLines.length, equals(2));
      expect(song.timestamps.first, equals(1234)); // 0*6000 + 12*100 + 34
    });
  });

  group('Bible Parser Tests', () {
    test('parseBibleXml and search', () {
      const xml = '''
<BIBLE>
  <BIBLEBOOK bnumber="1" bname="Genesis">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">In the beginning God created the heaven and the earth.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
</BIBLE>
''';

      final bible = parseBibleXml(xml, 'KJV');
      expect(bible.books.length, equals(1));
      expect(bible.books.first.name, equals('Genesis'));

      final searchResults = searchBible(bible, 'beginning');
      expect(searchResults.length, equals(1));
      expect(searchResults.first.reference, equals('Genesis 1:1'));
    });
  });
}
