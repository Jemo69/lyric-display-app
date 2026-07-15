#include "LyricsParsing.hpp"
#include <regex>
#include <sstream>

namespace LyricDisplay {

static const std::vector<std::pair<char, char>> BRACKET_PAIRS = {
    {'[', ']'},
    {'(', ')'},
    {'{', '}'},
    {'<', '>'}
};

static const std::vector<std::regex> STRUCTURE_TAG_PATTERNS = {
    std::regex("^\\s*\\[(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\\s+\\d+)?(?:\\s*:\\s*[^\\]]*)?\\s*\\]\\s*", std::regex_constants::icase),
    std::regex("^\\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\\s+\\d+)?\\s*:\\s*", std::regex_constants::icase),
    std::regex("^\\s*\\((Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\\s+\\d+)?(?:\\s*:\\s*[^)]*)?\\s*\\)\\s*", std::regex_constants::icase),
    std::regex("^\\s*(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Pre Chorus|Hook|Refrain|Interlude|Break)(\\s+\\d+)?\\s*$", std::regex_constants::icase)
};

bool LyricsParsing::isStructureTag(const std::string& line) {
    if (line.empty()) return false;
    for (const auto& pattern : STRUCTURE_TAG_PATTERNS) {
        if (std::regex_search(line, pattern)) return true;
    }
    return false;
}

bool LyricsParsing::isTranslationLine(const std::string& line) {
    if (line.length() <= 2) return false;

    size_t first = line.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return false;
    size_t last = line.find_last_not_of(" \t\r\n");
    std::string trimmed = line.substr(first, last - first + 1);

    if (isStructureTag(trimmed)) return false;

    for (const auto& pair : BRACKET_PAIRS) {
        if (trimmed.front() == pair.first && trimmed.back() == pair.second) return true;
    }
    return false;
}

bool LyricsParsing::isNormalGroupCandidate(const std::string& line) {
    if (line.empty()) return false;
    if (isTranslationLine(line)) return false;
    return line.length() <= 45;
}

std::vector<LyricItem> LyricsParsing::processRawTextToLines(const std::string& rawText, const LyricsParsingOptions& options) {
    std::string cleaned = LineSplitting::preprocessText(rawText);

    std::vector<std::string> rawLines;
    std::string line;
    std::stringstream ss(cleaned);
    while (std::getline(ss, line)) {
        size_t first = line.find_first_not_of(" \t\r\n");
        if (first != std::string::npos) {
            size_t last = line.find_last_not_of(" \t\r\n");
            rawLines.push_back(line.substr(first, last - first + 1));
        }
    }

    std::vector<LyricItem> result;
    for (size_t i = 0; i < rawLines.size(); ++i) {
        std::string currentRaw = rawLines[i];

        std::vector<std::string> segments;
        if (options.enableSplitting && !isStructureTag(currentRaw) && !isTranslationLine(currentRaw)) {
            segments = LineSplitting::splitLongLine(currentRaw, options.splitConfig);
        } else {
            segments.push_back(currentRaw);
        }

        for (size_t j = 0; j < segments.size(); ++j) {
            std::string seg = segments[j];
            bool consumedNext = false;

            if (j == segments.size() - 1 && i + 1 < rawLines.size()) {
                std::string nextRaw = rawLines[i+1];

                if (isTranslationLine(nextRaw) && !isTranslationLine(seg) && !isStructureTag(seg) && !isStructureTag(nextRaw)) {
                    LyricGroup group;
                    group.type = "group";
                    group.mainLine = seg;
                    group.translation = nextRaw;
                    group.displayText = seg + "\n" + nextRaw;
                    result.push_back(group);
                    i++;
                    consumedNext = true;
                } else if (isNormalGroupCandidate(seg) && isNormalGroupCandidate(nextRaw) && !isStructureTag(seg) && !isStructureTag(nextRaw)) {
                    LyricGroup group;
                    group.type = "normal-group";
                    group.mainLine = seg;
                    group.translation = nextRaw;
                    group.displayText = seg + "\n" + nextRaw;
                    result.push_back(group);
                    i++;
                    consumedNext = true;
                }
            }

            if (consumedNext) break;
            result.push_back(seg);
        }
    }

    return result;
}

} // namespace LyricDisplay
