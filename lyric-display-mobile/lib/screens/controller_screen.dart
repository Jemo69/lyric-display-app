import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../providers/app_controller.dart';
import '../widgets/controller_widgets.dart';
import '../widgets/transport_bar.dart';
import 'discovery_screen.dart';

typedef OnSelect = void Function(int index);
typedef OnSetlistItem = void Function(SetlistItem item);

class ControllerScreen extends ConsumerStatefulWidget {
  const ControllerScreen({super.key});

  @override
  ConsumerState<ControllerScreen> createState() => _ControllerScreenState();
}

class _ControllerScreenState extends ConsumerState<ControllerScreen> {
  final _scrollController = ScrollController();
  String _query = '';

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _ensureVisible(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      const rowHeight = 48.0;
      final target = (index * rowHeight - 100).clamp(
        0.0,
        _scrollController.position.maxScrollExtent,
      );
      _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  void _next() {
    HapticFeedback.selectionClick();
    ref.read(appControllerProvider.notifier).next();
  }

  void _prev() {
    HapticFeedback.selectionClick();
    ref.read(appControllerProvider.notifier).prev();
  }

  void _showSetlist(AppState app) {
    SetlistSheet.show(
      context,
      items: app.setlist,
      onLoad: (item) =>
          ref.read(appControllerProvider.notifier).loadSetlistItem(item),
    );
  }

  @override
  Widget build(BuildContext context) {
    final app = ref.watch(appControllerProvider);
    ref.listen(appControllerProvider, (previous, next) {
      if (previous?.selectedLine != next.selectedLine) {
        HapticFeedback.selectionClick();
        _ensureVisible(next.selectedLine);
      }
    });

    final visibleIndices = _query.isEmpty
        ? List<int>.generate(app.lyrics.length, (i) => i)
        : [
            for (var i = 0; i < app.lyrics.length; i++)
              if (app.lyrics[i].toLowerCase().contains(_query.toLowerCase())) i
          ];

    final notifier = ref.read(appControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(app.fileName.isEmpty ? 'LyricDisplay' : app.fileName),
        actions: [
          ConnectionDot(status: app.status),
          const SizedBox(width: 4),
          Switch.adaptive(
            value: app.isOutputOn,
            activeThumbColor: ChromaticDusk.fernGreen,
            onChanged: notifier.toggleOutput,
          ),
          IconButton(
            tooltip: 'Disconnect',
            icon: const Icon(Icons.link_off),
            onPressed: () async {
              await notifier.disconnect();
              if (!context.mounted) return;
              Navigator.of(context, rootNavigator: true).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const DiscoveryScreen()),
                (_) => false,
              );
            },
          ),
        ],
      ),
      floatingActionButton: app.hasLyrics && app.setlist.isNotEmpty
          ? FloatingActionButton.extended(
              heroTag: 'setlist-fab',
              onPressed: () => _showSetlist(app),
              icon: const Icon(Icons.queue_music),
              label: const Text('Setlist'),
            )
          : null,
      body: app.status == ConnectionStatus.disconnected && !app.hasLyrics
          ? _buildOffline(context, notifier)
          : LayoutBuilder(builder: (context, constraints) {
              final isTablet = constraints.maxWidth >= 600;
              final lyrics = [for (final i in visibleIndices) app.lyrics[i]];
              if (isTablet) {
                return _TabletLayout(
                  app: app,
                  lyrics: lyrics,
                  scrollController: _scrollController,
                  query: _query,
                  onQueryChanged: (value) => setState(() => _query = value),
                  onSelect: notifier.gotoLine,
                  onNext: _next,
                  onPrev: _prev,
                  onSetlistItem: notifier.loadSetlistItem,
                );
              }
              return _PhoneLayout(
                app: app,
                lyrics: lyrics,
                scrollController: _scrollController,
                query: _query,
                matchCount: visibleIndices.length,
                onQueryChanged: (value) => setState(() => _query = value),
                onSelect: notifier.gotoLine,
                onNext: _next,
                onPrev: _prev,
              );
            }),
    );
  }

  Widget _buildOffline(BuildContext context, AppController notifier) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.wifi_off, size: 48, color: ChromaticDusk.coralRed),
          const SizedBox(height: 12),
          const Text('Disconnected from desktop'),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: notifier.restoreSession,
            icon: const Icon(Icons.refresh),
            label: const Text('Reconnect'),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  final String query;
  final int matchCount;
  final ValueChanged<String> onChanged;

  const _SearchField({
    required this.query,
    required this.matchCount,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search),
        hintText: 'Search lyrics',
        suffixText: query.isEmpty ? null : '$matchCount',
      ),
      onChanged: onChanged,
    );
  }
}

class _PhoneLayout extends StatelessWidget {
  final AppState app;
  final List<String> lyrics;
  final ScrollController scrollController;
  final String query;
  final int matchCount;
  final ValueChanged<String> onQueryChanged;
  final OnSelect onSelect;
  final VoidCallback onNext;
  final VoidCallback onPrev;

  const _PhoneLayout({
    required this.app,
    required this.lyrics,
    required this.scrollController,
    required this.query,
    required this.matchCount,
    required this.onQueryChanged,
    required this.onSelect,
    required this.onNext,
    required this.onPrev,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Stack(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            child: Column(
              children: [
                CurrentLineCard(
                  line:
                      app.lyrics.isNotEmpty ? app.lyrics[app.selectedLine] : '',
                  fileName: app.fileName,
                  hasLyrics: app.hasLyrics,
                ),
                const SizedBox(height: 12),
                _SearchField(
                  query: query,
                  matchCount: matchCount,
                  onChanged: onQueryChanged,
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: app.hasLyrics
                      ? LyricsList(
                          lyrics: lyrics,
                          selectedLine: app.selectedLine,
                          onSelect: onSelect,
                          controller: scrollController,
                        )
                      : const Center(
                          child: Text('Pick a song from the setlist'),
                        ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: TransportBar(
              selectedLine: app.selectedLine,
              totalLines: app.lyrics.length,
              onPrev: onPrev,
              onNext: onNext,
            ),
          ),
        ],
      ),
    );
  }
}

class _TabletLayout extends StatelessWidget {
  final AppState app;
  final List<String> lyrics;
  final ScrollController scrollController;
  final String query;
  final ValueChanged<String> onQueryChanged;
  final OnSelect onSelect;
  final VoidCallback onNext;
  final VoidCallback onPrev;
  final OnSetlistItem onSetlistItem;

  const _TabletLayout({
    required this.app,
    required this.lyrics,
    required this.scrollController,
    required this.query,
    required this.onQueryChanged,
    required this.onSelect,
    required this.onNext,
    required this.onPrev,
    required this.onSetlistItem,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        NavigationRail(
          backgroundColor: ChromaticDusk.deepIris,
          selectedIndex: 0,
          destinations: const [
            NavigationRailDestination(
              icon: Icon(Icons.queue_music_outlined),
              selectedIcon: Icon(Icons.queue_music),
              label: Text('Controller'),
            ),
          ],
          labelType: NavigationRailLabelType.all,
        ),
        Expanded(
          flex: 3,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: _SearchField(
                  query: query,
                  matchCount: lyrics.length,
                  onChanged: onQueryChanged,
                ),
              ),
              Expanded(
                child: app.hasLyrics
                    ? LyricsList(
                        lyrics: lyrics,
                        selectedLine: app.selectedLine,
                        onSelect: onSelect,
                        controller: scrollController,
                      )
                    : const Center(child: Text('No lyrics loaded')),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TransportBar(
                  selectedLine: app.selectedLine,
                  totalLines: app.lyrics.length,
                  onPrev: onPrev,
                  onNext: onNext,
                ),
              ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: Container(
            color: ChromaticDusk.deepIris.withValues(alpha: 0.5),
            padding: const EdgeInsets.all(16),
            child: ListView(
              children: [
                Text(
                  'SETLIST',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        letterSpacing: 2,
                        color: ChromaticDusk.dustMauve,
                      ),
                ),
                const SizedBox(height: 8),
                for (final item in app.setlist)
                  ListTile(
                    dense: true,
                    title: Text(item.name),
                    onTap: () => onSetlistItem(item),
                  ),
                if (app.setlist.isEmpty)
                  const Text(
                    'Empty',
                    style: TextStyle(color: ChromaticDusk.dustMauve),
                  ),
                const Divider(height: 32),
                CurrentLineCard(
                  line:
                      app.lyrics.isNotEmpty ? app.lyrics[app.selectedLine] : '',
                  fileName: app.fileName,
                  hasLyrics: app.hasLyrics,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
