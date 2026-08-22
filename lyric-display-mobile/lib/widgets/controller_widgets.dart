import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/models.dart';

class ConnectionDot extends StatelessWidget {
  final ConnectionStatus status;
  final VoidCallback? onTap;

  const ConnectionDot({super.key, required this.status, this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      ConnectionStatus.connected => ChromaticDusk.fernGreen,
      ConnectionStatus.connecting => ChromaticDusk.marigold,
      ConnectionStatus.disconnected => ChromaticDusk.coralRed,
    };
    return IconButton(
      tooltip: 'Connection status',
      onPressed: onTap,
      icon: Container(
        width: 14,
        height: 14,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      ),
    );
  }
}

class CurrentLineCard extends StatelessWidget {
  final String line;
  final String fileName;
  final bool hasLyrics;

  const CurrentLineCard({
    super.key,
    required this.line,
    required this.fileName,
    required this.hasLyrics,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: SizedBox(
        width: double.infinity,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (fileName.isNotEmpty)
                Text(
                  fileName,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: ChromaticDusk.dustMauve,
                        letterSpacing: 1.2,
                      ),
                ),
              const SizedBox(height: 16),
              Text(
                hasLyrics ? (line.isEmpty ? '—' : line) : 'No lyrics loaded',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: MediaQuery.textScalerOf(context).scale(24).clamp(20, 40),
                  fontWeight: FontWeight.bold,
                  color: hasLyrics
                      ? ChromaticDusk.softForeground
                      : ChromaticDusk.dustMauve,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
