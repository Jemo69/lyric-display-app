import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'models/models.dart';
import 'screens/controller_screen.dart';
import 'screens/discovery_screen.dart';
import 'providers/app_controller.dart';

void main() {
  runApp(const ProviderScope(child: LyricDisplayApp()));
}

class LyricDisplayApp extends StatelessWidget {
  const LyricDisplayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LyricDisplay Mobile',
      theme: ChromaticDusk.theme(),
      home: const RootGate(),
    );
  }
}

class RootGate extends ConsumerStatefulWidget {
  const RootGate({super.key});

  @override
  ConsumerState<RootGate> createState() => _RootGateState();
}

class _RootGateState extends ConsumerState<RootGate> {
  bool _restoring = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _restore());
  }

  Future<void> _restore() async {
    final session = await ref.read(authStorageProvider).loadSession();
    if (session == null) {
      if (!mounted) return;
      setState(() => _restoring = false);
      return;
    }
    await ref.read(appControllerProvider.notifier).restoreSession();
    if (!mounted) return;
    final app = ref.read(appControllerProvider);
    setState(() => _restoring = false);
    if (app.status == ConnectionStatus.connected) {
      Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const ControllerScreen()),
        (_) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_restoring) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    return const DiscoveryScreen();
  }
}
