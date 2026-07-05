#include "LineSplitting.hpp"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>

namespace LyricDisplay {

std::string LineSplitting::preprocessText(const std::string& text) {
    if (text.empty()) return "";

    std::string cleaned = text;

    // Remove problematic characters
    std::regex problematicChars("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]+");
    cleaned = std::regex_replace(cleaned, problematicChars, "");

    // Normalize whitespace (tabs to spaces)
    std::replace(cleaned.begin(), cleaned.end(), '\t', ' ');
    std::regex excessiveWhitespace(" +");
    cleaned = std::regex_replace(cleaned, excessiveWhitespace, " ");

    // Excessive newlines
    std::regex excessiveNewlines("\\n{3,}");
    cleaned = std::regex_replace(cleaned, excessiveNewlines, "\n\n");

    return cleaned;
}

std::string LineSplitting::capitalizeFirst(const std::string& text) {
    if (text.empty()) return text;
    std::string result = text;

    // Find the first alphabetic character to capitalize
    for (size_t i = 0; i < result.length(); ++i) {
        unsigned char c = static_cast<unsigned char>(result[i]);
        // Simple ASCII check. For UTF-8, this is more complex,
        // but we'll stay with basic ASCII for this performance-oriented rewrite.
        if (std::isalpha(c)) {
            result[i] = std::toupper(c);
            break;
        }
        // If we hit a character that might be start of multi-byte, we stop to avoid corruption
        if (c >= 0x80) break;
    }
    return result;
}

std::vector<BreakPoint> LineSplitting::findBreakPoints(const std::string& line) {
    std::vector<BreakPoint> breakPoints;

    struct Marker {
        std::regex pattern;
        int priority;
        bool preserve;
    };

    static const std::vector<Marker> markers = {
        {std::regex("[.!?]+\\s+"), 10, true},
        {std::regex("[,;:]+\\s+"), 8, true},
        {std::regex("\\s+"), 2, false}
    };

    for (const auto& marker : markers) {
        auto words_begin = std::sregex_iterator(line.begin(), line.end(), marker.pattern);
        auto words_end = std::sregex_iterator();

        for (std::sregex_iterator i = words_begin; i != words_end; ++i) {
            std::smatch match = *i;
            breakPoints.push_back({
                static_cast<size_t>(match.position() + match.length()),
                marker.priority,
                marker.preserve
            });
        }
    }

    std::sort(breakPoints.begin(), breakPoints.end(), [](const BreakPoint& a, const BreakPoint& b) {
        if (a.index != b.index) return a.index < b.index;
        return a.priority > b.priority;
    });

    return breakPoints;
}

long long LineSplitting::findBestBreakPoint(const std::vector<BreakPoint>& breakPoints, int targetIndex, int minIndex, int maxIndex) {
    if (breakPoints.empty()) return -1;

    struct Scored {
        size_t index;
        double score;
    };
    std::vector<Scored> candidates;

    for (const auto& bp : breakPoints) {
        if (bp.index >= static_cast<size_t>(minIndex) && bp.index <= static_cast<size_t>(maxIndex)) {
            double distance = std::abs(static_cast<double>(bp.index) - targetIndex);
            double distanceScore = 1.0 / (distance + 1.0);
            double totalScore = bp.priority * 2.0 + distanceScore * 10.0;
            candidates.push_back({bp.index, totalScore});
        }
    }

    if (candidates.empty()) return -1;

    std::sort(candidates.begin(), candidates.end(), [](const Scored& a, const Scored& b) {
        return a.score > b.score;
    });

    return static_cast<long long>(candidates[0].index);
}

std::vector<std::string> LineSplitting::splitLongLine(const std::string& line, const SplitConfig& config) {
    if (line.empty()) return {line};
    if (line.length() <= static_cast<size_t>(config.maxLength)) return {line};

    std::vector<std::string> result;
    std::string remaining = line;

    int iterations = 0;
    const int MAX_ITERATIONS = 100;

    while (remaining.length() > static_cast<size_t>(config.maxLength) && iterations < MAX_ITERATIONS) {
        iterations++;

        std::vector<BreakPoint> breakPoints = findBreakPoints(remaining);

        int minBreak = config.minLength;
        int maxBreak = std::min(config.maxLength + config.overflowTolerance, static_cast<int>(remaining.length()));
        int targetBreak = config.targetLength;

        long long breakIndex = findBestBreakPoint(breakPoints, targetBreak, minBreak, maxBreak);

        if (breakIndex != -1) {
            std::string segment = remaining.substr(0, breakIndex);
            // Trim trailing space
            size_t last = segment.find_last_not_of(" ");
            if (last != std::string::npos) segment.erase(last + 1);

            if (!segment.empty()) result.push_back(capitalizeFirst(segment));
            remaining = remaining.substr(breakIndex);
            // Trim leading space
            size_t first = remaining.find_first_not_of(" ");
            if (first != std::string::npos) remaining.erase(0, first);
        } else {
            // Forced break at last space
            size_t forcedBreak = remaining.find_last_of(' ', config.maxLength);

            if (forcedBreak != std::string::npos && forcedBreak > static_cast<size_t>(config.minLength)) {
                std::string segment = remaining.substr(0, forcedBreak);
                result.push_back(capitalizeFirst(segment));
                remaining = remaining.substr(forcedBreak + 1);
            } else {
                std::string segment = remaining.substr(0, config.maxLength);
                result.push_back(capitalizeFirst(segment));
                remaining = remaining.substr(config.maxLength);
            }
        }
    }

    if (!remaining.empty()) {
        result.push_back(capitalizeFirst(remaining));
    }

    return result;
}

} // namespace LyricDisplay
