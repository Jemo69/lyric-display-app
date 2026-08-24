/// App shell: bottom navigation on phones, navigation rail + two-pane
/// control layout on tablets (≥600dp).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/socket_service.dart' show ConnectionPhase;
import '../../state/providers.dart';

class _Dest {
  const _Dest(this.route, this.icon, this.label);
  final String route;
  final IconData icon;
  final String label;
}

const _destinations = [
  _Dest('/control', Icons.slideshow, 'Control'),
  _Dest('/setlist', Icons.list, 'Setlist'),
  _Dest('/bible', Icons.menu_book, 'Bible'),
  _Dest('/settings', Icons.settings, 'Settings'),
];

class AppShell extends ConsumerWidget {
  const AppShell({required this.child, super.key});
  final Widget child;

  int _indexOf(String path) {
    for (var i = 0; i < _destinations.length; i++) {
      if (_destinations[i].route == path) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final phase =
        ref.watch(connectionPhaseProvider).valueOrNull ??
            ConnectionPhase.disconnected;
    final wide = MediaQuery.sizeOf(context).width >= 600;
    final index = _indexOf(GoRouterState.of(context).uri.path);

    return Scaffold(
      body: Column(
        children: [
          if (phase != ConnectionPhase.connected) const ReconnectBanner(),
          Expanded(
            child: wide
                ? Row(
                    children: [
                      NavigationRail(
                        selectedIndex: index,
                        onDestinationSelected: (i) =>
                            context.go(_destinations[i].route),
                        labelType: NavigationRailLabelType.all,
                        destinations: [
                          for (final d in _destinations)
                            NavigationRailDestination(
                              icon: Icon(d.icon),
                              label: Text(d.label),
                            ),
                        ],
                      ),
                      const VerticalDivider(width: 1),
                      Expanded(child: child),
                    ],
                  )
                : child,
          ),
        ],
      ),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: index,
              destinations: [
                for (final d in _destinations)
                  NavigationDestination(icon: Icon(d.icon), label: d.label),
              ],
              onDestinationSelected: (i) => context.go(_destinations[i].route),
            ),
    );
  }
}

class ReconnectBanner extends StatelessWidget {
  const ReconnectBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.danger,
      child: SafeArea(
        top: false,
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
          child: Row(
            children: [
              const Icon(Icons.wifi_off, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Reconnecting to LyricDisplay…',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
