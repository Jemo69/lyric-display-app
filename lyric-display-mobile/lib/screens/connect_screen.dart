import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../providers/app_controller.dart';
import '../services/network_utils.dart';
import 'controller_screen.dart';

class ConnectScreen extends ConsumerStatefulWidget {
  final String initialHost;
  final int initialPort;
  final bool scanQr;

  const ConnectScreen({
    super.key,
    this.initialHost = '',
    this.initialPort = AppConfig.defaultPort,
    this.scanQr = false,
  });

  @override
  ConsumerState<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends ConsumerState<ConnectScreen> {
  late final TextEditingController _host;
  late final TextEditingController _port;
  late final TextEditingController _joinCode;
  bool _connecting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _host = TextEditingController(text: widget.initialHost);
    _port =
        TextEditingController(text: widget.initialPort.toString());
    _joinCode = TextEditingController();
    if (widget.scanQr) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openQrScanner());
    }
  }

  @override
  void dispose() {
    _host.dispose();
    _port.dispose();
    _joinCode.dispose();
    super.dispose();
  }

  Future<void> _openQrScanner() async {
    final result = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => const _QrScannerScreen(),
    ));
    if (result == null) return;
    final parsed = NetworkUtils.parseQrPayload(result);
    if (parsed == null || parsed.host.isEmpty) {
      setState(() => _error = 'QR code was not a LyricDisplay pairing code');
      return;
    }
    setState(() {
      _host.text = parsed.host;
      _port.text = parsed.port.toString();
      if (parsed.joinCode.isNotEmpty) _joinCode.text = parsed.joinCode;
    });
    await _connect();
  }

  Future<void> _connect() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _error = null;
      _connecting = true;
    });
    final host = NetworkUtils.parseHost(_host.text);
    final port = int.tryParse(_port.text.trim()) ?? AppConfig.defaultPort;
    final joinCode = _joinCode.text.trim();

    if (host.isEmpty) {
      setState(() {
        _error = 'Enter the desktop IP address';
        _connecting = false;
      });
      return;
    }
    if (joinCode.length != 6) {
      setState(() {
        _error = 'Enter the 6-digit join code shown on the desktop';
        _connecting = false;
      });
      return;
    }

    final ok = await ref.read(appControllerProvider.notifier).connect(
          host: host,
          port: port,
          joinCode: joinCode,
        );
    if (!mounted) return;
    setState(() => _connecting = false);
    if (!ok) {
      setState(() => _error = ref.read(appControllerProvider).error);
      return;
    }
    HapticFeedback.mediumImpact();
    Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ControllerScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Connect to desktop')),
      body: AutofillGroup(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextField(
              controller: _host,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(
                labelText: 'Desktop IP',
                hintText: '192.168.1.50',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _port,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Port'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _joinCode,
              autofocus: widget.initialHost.isNotEmpty,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(
                labelText: 'Join code',
                counterText: '',
                helperText:
                    'Shown on the desktop under Connect Mobile Controller',
              ),
              onSubmitted: (_) => _connect(),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _connecting ? null : _connect,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: _connecting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Connect'),
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: () async => _openQrScanner(),
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Scan QR code instead'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: ChromaticDusk.coralRed),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _QrScannerScreen extends StatefulWidget {
  const _QrScannerScreen();

  @override
  State<_QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<_QrScannerScreen> {
  bool _handled = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan desktop QR')),
      body: MobileScanner(
        onDetect: (capture) {
          if (_handled) return;
          for (final barcode in capture.barcodes) {
            final value = barcode.rawValue;
            if (value == null) continue;
            _handled = true;
            Navigator.of(context).pop(value);
            return;
          }
        },
      ),
    );
  }
}
