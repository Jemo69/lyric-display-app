/// mDNS discovery of LyricDisplay servers via the `bonsoir` package.
library;

import 'dart:async';

import 'package:bonsoir/bonsoir.dart';

import 'models.dart';

const String kServiceType = '_lyricdisplay._tcp';

class MdnsDiscovery {
  BonsoirDiscovery? _discovery;
  final _controller = StreamController<DiscoveryAction>.broadcast();

  /// Emits found/lost actions while browsing.
  Stream<DiscoveryAction> get stream => _controller.stream;

  Future<void> start() async {
    await stop();
    final discovery = BonsoirDiscovery(type: kServiceType);
    await discovery.ready;
    discovery.eventStream!.listen((event) {
      final service = event.service;
      if (service == null) return;
      switch (event.type) {
        case BonsoirDiscoveryEventType.discoveryServiceResolved:
          _controller.add(
            DiscoveryAction(
              DiscoveredServer(
                name: service.name,
                host: service is ResolvedBonsoirService
                    ? service.host ?? ''
                    : '',
                port: service.port,
              ),
              lost: false,
            ),
          );
          break;
        case BonsoirDiscoveryEventType.discoveryServiceLost:
          _controller.add(
            DiscoveryAction(
              DiscoveredServer(name: service.name, host: '', port: service.port),
              lost: true,
            ),
          );
          break;
        default:
          break;
      }
    });
    await discovery.start();
    _discovery = discovery;
  }

  Future<void> stop() async {
    final d = _discovery;
    _discovery = null;
    try {
      if (d != null && d.isReady && !d.isStopped) {
        await d.stop();
      }
    } catch (_) {}
  }

  void dispose() {
    stop();
    _controller.close();
  }
}

class DiscoveryAction {
  const DiscoveryAction(this.server, {required this.lost});
  final DiscoveredServer server;
  final bool lost;
}
