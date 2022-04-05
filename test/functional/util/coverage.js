var artifacts   = require("../../artifacts");
var fs          = require("fs");
var istanbulCov = require('istanbul-lib-coverage');

var COVERAGE_PATH = artifacts.pathSync("/coverage");


var coverage = istanbulCov.createCoverageMap({});

// Capture the coverage after each test
afterEach(async function() {
  // Code coverage
  var results = await browser.execute(function() {
    return window.__coverage__;
  });

  if (results) {
    coverage.merge(results);
  }
})

// Dump the coverage to a file
after(function() {
  var jsonStr = JSON.stringify(coverage, null, 2);
  fs.writeFileSync(COVERAGE_PATH+"/coverage.json", jsonStr);
})
