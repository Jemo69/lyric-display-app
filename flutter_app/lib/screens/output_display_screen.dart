import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../models/settings_and_setlist.dart';

class OutputDisplayScreen extends ConsumerWidget {
  final String outputType; // 'output1', 'output2', 'stage'

  const OutputDisplayScreen({super.key, required this.outputType});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOutputActive = ref.watch(outputActiveProvider);
    final currentSong = ref.watch(currentSongProvider);
    final activeLineIndex = ref.watch(activeLineIndexProvider);

    final settings = outputType == 'output1'
        ? ref.watch(output1SettingsProvider)
        : outputType == 'output2'
            ? ref.watch(output2SettingsProvider)
            : ref.watch(stageSettingsProvider);

    if (!isOutputActive || currentSong == null || activeLineIndex == null || activeLineIndex >= currentSong.processedLines.length) {
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: Container(),
      );
    }

    final activeLine = currentSong.processedLines[activeLineIndex];
    final textToDisplay = settings.isUppercase ? activeLine.text.toUpperCase() : activeLine.text;

    TextAlign textAlign = TextAlign.center;
    if (settings.alignment == 'left') textAlign = TextAlign.left;
    if (settings.alignment == 'right') textAlign = TextAlign.right;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        padding: EdgeInsets.symmetric(
          horizontal: settings.paddingX,
          vertical: settings.paddingY,
        ),
        color: settings.backgroundColor.withOpacity(0.5),
        child: Center(
          child: Text(
            textToDisplay,
            textAlign: textAlign,
            style: TextStyle(
              fontFamily: settings.fontFamily,
              fontSize: settings.fontSize,
              color: settings.textColor,
              fontWeight: settings.isBold ? FontWeight.bold : FontWeight.normal,
              fontStyle: settings.isItalic ? FontStyle.italic : FontStyle.normal,
              decoration: settings.isUnderline ? TextDecoration.underline : TextDecoration.none,
              shadows: [
                Shadow(
                  color: settings.shadowColor,
                  blurRadius: settings.shadowBlur,
                  offset: const Offset(2, 2),
                )
              ],
            ),
          ),
        ),
      ),
    );
  }
}
