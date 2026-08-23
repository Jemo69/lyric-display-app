import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/app_providers.dart';
import '../models/song.dart';
import '../utils/lyrics_parser.dart';

class ControlPanelScreen extends ConsumerStatefulWidget {
  const ControlPanelScreen({super.key});

  @override
  ConsumerState<ControlPanelScreen> createState() => _ControlPanelScreenState();
}

class _ControlPanelScreenState extends ConsumerState<ControlPanelScreen> {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _editorController = TextEditingController();
  int _selectedTabIndex = 0;

  @override
  Widget build(BuildContext context) {
    final currentSong = ref.watch(currentSongProvider);
    final activeLineIndex = ref.watch(activeLineIndexProvider);
    final isOutputActive = ref.watch(outputActiveProvider);
    final songLibrary = ref.watch(songLibraryProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF1E1E2E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF181825),
        title: const Text('LyricDisplay - Control Panel', style: TextStyle(color: Colors.white)),
        actions: [
          Row(
            children: [
              const Text('Display Output', style: TextStyle(color: Colors.white)),
              Switch(
                value: isOutputActive,
                activeColor: Colors.green,
                onChanged: (value) {
                  ref.read(outputActiveProvider.notifier).state = value;
                },
              ),
              const SizedBox(width: 16),
            ],
          )
        ],
      ),
      body: Row(
        children: [
          // Left Panel - Songs & Setlists
          Container(
            width: 280,
            color: const Color(0xFF181825),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: TextField(
                    controller: _searchController,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Search songs...',
                      hintStyle: const TextStyle(color: Colors.grey),
                      prefixIcon: const Icon(Icons.search, color: Colors.grey),
                      filled: true,
                      fillColor: const Color(0xFF313244),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onChanged: (val) {
                      setState(() {});
                    },
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    itemCount: songLibrary.length,
                    itemBuilder: (context, index) {
                      final song = songLibrary[index];
                      if (_searchController.text.isNotEmpty &&
                          !song.title.toLowerCase().contains(_searchController.text.toLowerCase())) {
                        return const SizedBox.shrink();
                      }
                      final isSelected = currentSong?.id == song.id;
                      return ListTile(
                        selected: isSelected,
                        selectedTileColor: const Color(0xFF45475A),
                        title: Text(song.title, style: const TextStyle(color: Colors.white)),
                        subtitle: Text(song.artist.isEmpty ? 'Unknown Artist' : song.artist,
                            style: const TextStyle(color: Colors.grey)),
                        onTap: () {
                          ref.read(currentSongProvider.notifier).setSong(song);
                          ref.read(activeLineIndexProvider.notifier).state = null;
                        },
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF89B4FA),
                      minimumSize: const Size(double.infinity, 40),
                    ),
                    icon: const Icon(Icons.add, color: Colors.black),
                    label: const Text('New Song', style: TextStyle(color: Colors.black)),
                    onPressed: () {
                      _showNewSongDialog(context);
                    },
                  ),
                )
              ],
            ),
          ),
          const VerticalDivider(width: 1, color: Colors.grey),

          // Main Center View - Lyrics Lines / Editor / Bible / Setlist
          Expanded(
            child: Column(
              children: [
                Container(
                  color: const Color(0xFF313244),
                  child: Row(
                    children: [
                      _buildTabButton(0, 'Lyrics List', Icons.list),
                      _buildTabButton(1, 'Editor Canvas', Icons.edit),
                      _buildTabButton(2, 'Bible Browser', Icons.book),
                    ],
                  ),
                ),
                Expanded(
                  child: _selectedTabIndex == 0
                      ? _buildLyricsList(currentSong, activeLineIndex)
                      : _selectedTabIndex == 1
                          ? _buildCanvasEditor(currentSong)
                          : _buildBibleBrowser(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabButton(int index, String title, IconData icon) {
    final isSelected = _selectedTabIndex == index;
    return InkWell(
      onTap: () => setState(() => _selectedTabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: isSelected ? Colors.blue : Colors.transparent, width: 2)),
        ),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? Colors.blue : Colors.grey, size: 18),
            const SizedBox(width: 8),
            Text(title, style: TextStyle(color: isSelected ? Colors.white : Colors.grey)),
          ],
        ),
      ),
    );
  }

  Widget _buildLyricsList(Song? currentSong, int? activeLineIndex) {
    if (currentSong == null) {
      return const Center(
        child: Text('No song selected. Select or create a song to start.', style: TextStyle(color: Colors.grey)),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: currentSong.processedLines.length,
      itemBuilder: (context, index) {
        final line = currentSong.processedLines[index];
        final isActive = activeLineIndex == index;

        return Card(
          color: isActive ? const Color(0xFFA6E3A1) : const Color(0xFF313244),
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            title: Text(
              line.text,
              style: TextStyle(
                color: isActive ? Colors.black : Colors.white,
                fontSize: 18,
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
              ),
            ),
            subtitle: line.timestamp != null
                ? Text('Timestamp: ${line.timestamp} cs',
                    style: TextStyle(color: isActive ? Colors.black54 : Colors.grey))
                : null,
            onTap: () {
              ref.read(activeLineIndexProvider.notifier).state = index;
            },
          ),
        );
      },
    );
  }

  Widget _buildCanvasEditor(Song? currentSong) {
    if (currentSong != null && _editorController.text.isEmpty) {
      _editorController.text = currentSong.rawText;
    }

    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          Expanded(
            child: TextField(
              controller: _editorController,
              maxLines: null,
              expands: true,
              style: const TextStyle(color: Colors.white, fontFamily: 'monospace'),
              decoration: const InputDecoration(
                hintText: 'Enter or paste lyrics here...',
                hintStyle: TextStyle(color: Colors.grey),
                filled: true,
                fillColor: Color(0xFF313244),
                border: OutlineInputBorder(),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              ElevatedButton.icon(
                icon: const Icon(Icons.save),
                label: const Text('Save Song'),
                onPressed: () {
                  if (currentSong != null) {
                    final updatedSong = parseTxtContent(_editorController.text,
                        title: currentSong.title, artist: currentSong.artist);
                    ref.read(songLibraryProvider.notifier).updateSong(updatedSong);
                    ref.read(currentSongProvider.notifier).setSong(updatedSong);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Song saved successfully!')),
                    );
                  }
                },
              ),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildBibleBrowser() {
    return const Center(
      child: Text('Bible Browser View', style: TextStyle(color: Colors.white, fontSize: 18)),
    );
  }

  void _showNewSongDialog(BuildContext context) {
    final titleController = TextEditingController();
    final artistController = TextEditingController();

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF313244),
          title: const Text('New Song', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: titleController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Title',
                  labelStyle: TextStyle(color: Colors.grey),
                ),
              ),
              TextField(
                controller: artistController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Artist (Optional)',
                  labelStyle: TextStyle(color: Colors.grey),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: () {
                if (titleController.text.isNotEmpty) {
                  final newSong = parseTxtContent('', title: titleController.text, artist: artistController.text);
                  ref.read(songLibraryProvider.notifier).addSong(newSong);
                  ref.read(currentSongProvider.notifier).setSong(newSong);
                  Navigator.pop(context);
                }
              },
              child: const Text('Create'),
            )
          ],
        );
      },
    );
  }
}
