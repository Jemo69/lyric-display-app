import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';

class MobileControllerScreen extends ConsumerStatefulWidget {
  const MobileControllerScreen({super.key});

  @override
  ConsumerState<MobileControllerScreen> createState() => _MobileControllerScreenState();
}

class _MobileControllerScreenState extends ConsumerState<MobileControllerScreen> {
  bool _isAuthenticated = false;
  final TextEditingController _codeController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    if (!_isAuthenticated) {
      return Scaffold(
        backgroundColor: const Color(0xFF1E1E2E),
        appBar: AppBar(
          backgroundColor: const Color(0xFF181825),
          title: const Text('Mobile Controller Login', style: TextStyle(color: Colors.white)),
        ),
        body: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.phonelink_lock, size: 64, color: Colors.blueAccent),
              const SizedBox(height: 16),
              const Text(
                'Enter 6-Digit Join Code',
                style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 24, letterSpacing: 8),
                decoration: InputDecoration(
                  filled: true,
                  fillColor: const Color(0xFF313244),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  counterStyle: const TextStyle(color: Colors.grey),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blueAccent,
                  minimumSize: const Size(double.infinity, 50),
                ),
                onPressed: () {
                  if (_codeController.text.length == 6) {
                    setState(() {
                      _isAuthenticated = true;
                    });
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Please enter a 6-digit code')),
                    );
                  }
                },
                child: const Text('Connect Controller', style: TextStyle(color: Colors.white, fontSize: 18)),
              )
            ],
          ),
        ),
      );
    }

    final currentSong = ref.watch(currentSongProvider);
    final activeLineIndex = ref.watch(activeLineIndexProvider);
    final isOutputActive = ref.watch(outputActiveProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF1E1E2E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF181825),
        title: Text(currentSong?.title ?? 'Mobile Controller', style: const TextStyle(color: Colors.white)),
        actions: [
          IconButton(
            icon: Icon(
              isOutputActive ? Icons.tv : Icons.tv_off,
              color: isOutputActive ? Colors.green : Colors.red,
            ),
            onPressed: () {
              ref.read(outputActiveProvider.notifier).state = !isOutputActive;
            },
          )
        ],
      ),
      body: currentSong == null
          ? const Center(
              child: Text('No song active on main display', style: TextStyle(color: Colors.grey, fontSize: 16)),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(12),
              itemCount: currentSong.processedLines.length,
              itemBuilder: (context, index) {
                final line = currentSong.processedLines[index];
                final isActive = activeLineIndex == index;

                return Card(
                  color: isActive ? Colors.greenAccent : const Color(0xFF313244),
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(
                      line.text,
                      style: TextStyle(
                        color: isActive ? Colors.black : Colors.white,
                        fontSize: 16,
                        fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    onTap: () {
                      ref.read(activeLineIndexProvider.notifier).state = index;
                    },
                  ),
                );
              },
            ),
    );
  }
}
