import 'package:flutter_test/flutter_test.dart';
import 'package:lyric_display_mobile/services/network_utils.dart';

void main() {
  group('NetworkUtils.parseHost', () {
    test('parses bare IP', () {
      expect(NetworkUtils.parseHost('192.168.1.50'), '192.168.1.50');
    });

    test('parses URL with port', () {
      expect(NetworkUtils.parseHost('http://192.168.1.50:4000'), '192.168.1.50');
    });

    test('strips path', () {
      expect(NetworkUtils.parseHost('http://10.0.0.2:4000/api/health'), '10.0.0.2');
    });

    test('returns empty for empty input', () {
      expect(NetworkUtils.parseHost('   '), '');
    });
  });

  group('NetworkUtils.parseQrPayload', () {
    test('parses URL form with join code', () {
      final result =
          NetworkUtils.parseQrPayload('http://192.168.1.50:4000?joinCode=123456');
      expect(result, isNotNull);
      expect(result!.host, '192.168.1.50');
      expect(result.port, 4000);
      expect(result.joinCode, '123456');
    });

    test('parses JSON form', () {
      final result = NetworkUtils.parseQrPayload(
          '{"host":"192.168.1.50","port":4000,"joinCode":"654321"}');
      expect(result, isNotNull);
      expect(result!.host, '192.168.1.50');
      expect(result.joinCode, '654321');
    });

    test('returns null for garbage', () {
      expect(NetworkUtils.parseQrPayload('not a qr code'), isNull);
    });
  });

  group('NetworkUtils.subnetHosts', () {
    test('builds /24 host list', () {
      final hosts = NetworkUtils.subnetHosts('192.168.1.42');
      expect(hosts.length, 254);
      expect(hosts.first, '192.168.1.1');
      expect(hosts.last, '192.168.1.254');
    });

    test('returns empty for invalid IP', () {
      expect(NetworkUtils.subnetHosts('not-an-ip'), isEmpty);
    });
  });
}
