class LyricLine {
  final String id;
  final String type; // 'line', 'group', 'normal-group'
  final String text; // main text or full display text
  final String? mainLine;
  final String? translation;
  final String? line1;
  final String? line2;
  final int? timestamp; // centiseconds or milliseconds if applicable
  final int originalIndex;

  LyricLine({
    required this.id,
    required this.type,
    required this.text,
    this.mainLine,
    this.translation,
    this.line1,
    this.line2,
    this.timestamp,
    required this.originalIndex,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'text': text,
        if (mainLine != null) 'mainLine': mainLine,
        if (translation != null) 'translation': translation,
        if (line1 != null) 'line1': line1,
        if (line2 != null) 'line2': line2,
        if (timestamp != null) 'timestamp': timestamp,
        'originalIndex': originalIndex,
      };

  factory LyricLine.fromJson(Map<String, dynamic> json) {
    return LyricLine(
      id: json['id'] ?? '',
      type: json['type'] ?? 'line',
      text: json['text'] ?? '',
      mainLine: json['mainLine'],
      translation: json['translation'],
      line1: json['line1'],
      line2: json['line2'],
      timestamp: json['timestamp'],
      originalIndex: json['originalIndex'] ?? 0,
    );
  }
}

class SectionMarker {
  final String id;
  final String label;
  final int startLine;
  final int endLine;

  SectionMarker({
    required this.id,
    required this.label,
    required this.startLine,
    required this.endLine,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'startLine': startLine,
        'endLine': endLine,
      };

  factory SectionMarker.fromJson(Map<String, dynamic> json) {
    return SectionMarker(
      id: json['id'] ?? '',
      label: json['label'] ?? '',
      startLine: json['startLine'] ?? 0,
      endLine: json['endLine'] ?? 0,
    );
  }
}

class Song {
  final String id;
  final String title;
  final String artist;
  final String rawText;
  final List<LyricLine> processedLines;
  final List<int?> timestamps;
  final List<SectionMarker> sections;
  final Map<int, String> lineToSection;
  final String? filePath;

  Song({
    required this.id,
    required this.title,
    this.artist = '',
    required this.rawText,
    required this.processedLines,
    this.timestamps = const [],
    this.sections = const [],
    this.lineToSection = const {},
    this.filePath,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'rawText': rawText,
        'processedLines': processedLines.map((l) => l.toJson()).toList(),
        'timestamps': timestamps,
        'sections': sections.map((s) => s.toJson()).toList(),
        'filePath': filePath,
      };

  factory Song.fromJson(Map<String, dynamic> json) {
    return Song(
      id: json['id'] ?? '',
      title: json['title'] ?? 'Untitled',
      artist: json['artist'] ?? '',
      rawText: json['rawText'] ?? '',
      processedLines: (json['processedLines'] as List? ?? [])
          .map((l) => LyricLine.fromJson(l))
          .toList(),
      timestamps: (json['timestamps'] as List? ?? []).cast<int?>(),
      sections: (json['sections'] as List? ?? [])
          .map((s) => SectionMarker.fromJson(s))
          .toList(),
      filePath: json['filePath'],
    );
  }
}
