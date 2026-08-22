import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme.dart';
import '../models/models.dart';

class TransportBar extends StatelessWidget {
  final int selectedLine;
  final int totalLines;
  final VoidCallback onPrev;
  final VoidCallback onNext;

  const TransportBar({
    super.key,
    required this.selectedLine,
    required this.totalLines,
    required this.onPrev,
    required this.onNext,
  });

  @override
  Widget build(BuildContext context) {
    final atStart = selectedLine <= 0;
    final atEnd = totalLines == 0 || selectedLine >= totalLines - 1;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Row(
        children: [
          Expanded(
            child: _TransportButton(
              icon: Icons.skip_previous,
              label: 'Previous',
              onPressed: atStart ? null : () {
                HapticFeedback.selectionClick();
                onPrev();
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              totalLines == 0 ? '0 / 0' : '${selectedLine + 1} / $totalLines',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: ChromaticDusk.softForeground,
                  ),
            ),
          ),
          Expanded(
            child: _TransportButton(
              icon: Icons.skip_next,
              label: 'Next',
              onPressed: atEnd ? null : () {
                HapticFeedback.selectionClick();
                onNext();
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TransportButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  const _TransportButton({
    required this.icon,
    required this.label,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return FilledButton.tonalIcon(
      onPressed: onPressed,
      icon: Icon(icon, size: 28),
      label: Text(label),
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        backgroundColor: ChromaticDusk.violetWell,
        foregroundColor: ChromaticDusk.softForeground,
      ),
    );
  }
}

class LyricsList extends StatelessWidget {
  final List<String> lyrics;
  final int selectedLine;
  final ValueChanged<int> onSelect;
  final ScrollController controller;

  const LyricsList({
    super.key,
    required this.lyrics,
    required this.selectedLine,
    required this.onSelect,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      controller: controller,
      itemCount: lyrics.length,
      itemBuilder: (context, index) {
        final selected = index == selectedLine;
        return ListTile(
          key: ValueKey('lyric-line-$index'),
          minTileHeight: 48,
          onTap: () => onSelect(index),
          title: Text(
            lyrics[index],
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontWeight: selected ? FontWeight.bold : FontWeight.normal,
              color: selected
                  ? ChromaticDusk.auroraCyan
                  : ChromaticDusk.softForeground.withValues(alpha: 0.85),
            ),
          ),
          tileColor:
              selected ? ChromaticDusk.auroraCyan.withValues(alpha: 0.15) : null,
        );
      },
    );
  }
}

class SetlistSheet extends StatelessWidget {
  final List<SetlistItem> items;
  final ValueChanged<SetlistItem> onLoad;

  const SetlistSheet({super.key, required this.items, required this.onLoad});

  static Future<void> show(
    BuildContext context, {
    required List<SetlistItem> items,
    required ValueChanged<SetlistItem> onLoad,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: ChromaticDusk.deepIris,
      isScrollControlled: true,
      builder: (_) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        builder: (context, scrollController) => SetlistSheet(
          items: items,
          onLoad: onLoad,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const Center(child: Text('Setlist is empty'));
    }
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, index) => ListTile(
        leading: Text('${index + 1}',
            style: const TextStyle(color: ChromaticDusk.dustMauve)),
        title: Text(items[index].name),
        onTap: () {
          Navigator.of(context).pop();
          onLoad(items[index]);
        },
      ),
    );
  }
}
