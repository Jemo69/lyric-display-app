/// Control screen: live lyric preview, oversized prev/next pad, output
/// toggles and blackout. On tablets it renders as a two-pane layout with
/// the setlist sidebar on the left.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models.dart';
import '../../state/providers.dart';
import '../setlist/setlist_screen.dart';

class ControlScreen extends ConsumerWidget {
  const ControlScreen({super.key});

  Future<void> _sendNext(WidgetRef ref) async {
    final api = ref.read(serverApiProvider);
    if (api == null) return;
    try {
      await api.lyricsNext();
    } catch (_) {}
  }

  Future<void> _sendPrev(WidgetRef ref) async {
    final api = ref.read(serverApiProvider);
    if (api == null) return;
    try {
      await api.lyricsPrev();
    } catch (_) {}
  }

  void _showJumpSheet(BuildContext context, WidgetRef ref) {
    final state = ref.read(showStateProvider);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.surface,
      builder: (context) => _LineJumpSheet(
        lyrics: state.lyrics,
        selectedLine: state.selectedLine,
        onPick: (index) {
          Navigator.of(context).pop();
          final api = ref.read(serverApiProvider);
          api?.lyricsGoto(index).catchError((_) {});
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final show = ref.watch(showStateProvider);
    final wide = MediaQuery.sizeOf(context).width >= 600;
    final hasLyrics = show.hasLyrics;

    final controlPad = _ControlPad(
      show: show,
      onPrev: hasLyrics ? () => _sendPrev(ref) : null,
      onNext: hasLyrics ? () => _sendNext(ref) : null,
      onJump: hasLyrics ? () => _showJumpSheet(context, ref) : null,
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(
          show.fileName.isEmpty ? 'No song loaded' : show.fileName,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: SafeArea(
        child: wide
            ? Row(
                children: [
                  SizedBox(width: 300, child: const SetlistSidebar()),
                  const VerticalDivider(width: 1),
                  Expanded(child: controlPad),
                ],
              )
            : controlPad,
      ),
    );
  }
}

class _ControlPad extends StatelessWidget {
  const _ControlPad({
    required this.show,
    this.onPrev,
    this.onNext,
    this.onJump,
  });

  final ShowState show;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;
  final VoidCallback? onJump;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          Expanded(
            flex: 3,
            child: _LivePreview(show: show),
          ),
          Expanded(
            flex: 2,
            child: Row(
              children: [
                Expanded(
                  child: _NavButton(
                    icon: Icons.skip_previous,
                    label: 'PREV',
                    onPressed: onPrev,
                  ),
                ),
                Expanded(
                  child: _NavButton(
                    icon: Icons.format_list_numbered,
                    label: 'JUMP',
                    onPressed: onJump,
                    secondary: true,
                  ),
                ),
                Expanded(
                  child: _NavButton(
                    icon: Icons.skip_next,
                    label: 'NEXT',
                    onPressed: onNext,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          _OutputRow(show: show),
          const SizedBox(height: 12),
          _BlackoutButton(show: show),
        ],
      ),
    );
  }
}

class _LivePreview extends StatelessWidget {
  const _LivePreview({required this.show});
  final ShowState show;

  @override
  Widget build(BuildContext context) {
    final current = show.currentLine ?? (show.hasLyrics ? '' : null);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'ON SCREEN',
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 2,
              color: AppTheme.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
          const Spacer(),
          Text(
            current ?? '—',
            style: TextStyle(
              fontSize: 30,
              height: 1.25,
              fontWeight: FontWeight.w600,
              color: current == null
                  ? AppTheme.textSecondary
                  : AppTheme.textPrimary,
            ),
          ),
          const Spacer(),
          Text(
            'NEXT',
            style: TextStyle(
              fontSize: 12,
              letterSpacing: 2,
              color: AppTheme.accentDim,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            show.upcomingLine ?? '',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 18,
              color: AppTheme.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.secondary = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool secondary;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(4),
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor:
              secondary ? AppTheme.surfaceAlt : AppTheme.accent,
          foregroundColor:
              secondary ? AppTheme.textPrimary : const Color(0xFF10140C),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        onPressed: onPressed,
        icon: Icon(icon, size: 34),
        label: Text(label),
      ),
    );
  }
}

class _OutputRow extends ConsumerWidget {
  const _OutputRow({required this.show});
  final ShowState show;

  Future<void> _toggle(WidgetRef ref, String output, bool enabled) async {
    final socket = ref.read(socketServiceProvider);
    socket.emit('individualOutputToggle', {'output': output, 'enabled': enabled});
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _OutputSwitch(
            label: 'Output 1',
            value: show.output1Enabled && show.isOutputOn,
            onChanged: show.isOutputOn
                ? (v) => _toggle(ref, 'output1', v)
                : null,
          ),
          _OutputSwitch(
            label: 'Output 2',
            value: show.output2Enabled && show.isOutputOn,
            onChanged: show.isOutputOn
                ? (v) => _toggle(ref, 'output2', v)
                : null,
          ),
          _OutputSwitch(
            label: 'Stage',
            value: show.stageEnabled && show.isOutputOn,
            onChanged: show.isOutputOn
                ? (v) => _toggle(ref, 'stage', v)
                : null,
          ),
        ],
      ),
    );
  }
}

class _OutputSwitch extends StatelessWidget {
  const _OutputSwitch({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Switch(value: value, onChanged: onChanged),
        Text(label),
      ],
    );
  }
}

class _BlackoutButton extends ConsumerWidget {
  const _BlackoutButton({required this.show});
  final ShowState show;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isOn = show.isOutputOn;
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        style: FilledButton.styleFrom(
          backgroundColor: isOn ? AppTheme.danger : AppTheme.accent,
          foregroundColor:
              isOn ? Colors.white : const Color(0xFF10140C),
        ),
        onPressed: () {
          final socket = ref.read(socketServiceProvider);
          socket.emit('outputToggle', !isOn);
        },
        icon: Icon(isOn ? Icons.visibility_off : Icons.visibility, size: 28),
        label: Text(isOn ? 'BLACKOUT' : 'SHOW OUTPUT'),
      ),
    );
  }
}

class _LineJumpSheet extends StatelessWidget {
  const _LineJumpSheet({
    required this.lyrics,
    required this.selectedLine,
    required this.onPick,
  });

  final List<String> lyrics;
  final int? selectedLine;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) {
    final controller = ScrollController(
      initialScrollOffset: selectedLine == null || selectedLine == 0
          ? 0
          : (selectedLine! * 56.0 - 200).clamp(0.0, double.maxFinite),
    );

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.6,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              'Jump to line',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: controller,
              itemCount: lyrics.length,
              itemBuilder: (context, index) {
                final selected = index == selectedLine;
                return ListTile(
                  selected: selected,
                  leading: Text('$index',
                      style: const TextStyle(color: AppTheme.textSecondary)),
                  title: Text(lyrics[index], maxLines: 2),
                  onTap: () => onPick(index),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
