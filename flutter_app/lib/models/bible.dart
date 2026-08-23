import 'package:xml/xml.dart';

class Verse {
  final int number;
  final String text;

  Verse({required this.number, required this.text});

  Map<String, dynamic> toJson() => {'number': number, 'text': text};
  factory Verse.fromJson(Map<String, dynamic> json) => Verse(
        number: json['number'] ?? 1,
        text: json['text'] ?? '',
      );
}

class Chapter {
  final int number;
  final List<Verse> verses;

  Chapter({required this.number, required this.verses});

  Map<String, dynamic> toJson() => {
        'number': number,
        'verses': verses.map((v) => v.toJson()).toList(),
      };
  factory Chapter.fromJson(Map<String, dynamic> json) => Chapter(
        number: json['number'] ?? 1,
        verses: (json['verses'] as List? ?? [])
            .map((v) => Verse.fromJson(v))
            .toList(),
      );
}

class Book {
  final int number;
  final String name;
  final String abbreviation;
  final List<Chapter> chapters;

  Book({
    required this.number,
    required this.name,
    this.abbreviation = '',
    required this.chapters,
  });

  Map<String, dynamic> toJson() => {
        'number': number,
        'name': name,
        'abbreviation': abbreviation,
        'chapters': chapters.map((c) => c.toJson()).toList(),
      };
  factory Book.fromJson(Map<String, dynamic> json) => Book(
        number: json['number'] ?? 1,
        name: json['name'] ?? '',
        abbreviation: json['abbreviation'] ?? '',
        chapters: (json['chapters'] as List? ?? [])
            .map((c) => Chapter.fromJson(c))
            .toList(),
      );
}

class Bible {
  final String id;
  final String name;
  final String language;
  final List<Book> books;

  Bible({
    required this.id,
    required this.name,
    this.language = 'en',
    required this.books,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'language': language,
        'books': books.map((b) => b.toJson()).toList(),
      };
  factory Bible.fromJson(Map<String, dynamic> json) => Bible(
        id: json['id'] ?? '',
        name: json['name'] ?? '',
        language: json['language'] ?? 'en',
        books: (json['books'] as List? ?? [])
            .map((b) => Book.fromJson(b))
            .toList(),
      );
}

Bible parseBibleXml(String xmlContent, String name) {
  try {
    final document = XmlDocument.parse(xmlContent);
    final List<Book> books = [];

    // Check format
    final zefaniaBooks = document.findAllElements('BIBLEBOOK');
    if (zefaniaBooks.isNotEmpty) {
      int bNum = 1;
      for (final bNode in zefaniaBooks) {
        final bName = bNode.getAttribute('bname') ?? bNode.getAttribute('bsname') ?? 'Book $bNum';
        final List<Chapter> chapters = [];
        int cNum = 1;
        for (final cNode in bNode.findElements('CHAPTER')) {
          final List<Verse> verses = [];
          int vNum = 1;
          for (final vNode in cNode.findElements('VERS')) {
            final vNo = int.tryParse(vNode.getAttribute('vnumber') ?? '') ?? vNum;
            verses.add(Verse(number: vNo, text: vNode.innerText.trim()));
            vNum++;
          }
          final cNo = int.tryParse(cNode.getAttribute('cnumber') ?? '') ?? cNum;
          chapters.add(Chapter(number: cNo, verses: verses));
          cNum++;
        }
        final bNo = int.tryParse(bNode.getAttribute('bnumber') ?? '') ?? bNum;
        books.add(Book(number: bNo, name: bName, chapters: chapters));
        bNum++;
      }
    }

    return Bible(
      id: 'bible_${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      books: books,
    );
  } catch (e) {
    return Bible(
      id: 'bible_err_${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      books: [],
    );
  }
}

class BibleSearchResult {
  final int bookNumber;
  final String bookName;
  final int chapter;
  final int verse;
  final String text;
  final String reference;
  final String bibleId;
  final String bibleName;

  BibleSearchResult({
    required this.bookNumber,
    required this.bookName,
    required this.chapter,
    required this.verse,
    required this.text,
    required this.reference,
    required this.bibleId,
    required this.bibleName,
  });
}

List<BibleSearchResult> searchBible(Bible bible, String query) {
  if (query.trim().isEmpty) return [];
  final lowerQuery = query.toLowerCase().trim();
  final List<BibleSearchResult> results = [];

  for (final book in bible.books) {
    for (final chapter in book.chapters) {
      for (final verse in chapter.verses) {
        if (verse.text.toLowerCase().contains(lowerQuery)) {
          results.add(BibleSearchResult(
            bookNumber: book.number,
            bookName: book.name,
            chapter: chapter.number,
            verse: verse.number,
            text: verse.text,
            reference: '${book.name} ${chapter.number}:${verse.number}',
            bibleId: bible.id,
            bibleName: bible.name,
          ));
        }
      }
    }
  }

  return results.take(50).toList();
}
