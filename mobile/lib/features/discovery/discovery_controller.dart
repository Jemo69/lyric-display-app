/// Discovery controller: browses mDNS and merges manual-IP candidates.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/mdns_discovery.dart';
import '../../core/models.dart';
import '../../state/providers.dart';

class DiscoveryState {
  const DiscoveryState({
    this.servers = const [],
    this.scanning = false,
    this.error,
  });

  final List<DiscoveredServer> servers;
  final bool scanning;
  final String? error;
}

class DiscoveryNotifier extends Notifier<DiscoveryState> {
  StreamSubscription<DiscoveryAction>? _sub;

  @override
  DiscoveryState build() {
    ref.onDispose(() => _sub?.cancel());
    return const DiscoveryState();
  }

  Future<void> scan() async {
    _sub?.cancel();
    state = DiscoveryState(scanning: true, servers: state.servers);

    final discovery = ref.read(mdnsDiscoveryProvider);
    try {
      await discovery.start();
    } catch (e) {
      state = DiscoveryState(
        servers: state.servers,
        error: 'Network discovery unavailable: $e',
      );
      return;
    }

    _sub = discovery.stream.listen(
      (action) {
        final servers = [...state.servers];
        if (action.lost) {
          servers.removeWhere((s) => s.name == action.server.name);
        } else if (!servers.contains(action.server) &&
            action.server.host.isNotEmpty) {
          servers.add(action.server);
        }
        state = state.copyWith(servers: servers);
      },
      onError: (Object e) =>
          state = state.copyWith(error: e.toString()),
    );
  }

  void addManualServer(DiscoveredServer server) {
    final servers = [...state.servers];
    if (!servers.contains(server)) servers.add(server);
    state = state.copyWith(servers: servers);
  }
}

extension on DiscoveryState {
  DiscoveryState copyWith({
    List<DiscoveredServer>? servers,
    bool? scanning,
    String? error,
  }) =>
      DiscoveryState(
        servers: servers ?? this.servers,
        scanning: scanning ?? this.scanning,
        error: error,
      );
}

final discoveryProvider =
    NotifierProvider<DiscoveryNotifier, DiscoveryState>(DiscoveryNotifier.new);
