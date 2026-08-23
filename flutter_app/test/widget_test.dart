import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lyric_display_app/main.dart';

void main() {
  testWidgets('LyricDisplayApp renders Control Panel title', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: LyricDisplayApp()));
    expect(find.text('LyricDisplay - Control Panel'), findsOneWidget);
  });
}
