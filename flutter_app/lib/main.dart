import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'providers/app_providers.dart';
import 'screens/control_panel_screen.dart';
import 'screens/output_display_screen.dart';
import 'screens/mobile_controller_screen.dart';

void main() {
  runApp(const ProviderScope(child: LyricDisplayApp()));
}

class LyricDisplayApp extends StatelessWidget {
  const LyricDisplayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LyricDisplay',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF1E1E2E),
        primaryColor: const Color(0xFF89B4FA),
      ),
      initialRoute: '/',
      routes: {
        '/': (context) => const ControlPanelScreen(),
        '/output1': (context) => const OutputDisplayScreen(outputType: 'output1'),
        '/output2': (context) => const OutputDisplayScreen(outputType: 'output2'),
        '/stage': (context) => const OutputDisplayScreen(outputType: 'stage'),
        '/mobile': (context) => const MobileControllerScreen(),
      },
    );
  }
}
