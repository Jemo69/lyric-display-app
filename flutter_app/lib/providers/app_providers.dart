import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/song.dart';
import '../models/bible.dart';
import '../models/settings_and_setlist.dart';

// Current active song provider
class CurrentSongNotifier extends StateNotifier<Song?> {
  CurrentSongNotifier() : super(null);

  void setSong(Song song) {
    state = song;
  }

  void clear() {
    state = null;
  }
}

final currentSongProvider =
    StateNotifierProvider<CurrentSongNotifier, Song?>((ref) {
  return CurrentSongNotifier();
});

// Current active line index provider
final activeLineIndexProvider = StateProvider<int?>((ref) => null);

// Display active state provider (Output switch on/off)
final outputActiveProvider = StateProvider<bool>((ref) => true);

// Song library provider with local storage persistence
class SongLibraryNotifier extends StateNotifier<List<Song>> {
  SongLibraryNotifier() : super([]) {
    _loadSongs();
  }

  static const _key = 'lyric_display_song_library';

  Future<void> _loadSongs() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = prefs.getString(_key);
    if (jsonStr != null) {
      try {
        final List<dynamic> list = jsonDecode(jsonStr);
        state = list.map((item) => Song.fromJson(item)).toList();
      } catch (e) {
        state = [];
      }
    }
  }

  Future<void> _saveSongs() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = jsonEncode(state.map((s) => s.toJson()).toList());
    await prefs.setString(_key, jsonStr);
  }

  void addSong(Song song) {
    state = [...state, song];
    _saveSongs();
  }

  void removeSong(String id) {
    state = state.where((s) => s.id != id).toList();
    _saveSongs();
  }

  void updateSong(Song song) {
    state = [
      for (final s in state)
        if (s.id == song.id) song else s,
    ];
    _saveSongs();
  }
}

final songLibraryProvider =
    StateNotifierProvider<SongLibraryNotifier, List<Song>>((ref) {
  return SongLibraryNotifier();
});

// Output settings providers (Output 1, Output 2, Stage)
class OutputSettingsNotifier extends StateNotifier<OutputSettings> {
  final String key;
  OutputSettingsNotifier(this.key) : super(OutputSettings()) {
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = prefs.getString(key);
    if (jsonStr != null) {
      try {
        state = OutputSettings.fromJson(jsonDecode(jsonStr));
      } catch (e) {
        state = OutputSettings();
      }
    }
  }

  Future<void> updateSettings(OutputSettings settings) async {
    state = settings;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, jsonEncode(settings.toJson()));
  }
}

final output1SettingsProvider =
    StateNotifierProvider<OutputSettingsNotifier, OutputSettings>((ref) {
  return OutputSettingsNotifier('output_1_settings');
});

final output2SettingsProvider =
    StateNotifierProvider<OutputSettingsNotifier, OutputSettings>((ref) {
  return OutputSettingsNotifier('output_2_settings');
});

final stageSettingsProvider =
    StateNotifierProvider<OutputSettingsNotifier, OutputSettings>((ref) {
  return OutputSettingsNotifier('stage_settings');
});

// Active Bible provider
final activeBibleProvider = StateProvider<Bible?>((ref) => null);
