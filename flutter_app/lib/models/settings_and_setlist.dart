import 'package:flutter/material.dart';

class OutputSettings {
  final bool enabled;
  final String fontFamily;
  final double fontSize;
  final Color textColor;
  final Color backgroundColor;
  final bool isBold;
  final bool isItalic;
  final bool isUnderline;
  final bool isUppercase;
  final Color shadowColor;
  final double shadowBlur;
  final double paddingX;
  final double paddingY;
  final String alignment; // 'center', 'left', 'right'

  OutputSettings({
    this.enabled = true,
    this.fontFamily = 'Roboto',
    this.fontSize = 48.0,
    this.textColor = Colors.white,
    this.backgroundColor = Colors.black,
    this.isBold = false,
    this.isItalic = false,
    this.isUnderline = false,
    this.isUppercase = false,
    this.shadowColor = Colors.black54,
    this.shadowBlur = 4.0,
    this.paddingX = 20.0,
    this.paddingY = 20.0,
    this.alignment = 'center',
  });

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'fontFamily': fontFamily,
        'fontSize': fontSize,
        'textColor': textColor.value,
        'backgroundColor': backgroundColor.value,
        'isBold': isBold,
        'isItalic': isItalic,
        'isUnderline': isUnderline,
        'isUppercase': isUppercase,
        'shadowColor': shadowColor.value,
        'shadowBlur': shadowBlur,
        'paddingX': paddingX,
        'paddingY': paddingY,
        'alignment': alignment,
      };

  factory OutputSettings.fromJson(Map<String, dynamic> json) {
    return OutputSettings(
      enabled: json['enabled'] ?? true,
      fontFamily: json['fontFamily'] ?? 'Roboto',
      fontSize: (json['fontSize'] as num?)?.toDouble() ?? 48.0,
      textColor: Color(json['textColor'] ?? Colors.white.value),
      backgroundColor: Color(json['backgroundColor'] ?? Colors.black.value),
      isBold: json['isBold'] ?? false,
      isItalic: json['isItalic'] ?? false,
      isUnderline: json['isUnderline'] ?? false,
      isUppercase: json['isUppercase'] ?? false,
      shadowColor: Color(json['shadowColor'] ?? Colors.black54.value),
      shadowBlur: (json['shadowBlur'] as num?)?.toDouble() ?? 4.0,
      paddingX: (json['paddingX'] as num?)?.toDouble() ?? 20.0,
      paddingY: (json['paddingY'] as num?)?.toDouble() ?? 20.0,
      alignment: json['alignment'] ?? 'center',
    );
  }
}

class Setlist {
  final String id;
  final String name;
  final List<String> songIds;

  Setlist({
    required this.id,
    required this.name,
    required this.songIds,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'songIds': songIds,
      };

  factory Setlist.fromJson(Map<String, dynamic> json) {
    return Setlist(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      songIds: (json['songIds'] as List? ?? []).cast<String>(),
    );
  }
}
