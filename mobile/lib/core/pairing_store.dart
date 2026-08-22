/// Secure storage for the active pairing (server address + JWT).
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models.dart';

class PairingStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _key = 'lyricdisplay_pairing';

  Future<SavedConnection?> load() async {
    final raw = await _storage.read(key: _key);
    if (raw == null) return null;
    try {
      return SavedConnection.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> save(SavedConnection connection) =>
      _storage.write(key: _key, value: jsonEncode(connection.toJson()));

  Future<void> clear() => _storage.delete(key: _key);
}

String generateDeviceId() {
  final rand = Random.secure();
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'mobile_${DateTime.now().millisecondsSinceEpoch}_'
      '${List.generate(8, (_) => chars[rand.nextInt(chars.length)]).join()}';
}
