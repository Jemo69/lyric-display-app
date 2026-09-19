import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lyricdisplay_mobile/core/discovery_service.dart';
import 'package:lyricdisplay_mobile/core/models.dart';
import 'package:lyricdisplay_mobile/features/discovery/discovery_controller.dart';
import 'package:lyricdisplay_mobile/state/providers.dart';

class FakeDiscoveryService extends DiscoveryService {
  FakeDiscoveryService(this.results);

  List<DiscoveredServer> results;

  @override
  Future<List<DiscoveredServer>> discover() async => results;
}

const _server =
    DiscoveredServer(name: 'Sanctuary PC', host: '192.168.1.50', port: 4000);

ProviderContainer _container(FakeDiscoveryService fake) => ProviderContainer(
      overrides: [discoveryServiceProvider.overrideWithValue(fake)],
    );

void main() {
  group('DiscoveryNotifier.scan', () {
    test('empty rescan keeps the last good server list', () async {
      final fake = FakeDiscoveryService([_server]);
      final container = _container(fake);
      addTearDown(container.dispose);

      await container.read(discoveryProvider.notifier).scan();
      expect(container.read(discoveryProvider).servers, [_server]);

      // Transient miss (e.g. Wi-Fi hiccup): list must survive.
      fake.results = [];
      await container.read(discoveryProvider.notifier).scan();
      expect(container.read(discoveryProvider).servers, [_server]);
      expect(container.read(discoveryProvider).scanning, isFalse);
    });

    test('shows the empty hint only when nothing was ever found', () async {
      final container = _container(FakeDiscoveryService([]));
      addTearDown(container.dispose);

      await container.read(discoveryProvider.notifier).scan();
      final state = container.read(discoveryProvider);
      expect(state.servers, isEmpty);
      expect(state.error, isNotNull);
    });

    test('a later success clears a previous error', () async {
      final fake = FakeDiscoveryService([]);
      final container = _container(fake);
      addTearDown(container.dispose);

      await container.read(discoveryProvider.notifier).scan();
      expect(container.read(discoveryProvider).error, isNotNull);

      fake.results = [_server];
      await container.read(discoveryProvider.notifier).scan();
      final state = container.read(discoveryProvider);
      expect(state.servers, [_server]);
      expect(state.error, isNull);
    });
  });
}
