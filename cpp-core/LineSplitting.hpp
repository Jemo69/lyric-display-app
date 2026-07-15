#ifndef LINE_SPLITTING_HPP
#define LINE_SPLITTING_HPP

#include <string>
#include <vector>
#include <regex>

namespace LyricDisplay {

struct SplitConfig {
    int targetLength = 60;
    int minLength = 40;
    int maxLength = 80;
    int overflowTolerance = 15;
};

struct BreakPoint {
    size_t index;
    int priority;
    bool preserveChar;
};

class LineSplitting {
public:
    static std::string preprocessText(const std::string& text);
    static std::vector<std::string> splitLongLine(const std::string& line, const SplitConfig& config = SplitConfig());
    static std::string capitalizeFirst(const std::string& text);

private:
    static std::vector<BreakPoint> findBreakPoints(const std::string& line);
    static long long findBestBreakPoint(const std::vector<BreakPoint>& breakPoints, int targetIndex, int minIndex, int maxIndex);
};

} // namespace LyricDisplay

#endif // LINE_SPLITTING_HPP
