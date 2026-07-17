#!/usr/bin/env bash
set -euo pipefail

# Measure test coverage for the application (excluding third-party code and tests).
# Outputs a single number between 0.000 and 1.000.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Clean and build the project
echo "==> Cleaning..." >&2
npx rimraf dist coverage *.tsbuildinfo .eslintcache 2>/dev/null || true

echo "==> Building project..." >&2
npx tsc

# 2. Compile test files (excluded from normal tsconfig build)
echo "==> Compiling test files..." >&2
# Generate a temp tsconfig that includes test files
node -e "
  const fs = require('fs');
  const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
  // Remove the test exclusion so test files get compiled
  tsconfig.exclude = (tsconfig.exclude || []).filter(function(e) {
    return e !== 'src/__tests__';
  });
  fs.writeFileSync('tsconfig.coverage.json', JSON.stringify(tsconfig, null, 2));
"
npx tsc --project tsconfig.coverage.json

# 3. Run tests with nyc coverage
#    - include only application source (*.ts under src/, excluding __tests__)
#    - source maps let nyc map compiled JS back to original TS
#    - json-summary reporter writes coverage/coverage-summary.json
echo "==> Running tests with coverage..." >&2
# nyc matches include/exclude against source-mapped paths (.ts files).
# Use broad include ('**') and tighten with exclusions for test files and dependencies.
npx nyc \
  --reporter=json-summary \
  --include='**' \
  --exclude='**/node_modules/**' \
  --exclude='src/__tests__/**' \
  --exclude='**/__tests__/**' \
  mocha 'dist/__tests__/**/*.js'

# 4. Extract the overall line-coverage percentage from the JSON summary
COVERAGE_PCT=$(node -e "
  var fs = require('fs');
  var data = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
  var pct = data.total.lines.pct;
  // pct can be 'Unknown' when no files match include/exclude patterns
  if (typeof pct === 'number') {
    process.stdout.write(pct.toFixed(3));
  } else if (typeof pct === 'string' && !isNaN(parseFloat(pct))) {
    process.stdout.write(parseFloat(pct).toFixed(3));
  } else {
    process.stdout.write('0.000');
  }
")

# 5. Convert percentage (0-100) to fraction (0.000-1.000)
FRACTION=$(node -e "process.stdout.write((${COVERAGE_PCT} / 100).toFixed(3));")

echo "==> Coverage: ${COVERAGE_PCT}% → ${FRACTION}" >&2

# 6. Cleanup temp files
rm -f tsconfig.coverage.json

# 7. Output the final number (stdout is the only thing consumers see)
echo "${FRACTION}"
