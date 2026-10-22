/**
 * test.entry.js — the package's test entry point.
 *
 * Node's test runner treats a positional path as a literal program
 * entry: a directory resolves through package.json "main". Pointing
 * `main` here makes `node --test speech-engine/` (from the repo
 * root) execute the whole suite in one process.
 *
 * The name deliberately does NOT match the runner's discovery
 * patterns (*.test.js, test-*.js, *-test.js, *_test.js, test.js),
 * so `npm test` (bare `node --test`, which discovers every file
 * under test/) runs each test file exactly once — never twice.
 *
 * No setup, no fixtures: importing a test file registers its tests
 * with this process's root test harness.
 */
import './test/server.test.js';
import './test/wsTransport.test.js';
import './test/benchmark.test.js';
// The DRIVER tests belong here too. They were absent from this entry point,
// which is why the CI step "Engine contract conformance" (`node --test
// speech-engine/`) exercised the HTTP surface and never the code that spawns
// whisper-cli — so the adapter could pass CI while invoking the decoder with
// flags that made it produce no transcript at all. These 20-odd tests are the
// only ones that cover the binary boundary.
import './test/whispercpp.test.js';
import './test/sherpaonnx.test.js';
