import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lyricdisplay_mobile/app/theme.dart';
import 'package:lyricdisplay_mobile/core/models.dart';

void main() {
  test('ShowState parses currentState payload from the server', () {
    final state = ShowState.fromCurrentState({
      'lyrics': [
        'Amazing grace',
        {'displayText': 'how sweet\nthe sound', 'type': 'normal-group'},
      ],
      'selectedLine': 1,
      'lyricsFileName': 'Grace',
      'isOutputOn': true,
      'output1Enabled': false,
      'output2Enabled': true,
      'stageEnabled': true,
      'setlistFiles': [
        {'id': 's1', 'displayName': 'Song One.txt', 'fileType': 'txt'},
      ],
    });

    expect(state.lyrics, ['Amazing grace', 'how sweet\nthe sound']);
    expect(state.selectedLine, 1);
    expect(state.currentLine, 'how sweet\nthe sound');
    expect(state.upcomingLine, isNull);
    expect(state.fileName, 'Grace');
    expect(state.isOutputOn, isTrue);
    expect(state.output1Enabled, isFalse);
    expect(state.setlist.single.displayName, 'Song One');
  });

  test('AppTheme is dark with high-contrast accent', () {
    expect(AppTheme.dark.brightness, Brightness.dark);
  });
}
