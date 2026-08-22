import 'package:dio/dio.dart';

import '../models/models.dart';

class AuthException implements Exception {
  final String message;
  final int? statusCode;
  final int? retryAfterMs;

  AuthException(this.message, {this.statusCode, this.retryAfterMs});

  @override
  String toString() => message;
}

class ApiClient {
  Dio dio;
  AuthSession? session;
  void Function(AuthException error)? onAuthExpired;

  ApiClient(this.session) : dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 5))) {
    _installInterceptors();
  }

  void updateSession(AuthSession session) {
    this.session = session;
    dio = Dio(BaseOptions(
      baseUrl: session.origin,
      connectTimeout: const Duration(seconds: 5),
    ));
    _installInterceptors();
  }

  void _installInterceptors() {
    dio.interceptors.clear();
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final token = session?.token;
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          final refreshed = await tryRefreshToken();
          if (refreshed != null) {
            final retry = await _retry(error.requestOptions, refreshed);
            return handler.resolve(retry);
          }
          onAuthExpired?.call(AuthException('Session expired'));
        }
        handler.next(error);
      },
    ));
  }

  Future<AuthSession?> tryRefreshToken() async {
    final current = session;
    if (current == null || current.joinCode.isEmpty) return null;
    return authenticate(current.host, current.port, current.joinCode, current.deviceId);
  }

  Future<Response<dynamic>> _retry(RequestOptions requestOptions, AuthSession session) {
    updateSession(session);
    return dio.fetch(requestOptions.copyWith(
      baseUrl: session.origin,
      headers: <String, dynamic>{
        ...Map<String, dynamic>.from(requestOptions.headers),
        'Authorization': 'Bearer ${session.token}',
      },
    ));
  }

  Future<AuthSession> authenticate(
    String host,
    int port,
    String joinCode,
    String deviceId,
  ) async {
    try {
      final response = await Dio(BaseOptions(connectTimeout: const Duration(seconds: 5)))
          .post<Map<String, dynamic>>(
        'http://$host:$port/api/auth/token',
        data: {'clientType': 'mobile', 'deviceId': deviceId, 'joinCode': joinCode},
      );
      final token = response.data?['token']?.toString();
      if (token == null || token.isEmpty) {
        throw AuthException('Server returned no token', statusCode: response.statusCode);
      }
      return AuthSession(
        token: token,
        host: host,
        port: port,
        deviceId: deviceId,
        joinCode: joinCode,
      );
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      final body = e.response?.data;
      final serverMessage =
          body is Map<String, dynamic> ? body['error']?.toString() : null;
      if (code == 403) {
        throw AuthException(serverMessage ?? 'Invalid join code', statusCode: code);
      }
      if (code == 423) {
        throw AuthException(
          'Too many attempts — wait before retrying',
          statusCode: code,
          retryAfterMs:
              body is Map<String, dynamic> ? body['retryAfterMs'] as int? : null,
        );
      }
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.connectionError) {
        throw AuthException('Desktop not reachable — check IP and firewall');
      }
      throw AuthException(serverMessage ?? 'Connection failed ($code)');
    }
  }

  Future<void> getStatus() => dio.get('/api/v1/status');

  Future<List<SetlistItem>> getSetlist() async {
    final response = await dio.get<List<dynamic>>('/api/v1/setlist');
    final items = response.data ?? const [];
    return items
        .whereType<Map<String, dynamic>>()
        .map(SetlistItem.fromJson)
        .toList(growable: false);
  }

  Future<void> loadSetlistItem(String fileId) =>
      dio.post('/api/v1/setlist/load', data: {'fileId': fileId});

  Future<void> nextLine() => dio.post('/api/v1/lyrics/next');

  Future<void> prevLine() => dio.post('/api/v1/lyrics/prev');

  Future<void> gotoLine(int index) =>
      dio.post('/api/v1/lyrics/goto', data: {'lineIndex': index});

  Future<void> toggleOutput(bool on) =>
      dio.post('/api/v1/output/toggle', data: {'on': on});
}
