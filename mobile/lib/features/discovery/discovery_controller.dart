/// Discovery controller: hybrid mDNS + subnet sweep, plus manual/QR entry.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../core/models.dart';
import '../../core/network_utils.dart';
import '../../state/providers.dart';

class DiscoveryState {
  const DiscoveryState({
    this.servers = const [],
    this.scanning = false,
    this.error,
    this.joinCode,
  });

  final List<DiscoveredServer> servers;
  final bool scanning;
  final String? error;

  /// Join code captured from a scanned QR payload; pairing can prefill it.
  final String? joinCode;
}

class DiscoveryNotifier extends Notifier<DiscoveryState> {
  @override
  DiscoveryState build() => const DiscoveryState();

  Future<void> scan() async {
    state = state.copyWith(scanning: true);
    try {
      final results = await ref.read(discoveryServiceProvider).discover();
      if (results.isEmpty) {
        state = DiscoveryState(
          joinCode: state.joinCode,
          error:
              'No LyricDisplay found on this network — use manual IP or QR below.',
        );
      } else {
        state = state.copyWith(
          servers: results,
          error: null,
          scanning: false,
        );
      }
    } catch (e) {
      state = state.copyWith(
        servers: const [],
        scanning: false,
        error: 'Network discovery unavailable: $e',
      );
      return;
    }
    state = state.copyWith(scanning: false);
  }

  /// Parses `host`, `host:port`, or a full URL and verifies the host actually
  /// runs LyricDisplay before adding it to the list.
  Future<bool> addManualServer(String rawInput) async {
    final trimmed = rawInput.trim();
    if (trimmed.isEmpty) return false;

    var hostPart = trimmed;
    var port = AppConfig.defaultPort;
    if (hostPart.contains('://')) {
      hostPart = hostPart.split('://').last;
    }
    if (hostPart.contains(':')) {
      final parts = hostPart.split(':');
      final parsed = int.tryParse(parts.last);
      if (parsed != null && parts.length == 2) {
        port = parsed;
        hostPart = parts.first;
      }
    }
    final host = NetworkUtils.parseHost(hostPart, port: port);
    if (host.isEmpty) {
      state = state.copyWith(error: 'Enter a valid IP address or hostname.');
      return false;
    }
    return _verifyAndAdd(host, port);
  }

  Future<bool> addQrPayload(String payload) async {
    final parsed = NetworkUtils.parseQrPayload(payload);
    if (parsed == null || parsed.host.isEmpty) {
      state = state.copyWith(error: 'Invalid QR code');
      return false;
    }
    final ok = await _verifyAndAdd(parsed.host, parsed.port);
    if (ok && parsed.joinCode.isNotEmpty) {
      state = state.copyWith(joinCode: parsed.joinCode);
    }
    return ok;
  }

  Future<bool> _verifyAndAdd(String host, int port) async {
    state = state.copyWith(scanning: true, error: null);
    try {
      final server =
          await ref.read(discoveryServiceProvider).verifyHost(host, port);
      if (server == null) {
        state = state.copyWith(
          scanning: false,
          error: 'No LyricDisplay responded at $host:$port',
        );
        return false;
      }
      final servers = [...state.servers]..remove(server);
      servers.add(server);
      state = state.copyWith(
        servers: servers,
        scanning: false,
        error: null,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        scanning: false,
        error: 'Could not verify $host:$port: $e',
      );
      return false;
    }
  }
}

extension on DiscoveryState {
  DiscoveryState copyWith({
    List<DiscoveredServer>? servers,
    bool? scanning,
    String? error,
    String? joinCode,
    bool clearError = false,
  }) =>
      DiscoveryState(
        servers: servers ?? this.servers,
        scanning: scanning ?? this.scanning,
        error: clearError ? null : (error ?? this.error),
        joinCode: joinCode ?? this.joinCode,
      );
}

final discoveryProvider =
    NotifierProvider<DiscoveryNotifier, DiscoveryState>(DiscoveryNotifier.new);
