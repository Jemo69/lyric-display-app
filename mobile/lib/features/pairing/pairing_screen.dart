/// Pairing screen: numeric keypad for the 6-digit join code → JWT exchange.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/models.dart';
import '../../core/pairing_store.dart';
import '../../core/server_api.dart';
import '../../state/providers.dart';

class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key, this.server});
  final DiscoveredServer? server;

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  String _code = '';
  String? _error;
  bool _submitting = false;

  void _append(String digit) {
    if (_code.length >= 6 || _submitting) return;
    setState(() {
      _code += digit;
      _error = null;
    });
    if (_code.length == 6) _submit();
  }

  Future<void> _submit() async {
    final server = widget.server;
    if (server == null) return;
    setState(() => _submitting = true);

    try {
      final saved = await ref.read(pairingStoreProvider).load();
      final deviceId = saved?.deviceId ?? generateDeviceId();
      final connection = await ServerApi.pairWithJoinCode(
        server: server,
        joinCode: _code,
        deviceId: deviceId,
      );
      await ref.read(sessionProvider.notifier).pair(connection);
      if (mounted) context.go('/control');
    } on ApiException catch (e) {
      setState(() {
        _error = e.statusCode == 423
            ? 'Too many attempts — wait a minute and try again'
            : 'Wrong code. Check the number on the desktop screen.';
        _code = '';
        _submitting = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not reach ${server.host}:${server.port}';
        _code = '';
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final serverName =
        widget.server?.name ?? 'LyricDisplay';

    return Scaffold(
      appBar: AppBar(title: Text('Pair with $serverName')),
      body: SafeArea(
        child: Column(
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'Type the 6-digit code shown on the desktop',
                style: TextStyle(fontSize: 16),
              ),
            ),
            _CodeDots(code: _code),
            const SizedBox(height: 8),
            SizedBox(
              height: 24,
              child: _error != null
                  ? Text(
                      _error!,
                      style: const TextStyle(color: AppTheme.danger),
                    )
                  : null,
            ),
            Expanded(
              child: _Keypad(
                onDigit: _append,
                onBackspace: () {
                  if (_code.isEmpty || _submitting) return;
                  setState(() => _code = _code.substring(0, _code.length - 1));
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CodeDots extends StatelessWidget {
  const _CodeDots({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(6, (i) {
        final filled = i < code.length;
        return Container(
          width: 44,
          height: 56,
          margin: const EdgeInsets.symmetric(horizontal: 6),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppTheme.surfaceAlt,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: filled ? AppTheme.accent : AppTheme.surfaceAlt,
              width: 2,
            ),
          ),
          child: filled
              ? const Text(
                  '•',
                  style: TextStyle(fontSize: 32, height: 1),
                )
              : null,
        );
      }),
    );
  }
}

class _Keypad extends StatelessWidget {
  const _Keypad({required this.onDigit, required this.onBackspace});
  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    const rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['', '0', '⌫'],
    ];

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final row in rows)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  for (final key in row)
                    if (key.isEmpty)
                      const SizedBox(width: 88, height: 72)
                    else ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: AspectRatio(
                          aspectRatio: 1.2,
                          child: Padding(
                            padding: const EdgeInsets.all(4),
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                textStyle: const TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              onPressed: key == '⌫'
                                  ? onBackspace
                                  : () => onDigit(key),
                              child: Text(key),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                    ],
                ],
              ),
          ],
        ),
      ),
    );
  }
}
