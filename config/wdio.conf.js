var webpack          = require("webpack");
var WebpackDevServer = require("webpack-dev-server");
var webpackConfig    = require("./webpack.config");
var testConfig       = require("../test/config/specs");
var artifacts        = require("../test/artifacts");


var server;
var SCREENSHOT_PATH = artifacts.pathSync("screenshots");
var browser = (process.env.BROWSER || 'chrome');
var browserCapabilities = (browser == 'chrome') ?
{
  maxInstances: 5,
  browserName: 'chrome',
  'goog:chromeOptions': {
    args: ['--headless', '--disable-gpu']
  }
}
:
{
  maxInstances: 5,
  browserName: 'firefox',
  'moz:firefoxOptions': {
    args: ['-headless']
  }
};

exports.config = {
  runner: 'local',
  path: '/wd/hub',
  specs: [
    './test/functional/index.js'
  ],
  maxInstances: 10,
  capabilities: [
    browserCapabilities
  ],
  services: ['selenium-standalone'],
  logLevel: 'info',
  bail: 0,
  screenshotPath: SCREENSHOT_PATH,
  hostname: "0.0.0.0",
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    // Because we don't know how long the initial build will take...
    timeout: 4*60*1000,
  },
  onPrepare: function (config, capabilities) {
    return new Promise(function(resolve, reject) {
      var compiler = webpack(webpackConfig);
      const serverHost = "0.0.0.0";

      server = new WebpackDevServer(compiler, {
        host: serverHost,
        disableHostCheck: true,
        stats: {
          colors: true
        }
      });

      server.listen(testConfig.port, serverHost, function(err) {
        if(err) {
          reject(err);
        }
        else {
          resolve();
        }
      });
    })
  },
  onComplete: function(exitCode) {
    return new Promise(function(resolve, reject) {
      server.close(function (err) {
        if (err) {
          reject(err)
        }
        else {
          resolve();
        }
      })
    });
  }
}
