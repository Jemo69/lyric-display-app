#include <iostream>
#include <string>
#include <vector>
#include <cassert>
#include "LineSplitting.hpp"
#include "LyricsParsing.hpp"

using namespace LyricDisplay;

void testLineSplitting() {
    std::cout << "Testing Line Splitting..." << std::endl;

    std::string longLine = "This is a very long line that should definitely be split into multiple segments because it exceeds the maximum length allowed by the configuration.";
    SplitConfig config;
    config.maxLength = 40;

    std::cout << "Calling splitLongLine..." << std::endl;
    std::vector<std::string> segments = LineSplitting::splitLongLine(longLine, config);
    std::cout << "splitLongLine returned " << segments.size() << " segments." << std::endl;

    std::cout << "Original length: " << longLine.length() << std::endl;
    std::cout << "Segments: " << segments.size() << std::endl;
    for (const auto& s : segments) {
        std::cout << "  [" << s.length() << "] " << s << std::endl;
        assert(s.length() <= static_cast<size_t>(config.maxLength + config.overflowTolerance));
    }

    std::cout << "Line Splitting tests passed!" << std::endl << std::endl;
}

void testLyricsParsing() {
    std::cout << "Testing Lyrics Parsing..." << std::endl;

    std::string rawLyrics =
        "[Verse 1]\n"
        "Amazing grace how sweet the sound\n"
        "(That saved a wretch like me)\n"
        "\n"
        "I once was lost but now am found\n"
        "Was blind but now I see";

    std::cout << "Calling processRawTextToLines..." << std::endl;
    std::vector<LyricItem> items = LyricsParsing::processRawTextToLines(rawLyrics);
    std::cout << "processRawTextToLines returned " << items.size() << " items." << std::endl;

    std::cout << "Parsed items: " << items.size() << std::endl;
    for (const auto& item : items) {
        if (std::holds_alternative<std::string>(item)) {
            std::cout << "  Line: " << std::get<std::string>(item) << std::endl;
        } else {
            const auto& group = std::get<LyricGroup>(item);
            std::cout << "  Group (" << group.type << "):" << std::endl;
            std::cout << "    1: " << group.mainLine << std::endl;
            std::cout << "    2: " << group.translation << std::endl;
        }
    }

    // Verify Verse 1 is detected as tag (string)
    assert(std::holds_alternative<std::string>(items[0]));
    assert(std::get<std::string>(items[0]) == "[Verse 1]");

    // Verify Translation group
    assert(std::holds_alternative<LyricGroup>(items[1]));
    assert(std::get<LyricGroup>(items[1]).type == "group");

    std::cout << "Lyrics Parsing tests passed!" << std::endl << std::endl;
}

int main() {
    testLineSplitting();
    testLyricsParsing();
    std::cout << "All tests passed successfully!" << std::endl;
    return 0;
}
