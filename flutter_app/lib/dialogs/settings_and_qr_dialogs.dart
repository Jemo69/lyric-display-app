import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../providers/app_providers.dart';
import '../models/settings_and_setlist.dart';

class SettingsDialog extends ConsumerStatefulWidget {
  final String outputKey; // 'output1', 'output2', 'stage'

  const SettingsDialog({super.key, required this.outputKey});

  @override
  ConsumerState<SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends ConsumerState<SettingsDialog> {
  late double _fontSize;
  late double _paddingX;
  late double _paddingY;
  late bool _isBold;
  late bool _isItalic;
  late bool _isUppercase;

  @override
  void initState() {
    super.initState();
    final settings = _getSettings();
    _fontSize = settings.fontSize;
    _paddingX = settings.paddingX;
    _paddingY = settings.paddingY;
    _isBold = settings.isBold;
    _isItalic = settings.isItalic;
    _isUppercase = settings.isUppercase;
  }

  OutputSettings _getSettings() {
    if (widget.outputKey == 'output1') {
      return ref.read(output1SettingsProvider);
    } else if (widget.outputKey == 'output2') {
      return ref.read(output2SettingsProvider);
    } else {
      return ref.read(stageSettingsProvider);
    }
  }

  void _saveSettings() {
    final current = _getSettings();
    final updated = OutputSettings(
      enabled: current.enabled,
      fontFamily: current.fontFamily,
      fontSize: _fontSize,
      textColor: current.textColor,
      backgroundColor: current.backgroundColor,
      isBold: _isBold,
      isItalic: _isItalic,
      isUnderline: current.isUnderline,
      isUppercase: _isUppercase,
      shadowColor: current.shadowColor,
      shadowBlur: current.shadowBlur,
      paddingX: _paddingX,
      paddingY: _paddingY,
      alignment: current.alignment,
    );

    if (widget.outputKey == 'output1') {
      ref.read(output1SettingsProvider.notifier).updateSettings(updated);
    } else if (widget.outputKey == 'output2') {
      ref.read(output2SettingsProvider.notifier).updateSettings(updated);
    } else {
      ref.read(stageSettingsProvider.notifier).updateSettings(updated);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF313244),
      title: Text('${widget.outputKey.toUpperCase()} Settings', style: const TextStyle(color: Colors.white)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Font Size: ${_fontSize.round()}', style: const TextStyle(color: Colors.white)),
            Slider(
              value: _fontSize,
              min: 16,
              max: 120,
              onChanged: (v) => setState(() => _fontSize = v),
            ),
            Text('Padding X: ${_paddingX.round()}', style: const TextStyle(color: Colors.white)),
            Slider(
              value: _paddingX,
              min: 0,
              max: 100,
              onChanged: (v) => setState(() => _paddingX = v),
            ),
            Text('Padding Y: ${_paddingY.round()}', style: const TextStyle(color: Colors.white)),
            Slider(
              value: _paddingY,
              min: 0,
              max: 100,
              onChanged: (v) => setState(() => _paddingY = v),
            ),
            CheckboxListTile(
              title: const Text('Bold', style: TextStyle(color: Colors.white)),
              value: _isBold,
              onChanged: (v) => setState(() => _isBold = v ?? false),
            ),
            CheckboxListTile(
              title: const Text('Italic', style: TextStyle(color: Colors.white)),
              value: _isItalic,
              onChanged: (v) => setState(() => _isItalic = v ?? false),
            ),
            CheckboxListTile(
              title: const Text('ALL CAPS', style: TextStyle(color: Colors.white)),
              value: _isUppercase,
              onChanged: (v) => setState(() => _isUppercase = v ?? false),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            _saveSettings();
            Navigator.pop(context);
          },
          child: const Text('Save'),
        ),
      ],
    );
  }
}

class QrCodeConnectDialog extends StatelessWidget {
  final String joinCode;

  const QrCodeConnectDialog({super.key, required this.joinCode});

  @override
  Widget build(BuildContext context) {
    const url = 'http://192.168.1.100:4000/?client=mobile';

    return AlertDialog(
      backgroundColor: const Color(0xFF313244),
      title: const Text('Connect Mobile Controller', style: TextStyle(color: Colors.white)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          QrImageView(
            data: url,
            version: QrVersions.auto,
            size: 200.0,
            backgroundColor: Colors.white,
          ),
          const SizedBox(height: 16),
          Text('6-Digit Join Code: $joinCode',
              style: const TextStyle(color: Colors.greenAccent, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          const Text('Scan with phone or enter Join Code on mobile app', style: TextStyle(color: Colors.grey)),
        ],
      ),
      actions: [
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
