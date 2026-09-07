/// Setlist list: load-on-tap, drag reorder, add-text-song dialog.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../state/providers.dart';

class SetlistScreen extends ConsumerWidget {
  const SetlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final show = ref.watch(showStateProvider);
    final api = ref.read(serverApiProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Setlist'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            tooltip: 'Add text song',
            onPressed: api == null
                ? null
                : () => _showAddDialog(context, ref),
          ),
        ],
      ),
      body: SafeArea(
        child: show.setlist.isEmpty
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.playlist_add,
                        size: 64, color: AppTheme.textSecondary),
                    const SizedBox(height: 12),
                    Text(
                      'Setlist is empty.\nAdd songs on the desktop or with +.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppTheme.textSecondary),
                    ),
                  ],
                ),
              )
            : ReorderableListView.builder(
                padding: const EdgeInsets.all(12),
                itemCount: show.setlist.length,
                onReorderItem: (oldIndex, newIndex) =>
                    _reorder(ref, oldIndex, newIndex),
                itemBuilder: (context, index) {
                  final item = show.setlist[index];
                  return Card(
                    key: ValueKey(item.id),
                    color: AppTheme.surface,
                    child: ListTile(
                      leading: Text(
                        '${index + 1}',
                        style: const TextStyle(color: AppTheme.textSecondary),
                      ),
                      title: Text(item.displayName),
                      subtitle: item.fileType == 'lrc'
                          ? const Text('LRC', style: TextStyle(fontSize: 11))
                          : null,
                      trailing: Icon(Icons.drag_handle,
                          color: AppTheme.textSecondary),
                      onTap: () =>
                          api?.setlistLoad(item.id).catchError((_) {}),
                    ),
                  );
                },
              ),
      ),
    );
  }

  void _reorder(WidgetRef ref, int oldIndex, int newIndex) async {
    final ids = ref.read(showStateProvider).setlist.map((e) => e.id).toList();
    final id = ids.removeAt(oldIndex);
    ids.insert(newIndex, id);
    await ref.read(serverApiProvider)?.setlistReorder(ids).catchError((_) {});
  }

  Future<void> _showAddDialog(BuildContext context, WidgetRef ref) async {
    final nameController = TextEditingController();
    final contentController = TextEditingController();

    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Add text song'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              decoration: const InputDecoration(hintText: 'Song title'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: contentController,
              maxLines: 8,
              decoration:
                  const InputDecoration(hintText: 'Lyrics (blank line = slide break)'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (ok != true || !context.mounted) return;
    final name = nameController.text.trim();
    final content = contentController.text;
    if (name.isEmpty || content.isEmpty) return;
    await ref
        .read(serverApiProvider)
        ?.setlistAddText(name, content)
        .catchError((_) {});
  }
}

/// Compact list used as the tablet control-screen sidebar.
class SetlistSidebar extends ConsumerWidget {
  const SetlistSidebar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final show = ref.watch(showStateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Setlist')),
      body: ListView.builder(
        itemCount: show.setlist.length,
        itemBuilder: (context, index) {
          final item = show.setlist[index];
          return ListTile(
            dense: true,
            leading: Text('${index + 1}',
                style: const TextStyle(color: AppTheme.textSecondary)),
            title: Text(
              item.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () =>
                ref.read(serverApiProvider)?.setlistLoad(item.id).catchError((_) {}),
          );
        },
      ),
    );
  }
}
