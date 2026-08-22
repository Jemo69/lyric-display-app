/// Discovery screen: lists mDNS servers on the church Wi-Fi, with a manual
/// IP fallback and access to an already-saved pairing.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/models.dart';
import '../../state/providers.dart';
import 'discovery_controller.dart';

class DiscoveryScreen extends ConsumerStatefulWidget {
  const DiscoveryScreen({super.key});

  @override
  ConsumerState<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends ConsumerState<DiscoveryScreen> {
  final _manualController = TextEditingController();
  bool _resuming = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(discoveryProvider.notifier).scan();
    });
  }

  @override
  void dispose() {
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _resumeSaved(SavedConnection saved) async {
    setState(() => _resuming = true);
    // Token may be expired; the pair screen handles re-pairing if needed.
    context.go('/pair');
  }

  @override
  Widget build(BuildContext context) {
    final discovery = ref.watch(discoveryProvider);
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Find LyricDisplay'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(discoveryProvider.notifier).scan(),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (session.valueOrNull?.connection case final saved?)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                child: Card(
                  color: AppTheme.surfaceAlt,
                  child: ListTile(
                    leading: Icon(
                      Icons.history,
                      color: _resuming ? null : AppTheme.accent,
                    ),
                    title: Text(saved.serverName),
                    subtitle: Text('${saved.host}:${saved.port} — resume last connection'),
                    trailing: _resuming
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.chevron_right),
                    onTap: () => _resumeSaved(saved),
                  ),
                ),
              ),
            Expanded(
              child: discovery.scanning && discovery.servers.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : discovery.servers.isEmpty
                      ? _EmptyDiscovery(error: discovery.error)
                      : ListView.separated(
                          padding: const EdgeInsets.all(16),
                          itemCount: discovery.servers.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final server = discovery.servers[index];
                            return Card(
                              color: AppTheme.surface,
                              child: ListTile(
                                leading: const Icon(Icons.dns, size: 32),
                                title: Text(server.name),
                                subtitle: Text('${server.host}:${server.port}'),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => context.push('/pair', extra: server),
                              ),
                            );
                          },
                        ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _manualController,
                      keyboardType: TextInputType.url,
                      decoration: const InputDecoration(
                        hintText: 'Manual IP (e.g. 192.168.1.42)',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    onPressed: () {
                      final raw = _manualController.text.trim();
                      if (raw.isEmpty) return;
                      final hostPort = raw.contains(':')
                          ? raw.split(':')
                          : [raw, '4000'];
                      final host = hostPort[0];
                      final port = int.tryParse(hostPort[1]) ?? 4000;
                      ref.read(discoveryProvider.notifier).addManualServer(
                            DiscoveredServer(name: host, host: host, port: port),
                          );
                      context.push(
                        '/pair',
                        extra: DiscoveredServer(
                          name: host,
                          host: host,
                          port: port,
                        ),
                      );
                    },
                    child: const Text('Connect'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyDiscovery extends StatelessWidget {
  const _EmptyDiscovery({this.error});
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.wifi_find,
              size: 72,
              color: error == null ? AppTheme.textSecondary : AppTheme.danger,
            ),
            const SizedBox(height: 16),
            Text(
              error ?? 'No LyricDisplay found yet.\nMake sure this phone is on the same Wi-Fi as the desktop.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ],
        ),
      ),
    );
  }
}
