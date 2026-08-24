import 'dart:convert';

class NetworkUtils {
  static final RegExp _urlHost = RegExp(r'^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?//([^/:?#]+)');

  static bool isLocalHostname(String hostname) {
    final normalized = hostname.toLowerCase();
    if (normalized.isEmpty) return false;
    return normalized == 'localhost' ||
        normalized == '::1' ||
        normalized == '[::1]' ||
        normalized == '0.0.0.0' ||
        normalized.startsWith('127.');
  }

  /// Extracts the host portion of a user-entered value that may be a bare IP,
  /// a hostname, or a full URL like `http://192.168.1.50:4000`.
  static String parseHost(String value, {int? port}) {
    var input = value.trim();
    if (input.isEmpty) return '';
    final match = _urlHost.firstMatch(input);
    if (match != null) {
      input = match.group(1)!;
    }
    input = input.replaceAll(RegExp(r'^\[|\]$'), '');
    if (input.contains('/')) {
      input = input.split('/').first;
    }
    return input;
  }

  /// Parses a QR payload of the form `http://ip:port?joinCode=123456`
  /// or JSON `{host, port, joinCode}`.
  static ({String host, int port, String joinCode})? parseQrPayload(String payload) {
    final trimmed = payload.trim();
    if (trimmed.startsWith('{')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) {
          return (
            host: decoded['host']?.toString() ?? '',
            port: int.tryParse(decoded['port']?.toString() ?? '') ?? 4000,
            joinCode: decoded['joinCode']?.toString() ?? '',
          );
        }
      } catch (_) {
        return null;
      }
    }
    final uri = Uri.tryParse(trimmed);
    if (uri != null && uri.host.isNotEmpty) {
      final code = uri.queryParameters['joinCode'] ?? '';
      return (
        host: uri.host,
        port: uri.port > 0 ? uri.port : 4000,
        joinCode: code,
      );
    }
    return null;
  }

  static List<String> subnetHosts(String deviceIp, {int port = 4000}) {
    final parts = deviceIp.split('.');
    if (parts.length != 4) return const [];
    final prefix = parts.sublist(0, 3).join('.');
    return [for (var i = 1; i <= 254; i++) '$prefix.$i'];
  }
}
