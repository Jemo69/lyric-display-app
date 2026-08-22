import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';

class AuthStorage {
  static const _storage = FlutterSecureStorage();
  static const _keyToken = 'token';
  static const _keyHost = 'host';
  static const _keyPort = 'port';
  static const _keyDeviceId = 'deviceId';
  static const _keyJoinCode = 'joinCode';

  Future<String> deviceId() async {
    final existing = await _storage.read(key: _keyDeviceId);
    if (existing != null && existing.isNotEmpty) return existing;
    final id = 'mobile_${const Uuid().v4()}';
    await _storage.write(key: _keyDeviceId, value: id);
    return id;
  }

  Future<void> saveSession(AuthSession session) async {
    await _storage.write(key: _keyToken, value: session.token);
    await _storage.write(key: _keyHost, value: session.host);
    await _storage.write(key: _keyPort, value: session.port.toString());
    await _storage.write(key: _keyJoinCode, value: session.joinCode);
  }

  Future<AuthSession?> loadSession() async {
    final token = await _storage.read(key: _keyToken);
    final host = await _storage.read(key: _keyHost);
    if (token == null || token.isEmpty || host == null || host.isEmpty) {
      return null;
    }
    final port = int.tryParse(await _storage.read(key: _keyPort) ?? '') ?? 4000;
    final joinCode = await _storage.read(key: _keyJoinCode) ?? '';
    final deviceIdentifier = await deviceId();
    return AuthSession(
      token: token,
      host: host,
      port: port,
      deviceId: deviceIdentifier,
      joinCode: joinCode,
    );
  }

  Future<void> updateToken(String token) =>
      _storage.write(key: _keyToken, value: token);

  Future<void> clear() async {
    await _storage.delete(key: _keyToken);
    await _storage.delete(key: _keyHost);
    await _storage.delete(key: _keyPort);
    await _storage.delete(key: _keyJoinCode);
  }
}
