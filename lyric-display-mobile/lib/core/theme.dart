import 'package:flutter/material.dart';

class ChromaticDusk {
  static const Color nightPlum = Color(0xFF111231);
  static const Color deepIris = Color(0xFF1A1C40);
  static const Color violetWell = Color(0xFF282946);
  static const Color dustMauve = Color(0xFF55464B);
  static const Color auroraCyan = Color(0xFF7DDBD3);
  static const Color lagoonTeal = Color(0xFF42B7A7);
  static const Color fernGreen = Color(0xFF8FCE72);
  static const Color marigold = Color(0xFFE8B45C);
  static const Color coralRed = Color(0xFFE06C75);
  static const Color orchidPink = Color(0xFFC678DD);
  static const Color periwinkle = Color(0xFF82AAFF);
  static const Color softForeground = Color(0xFFD8DEE0);

  static ThemeData theme() {
    const scheme = ColorScheme.dark(
      primary: auroraCyan,
      onPrimary: nightPlum,
      secondary: periwinkle,
      onSecondary: nightPlum,
      surface: deepIris,
      onSurface: softForeground,
      error: coralRed,
      onError: nightPlum,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: nightPlum,
      appBarTheme: const AppBarTheme(
        backgroundColor: nightPlum,
        foregroundColor: softForeground,
        elevation: 0,
      ),
      cardTheme: CardThemeData(
        color: violetWell,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: deepIris),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          backgroundColor: auroraCyan,
          foregroundColor: nightPlum,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: softForeground,
          side: const BorderSide(color: dustMauve),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: deepIris,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: dustMauve),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: auroraCyan, width: 2),
        ),
        labelStyle: const TextStyle(color: dustMauve),
      ),
      listTileTheme: const ListTileThemeData(iconColor: softForeground),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: violetWell,
        contentTextStyle: TextStyle(color: softForeground),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
