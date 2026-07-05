{
  "targets": [
    {
      "target_name": "lyric_display_core",
      "sources": [
        "cpp-core/LineSplitting.cpp",
        "cpp-core/LyricsParsing.cpp"
      ],
      "include_dirs": [
        "cpp-core"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES"
          }
        }]
      ]
    }
  ]
}
