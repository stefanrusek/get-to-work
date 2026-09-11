#!/usr/bin/env bash
# Builds native/macos/gtw.mm into build/native/libgtw.dylib (arm64, ad-hoc signed by the linker).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/native
xcrun clang++ -dynamiclib -fobjc-arc -std=c++17 -O2 \
  -mmacosx-version-min=14.0 \
  -framework Cocoa -framework EventKit -framework WebKit \
  -install_name @rpath/libgtw.dylib \
  -o build/native/libgtw.dylib native/macos/gtw.mm
codesign --force --sign - build/native/libgtw.dylib >/dev/null 2>&1 || true
echo "built build/native/libgtw.dylib"
