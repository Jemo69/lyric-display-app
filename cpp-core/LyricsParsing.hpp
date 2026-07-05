#ifndef LYRICS_PARSING_HPP
#define LYRICS_PARSING_HPP

#include <string>
#include <vector>
#include <variant>
#include "LineSplitting.hpp"

namespace LyricDisplay {

struct LyricGroup {
    std::string type; // "group" or "normal-group"
    std::string mainLine; // or line1
    std::string translation; // or line2
    std::string displayText;
};

using LyricItem = std::variant<std::string, LyricGroup>;

struct LyricsParsingOptions {
    bool enableSplitting = true;
    SplitConfig splitConfig;
};

class LyricsParsing {
public:
    static std::vector<LyricItem> processRawTextToLines(const std::string& rawText, const LyricsParsingOptions& options = LyricsParsingOptions());

    static bool isTranslationLine(const std::string& line);
    static bool isNormalGroupCandidate(const std::string& line);
    static bool isStructureTag(const std::string& line);

private:
    static std::string extractStructureTags(const std::string& text);
};

} // namespace LyricDisplay

#endif // LYRICS_PARSING_HPP
