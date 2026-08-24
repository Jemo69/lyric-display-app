/// Typed REST client for the LyricDisplay `/api/v1` endpoints used by mobile.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ServerApi {
  ServerApi({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl/api/v1$path').replace(queryParameters: query);

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    final res = await request().timeout(const Duration(seconds: 8));
    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      throw ApiException(
        (body is Map ? body['error'] : null)?.toString() ??
            'Request failed (${res.statusCode})',
        statusCode: res.statusCode,
      );
    }
    return body;
  }

  Future<Map<String, dynamic>> status() async {
    final body = await _send(() => http.get(_uri('/status'), headers: _headers));
    return Map<String, dynamic>.from(body['status'] as Map);
  }

  Future<int> lyricsNext() async {
    final body = await _send(
      () => http.post(_uri('/lyrics/next'), headers: _headers),
    );
    return (body['selectedLine'] as num).toInt();
  }

  Future<int> lyricsPrev() async {
    final body = await _send(
      () => http.post(_uri('/lyrics/prev'), headers: _headers),
    );
    return (body['selectedLine'] as num).toInt();
  }

  Future<void> lyricsGoto(int lineIndex) => _send(
        () => http.post(
          _uri('/lyrics/goto'),
          headers: _headers,
          body: jsonEncode({'lineIndex': lineIndex}),
        ),
      ).then((_) {});

  Future<bool> outputToggle({bool? on}) async {
    final body = await _send(
      () => http.post(
        _uri('/output/toggle'),
        headers: _headers,
        body: jsonEncode(on == null ? {} : {'on': on}),
      ),
    );
    return body['isOutputOn'] == true;
  }

  Future<List<SetlistItem>> setlist() async {
    final body = await _send(() => http.get(_uri('/setlist'), headers: _headers));
    final items = (body['setlist'] as List?) ?? const [];
    return items
        .whereType<Map>()
        .map((e) => SetlistItem.fromJson(Map<String, dynamic>.from(e)))
        .toList(growable: false);
  }

  Future<void> setlistLoad(String fileId) => _send(
        () => http.post(
          _uri('/setlist/load'),
          headers: _headers,
          body: jsonEncode({'fileId': fileId}),
        ),
      ).then((_) {});

  Future<void> setlistAddText(String name, String content) => _send(
        () => http.post(
          _uri('/setlist/add'),
          headers: _headers,
          body: jsonEncode({
            'name': '$name.txt',
            'content': content,
            'fileType': 'txt',
          }),
        ),
      ).then((_) {});

  Future<void> setlistReorder(List<String> orderedIds) => _send(
        () => http.post(
          _uri('/setlist/reorder'),
          headers: _headers,
          body: jsonEncode({'orderedIds': orderedIds}),
        ),
      ).then((_) {});

  Future<void> bibleReference(String reference) => _send(
        () => http.post(
          _uri('/bible/reference'),
          headers: _headers,
          body: jsonEncode({'reference': reference}),
        ),
      ).then((_) {});

  Future<List<BibleResult>> bibleSearch(String query, {int limit = 20}) async {
    final body = await _send(
      () => http.get(
        _uri('/bible/search', {'q': query, 'limit': '$limit'}),
        headers: _headers,
      ),
    );
    final results = (body['results'] as List?) ?? const [];
    return results
        .whereType<Map>()
        .map((e) => BibleResult.fromJson(Map<String, dynamic>.from(e)))
        .toList(growable: false);
  }

  /// Exchanges a join code for a JWT. Static because it runs before pairing.
  static Future<SavedConnection> pairWithJoinCode({
    required DiscoveredServer server,
    required String joinCode,
    required String deviceId,
  }) async {
    final res = await http
        .post(
          Uri.parse('${server.baseUrl}/api/auth/token'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({
            'clientType': 'mobile',
            'deviceId': deviceId,
            'joinCode': joinCode,
          }),
        )
        .timeout(const Duration(seconds: 8));

    final body = jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400 || body is! Map || body['token'] == null) {
      throw ApiException(
        (body is Map ? body['error'] : null)?.toString() ??
            'Pairing failed (${res.statusCode})',
        statusCode: res.statusCode,
      );
    }
    return SavedConnection(
      serverName: server.name,
      host: server.host,
      port: server.port,
      token: body['token'].toString(),
      deviceId: deviceId,
    );
  }
}
