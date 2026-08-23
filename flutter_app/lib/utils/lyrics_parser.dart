import 'song.dart';

final List<List<String>> bracketPairs = [
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['<', '>'],
];

final List<RegExp> structureTagPatterns = [
  RegExp(
      r'^\s*\[(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?(?:\s*:\s*[^\]]*)?\s*\]\s*',
      caseSensitive: false),
  RegExp(
      r'^\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?\s*:\s*',
      caseSensitive: false),
  RegExp(
      r'^\s*\((Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?(?:\s*:\s*[^)]*)?\s*\)\s*',
      caseSensitive: false),
  RegExp(
      r'^\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\s+\d+)?\s*$',
      caseSensitive: false),
];

final RegExp timeTagRegex = RegExp(r'\[(\d{1,2}):(\d{2})(?:\.(\d{1,2}))?\]');
final RegExp metaTagRegex =
    RegExp(r'^\s*\[(ti|ar|al|by|offset|length|au|lr|re|tool|ve|#):.*\]\s*$', caseSensitive: false);

bool isPlaceholderLine(String line) {
  final trimmed = line.trim();
  return RegExp(r'^\[\s*[\?\*\.~…]+\s*\]$').hasMatch(trimmed) ||
      RegExp(r'^\[\s*\.{3,}\s*\]$').hasMatch(trimmed);
}

bool isStructureTag(String line) {
  final trimmed = line.trim();
  return structureTagPatterns.any((pattern) => pattern.hasMatch(trimmed));
}

bool isTranslationLine(String line) {
  final trimmed = line.trim();
  if (trimmed.length <= 2) return false;
  if (isStructureTag(trimmed)) return false;
  if (isPlaceholderLine(trimmed)) return false;

  return bracketPairs.any((pair) => trimmed.startsWith(pair[0]) && trimmed.endsWith(pair[1]));
}

bool isNormalGroupCandidate(String line, {int maxLen = 45}) {
  final trimmed = line.trim();
  if (trimmed.isEmpty) return false;
  if (isTranslationLine(trimmed)) return false;
  if (isStructureTag(trimmed)) return false;
  return trimmed.length <= maxLen;
}

String getSectionLabelFromLine(String line) {
  final cleaned = line
      .replaceAll(RegExp(r'^[\s\[\(\{<]+'), '')
      .replaceAll(RegExp(r'[\]\)\}>]+$'), '')
      .replaceAll(RegExp(r'\s*:\s*$'), '')
      .trim();
  final noArtist = cleaned.split(':')[0].trim();
  return noArtist.replaceAll(RegExp(r'\s+'), ' ').isNotEmpty
      ? noArtist.replaceAll(RegExp(r'\s+'), ' ')
      : 'Section';
}

List<String> splitLongLine(String line, {int maxLen = 70}) {
  if (line.length <= maxLen) return [line];
  final words = line.split(' ');
  final List<String> segments = [];
  String current = '';

  for (final word in words) {
    if ((current + (current.isEmpty ? '' : ' ') + word).length > maxLen) {
      if (current.isNotEmpty) segments.add(current);
      current = word;
    } else {
      current = current.isEmpty ? word : '$current $word';
    }
  }
  if (current.isNotEmpty) segments.add(current);
  return segments;
}

List<LyricLine> processRawTextToLines(String rawText, {bool enableSplitting = true}) {
  final lines = rawText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  final List<List<String>> clusters = [];
  List<String> currentCluster = [];

  for (var line in lines) {
    final trimmed = line.trim();
    if (trimmed.isNotEmpty) {
      currentCluster.add(trimmed);
    } else if (currentCluster.isNotEmpty) {
      clusters.add(List.from(currentCluster));
      currentCluster.clear();
    }
  }
  if (currentCluster.isNotEmpty) clusters.add(currentCluster);

  final List<LyricLine> result = [];
  int lineIndex = 0;

  for (var clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
    final cluster = clusters[clusterIdx];
    int i = 0;

    while (i < cluster.length) {
      final current = cluster[i];
      final next = (i + 1 < cluster.length) ? cluster[i + 1] : null;

      if (next != null &&
          isTranslationLine(next) &&
          !isTranslationLine(current) &&
          !isStructureTag(current) &&
          !isStructureTag(next)) {
        result.add(LyricLine(
          id: 'group_${clusterIdx}_$lineIndex',
          type: 'group',
          text: '$current\n$next',
          mainLine: current,
          translation: next,
          originalIndex: lineIndex,
        ));
        lineIndex += 2;
        i += 2;
        continue;
      }

      if (next != null &&
          isNormalGroupCandidate(current) &&
          isNormalGroupCandidate(next) &&
          !isTranslationLine(next) &&
          !isStructureTag(current) &&
          !isStructureTag(next)) {
        result.add(LyricLine(
          id: 'normal_group_${clusterIdx}_$lineIndex',
          type: 'normal-group',
          text: '$current\n$next',
          line1: current,
          line2: next,
          originalIndex: lineIndex,
        ));
        lineIndex += 2;
        i += 2;
        continue;
      }

      if (enableSplitting && current.length > 70) {
        final segments = splitLongLine(current);
        for (var seg in segments) {
          result.add(LyricLine(
            id: 'line_$lineIndex',
            type: 'line',
            text: seg,
            originalIndex: lineIndex,
          ));
          lineIndex++;
        }
      } else {
        result.add(LyricLine(
          id: 'line_$lineIndex',
          type: 'line',
          text: current,
          originalIndex: lineIndex,
        ));
        lineIndex++;
      }
      i++;
    }
  }

  return result;
}

Song parseTxtContent(String rawText, {String title = 'Untitled', String artist = '', String? filePath}) {
  final processed = processRawTextToLines(rawText);
  final List<SectionMarker> sections = [];
  final Map<int, String> lineToSection = {};

  SectionMarker? currentSection;

  for (int i = 0; i < processed.length; i++) {
    final item = processed[i];
    if (item.type == 'line' && isStructureTag(item.text)) {
      final label = getSectionLabelFromLine(item.text);
      final id = 'section_${sections.length}_$i';
      currentSection = SectionMarker(
        id: id,
        label: label,
        startLine: i,
        endLine: i,
      );
      sections.add(currentSection);
      lineToSection[i] = id;
    } else if (currentSection != null) {
      currentSection = SectionMarker(
        id: currentSection.id,
        label: currentSection.label,
        startLine: currentSection.startLine,
        endLine: i,
      );
      sections[sections.length - 1] = currentSection;
      lineToSection[i] = currentSection.id;
    }
  }

  return Song(
    id: DateTime.now().millisecondsSinceEpoch.toString(),
    title: title,
    artist: artist,
    rawText: rawText,
    processedLines: processed,
    sections: sections,
    lineToSection: lineToSection,
    filePath: filePath,
  );
}

Song parseLrcContent(String rawText, {String title = 'Untitled', String artist = '', String? filePath}) {
  final lines = rawText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  final List<LyricLine> processed = [];
  final List<int?> timestamps = [];
  int index = 0;

  for (var line in lines) {
    if (line.trim().isEmpty || metaTagRegex.hasMatch(line)) continue;

    int? timestamp;
    final match = timeTagRegex.firstMatch(line);
    if (match != null) {
      final mm = int.tryParse(match.group(1) ?? '0') ?? 0;
      final ss = int.tryParse(match.group(2) ?? '0') ?? 0;
      final cs = int.tryParse(match.group(3) ?? '0') ?? 0;
      timestamp = (mm * 60 * 100) + (ss * 100) + cs;
    }

    var cleanText = line.replaceAll(timeTagRegex, '').trim();
    if (cleanText.isEmpty && timestamp != null) cleanText = '♪';
    if (cleanText.isEmpty) continue;

    processed.add(LyricLine(
      id: 'lrc_line_$index',
      type: 'line',
      text: cleanText,
      timestamp: timestamp,
      originalIndex: index,
    ));
    timestamps.add(timestamp);
    index++;
  }

  return Song(
    id: DateTime.now().millisecondsSinceEpoch.toString(),
    title: title,
    artist: artist,
    rawText: rawText,
    processedLines: processed,
    timestamps: timestamps,
    filePath: filePath,
  );
}
