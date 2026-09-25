import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lyricdisplay_mobile/app/theme.dart';
import 'package:lyricdisplay_mobile/core/models.dart';
import 'package:lyricdisplay_mobile/features/control/show_control_dock.dart';
import 'package:lyricdisplay_mobile/state/providers.dart';

class _FixedShowState extends ShowStateNotifier {
  _FixedShowState(this.fixed);
  final ShowState fixed;

  @override
  ShowState build() => fixed;
}

ProviderContainer containerWith(ShowState state) {
  final container = ProviderContainer(
    overrides: [showStateProvider.overrideWith(() => _FixedShowState(state))],
  );
  addTearDown(container.dispose);
  return container;
}

Widget wrap(ProviderContainer container, Widget child) => UncontrolledProviderScope(
      container: container,
      child: MaterialApp(
        theme: AppTheme.dark,
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  group('show control state', () {
    test('parses every wire value', () {
      expect(ShowControlState.fromWire('LIVE'), ShowControlState.live);
      expect(ShowControlState.fromWire('clear'), ShowControlState.clear);
      expect(ShowControlState.fromWire('BLACKOUT'), ShowControlState.blackout);
      expect(ShowControlState.fromWire('LOGO'), ShowControlState.logo);
    });

    test('falls back to the legacy boolean for unknown values', () {
      // An older server sends only the master flag.
      expect(ShowControlState.fromWire(true), ShowControlState.live);
      expect(ShowControlState.fromWire(false), ShowControlState.blackout);
      expect(ShowControlState.fromWire(null), ShowControlState.live);
      expect(ShowControlState.fromWire('nonsense'), ShowControlState.live);
    });

    test('only LIVE is master on', () {
      expect(ShowControlState.live.isMasterOn, isTrue);
      for (final state in ShowControlState.values.where((s) => s != ShowControlState.live)) {
        expect(state.isMasterOn, isFalse, reason: '${state.wire} must read as dark');
      }
    });
  });

  group('show state parsing', () {
    test('reads showState and the ticker queue from the socket payload', () {
      final state = ShowState.fromCurrentState(const {
        'showState': 'LOGO',
        'isOutputOn': false,
        'tickerQueue': [
          {'id': 'a', 'text': 'Welcome home', 'targetOutput': 'output2'},
        ],
        'tickerActiveId': 'a',
        'announcementTargetOutputKey': 'output2',
      });

      expect(state.showControl, ShowControlState.logo);
      expect(state.isOutputOn, isFalse);
      expect(state.tickerQueue.single.text, 'Welcome home');
      expect(state.tickerActiveId, 'a');
      expect(state.announcementTargetOutputKey, 'output2');
    });

    test('derives the state from the legacy flag when showState is absent', () {
      expect(
        ShowState.fromCurrentState(const {'isOutputOn': true}).showControl,
        ShowControlState.live,
      );
      expect(
        ShowState.fromCurrentState(const {'isOutputOn': false}).showControl,
        ShowControlState.blackout,
      );
    });

    test('an absent ticker queue is empty, not null', () {
      expect(ShowState.fromCurrentState(const {}).tickerQueue, isEmpty);
    });
  });

  group('dock open and close', () {
    testWidgets('starts expanded and collapses to a summary row', (tester) async {
      final container = containerWith(const ShowState());
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      expect(find.byKey(const Key('dock-body')), findsOneWidget);
      expect(find.text('Live'), findsWidgets);

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('dock-body')), findsNothing);
      // State stays legible while collapsed.
      expect(find.text('Live'), findsOneWidget);
    });

    testWidgets('reopens on a second tap', (tester) async {
      final container = containerWith(const ShowState());
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dock-body')), findsNothing);

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dock-body')), findsOneWidget);
    });

    testWidgets('the collapsed header reflects a non-live state', (tester) async {
      final container =
          containerWith(const ShowState(showControl: ShowControlState.blackout));
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();

      expect(find.text('Blackout'), findsOneWidget);
      expect(find.text('Live'), findsNothing);
    });

    testWidgets('the collapsed header shows the queue depth', (tester) async {
      final container = containerWith(const ShowState(
        tickerQueue: [
          TickerItem(id: 'a', text: 'Welcome home', targetOutput: 'output2'),
          TickerItem(id: 'b', text: 'Nursery open', targetOutput: 'stage'),
        ],
      ));
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();

      expect(find.text('2 queued'), findsOneWidget);
      // The rows themselves are folded away.
      expect(find.text('Welcome home'), findsNothing);
    });

    testWidgets('no queue badge when nothing is queued', (tester) async {
      final container = containerWith(const ShowState());
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      await tester.tap(find.text('Show Control'));
      await tester.pumpAndSettle();

      expect(find.text('queued'), findsNothing);
    });
  });

  group('state grid', () {
    testWidgets('offers all four show states', (tester) async {
      final container = containerWith(const ShowState());
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      for (final state in ShowControlState.values) {
        expect(find.text(state.label), findsWidgets, reason: state.wire);
      }
    });

    testWidgets('a non-live state is reflected in the header', (tester) async {
      final container = containerWith(
        const ShowState(showControl: ShowControlState.clear),
      );
      await tester.pumpWidget(wrap(container, const ShowControlDock()));

      // Header pill and grid button both read "Clear".
      expect(find.text('Clear'), findsNWidgets(2));
    });

    testWidgets('does not overflow a narrow phone screen', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      final container = containerWith(ShowState(
        tickerQueue: [
          TickerItem(id: 'a', text: 'A rather long announcement headline here', targetOutput: 'output2'),
        ],
      ));
      await tester.pumpWidget(wrap(container, const ShowControlDock()));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
    });
  });
}
