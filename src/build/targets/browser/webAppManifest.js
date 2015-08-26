// create web app manifest json file
exports.create = function (api, app, config) {
  var webAppManifest = config.browser.webAppManifest;
  var browserIcons = app.manifest.browser && app.manifest.browser.icons;
  if (webAppManifest) {
    if (browserIcons) {
      webAppManifest.icons = browserIcons;
    }

    // fixed orientation if only one is supported
    var supportedOrientations = app.manifest.supportedOrientations;
    if (supportedOrientations.length == 1) {
      webAppManifest.orientation = supportedOrientations[0];
    }

    webAppManifest = JSON.stringify(webAppManifest);
    return {
      filename: 'web-app-manifest.json',
      contents: webAppManifest
    };
  }
};
