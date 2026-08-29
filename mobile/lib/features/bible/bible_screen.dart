/// Bible screen: reference quick-load ("John 3:16") plus full-text search.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/theme.dart';
import '../../core/models.dart';
import '../../core/server_api.dart';
import '../../state/providers.dart';

class BibleScreen extends ConsumerStatefulWidget {
  const BibleScreen({super.key});

  @override
  ConsumerState<BibleScreen> createState() => _BibleScreenState();
}

class _BibleScreenState extends ConsumerState<BibleScreen> {
  final _referenceController = TextEditingController();
  final _searchController = TextEditingController();
  bool _busy = false;
  String? _message;
  List<BibleResult> _results = [];

  @override
  void dispose() {
    _referenceController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadReference() async {
    final reference = _referenceController.text.trim();
    if (reference.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await ref.read(serverApiProvider)?.bibleReference(reference);
      if (mounted) {
        setState(() => _message = 'Loaded $reference');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    } catch (_) {
      if (mounted) setState(() => _message = 'Could not reach the server');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final results =
          await ref.read(serverApiProvider)?.bibleSearch(query) ?? [];
      if (mounted) setState(() => _results = results);
    } catch (_) {
      if (mounted) setState(() => _message = 'Search failed');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadVerse(BibleResult result) async {
    if (_busy || result.text.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(serverApiProvider)
          ?.bibleReference(result.reference.isEmpty ? result.text : result.reference);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bible')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _referenceController,
                    textInputAction: TextInputAction.go,
                    onSubmitted: (_) => _loadReference(),
                    decoration:
                        const InputDecoration(hintText: 'Reference — John 3:16'),
                  ),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  onPressed: _busy ? null : _loadReference,
                  child: const Text('LOAD'),
                ),
              ],
            ),
            if (_message != null) ...[
              const SizedBox(height: 8),
              Text(_message!, style: TextStyle(color: AppTheme.textSecondary)),
            ],
            const SizedBox(height: 24),
            TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _search(),
              decoration: InputDecoration(
                hintText: 'Search verses…',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.search),
                  onPressed: _busy ? null : _search,
                ),
              ),
            ),
            const SizedBox(height: 12),
            for (final result in _results)
              Card(
                color: AppTheme.surface,
                child: ListTile(
                  title: Text(
                    result.reference.isEmpty ? 'Result' : result.reference,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(result.text, maxLines: 3),
                  isThreeLine: result.text.length > 80,
                  onTap: () => _loadVerse(result),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
