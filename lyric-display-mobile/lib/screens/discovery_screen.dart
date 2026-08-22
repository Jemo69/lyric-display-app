import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_controller.dart';
import 'connect_screen.dart';

class DiscoveryScreen extends ConsumerStatefulWidget {
  const DiscoveryScreen({super.key});

  @override
  ConsumerState<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends ConsumerState<DiscoveryScreen> {
  List<DiscoveredHost> _hosts = [];
  bool _scanning = false;
  String? _message;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scan());
  }

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _message = null;
    });
    try {
      final hosts = await ref.read(appControllerProvider.notifier).discover();
      if (!mounted) return;
      setState(() {
        _hosts = hosts;
        if (hosts.isEmpty) {
          _message =
              'No desktop found. Make sure phone and LyricDisplay PC are on the same Wi-Fi.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _message = 'Scan failed — check Wi-Fi and try again.';
      });
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('LyricDisplay Mobile')),
      body: RefreshIndicator(
        onRefresh: _scan,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            if (_scanning) ...[
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
              const Center(child: Text('Scanning local network…')),
            ] else ...[
              for (final host in _hosts)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading:
                        const Icon(Icons.desktop_windows, color: ChromaticDusk.auroraCyan),
                    title: Text(host.name),
                    subtitle: Text(host.origin),
                    trailing: host.latency != null
                        ? Text('${host.latency!.inMilliseconds}ms',
                            style: const TextStyle(color: ChromaticDusk.dustMauve))
                        : null,
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => ConnectScreen(
                        initialHost: host.host,
                        initialPort: host.port,
                      ),
                    )),
                  ),
                ),
              if (_message != null) ...[
                const SizedBox(height: 24),
                Icon(Icons.wifi_off,
                    size: 48, color: Colors.grey.withValues(alpha: 0.5)),
                const SizedBox(height: 12),
                Center(
                  child: Text(
                    _message!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: ChromaticDusk.dustMauve),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => const ConnectScreen(),
                )),
                icon: const Icon(Icons.edit),
                label: const Text('Enter IP manually'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => ConnectScreen(scanQr: true),
                )),
                icon: const Icon(Icons.qr_code_scanner),
                label: const Text('Scan QR code'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
