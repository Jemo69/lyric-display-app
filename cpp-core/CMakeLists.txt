cmake_minimum_required(VERSION 3.10)
project(LyricDisplayCore)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(LyricDisplayCore STATIC
    LineSplitting.cpp
    LyricsParsing.cpp
)

target_include_directories(LyricDisplayCore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(test_runner test_runner.cpp)
target_link_libraries(test_runner PRIVATE LyricDisplayCore)
