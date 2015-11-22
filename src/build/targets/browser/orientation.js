exports.addOrientationHTML = function (app, config) {

  var supportedOrientations = app.manifest.supportedOrientations;
  var image = config.browser.orientationSplash;
  var enableOrientationSplash = config.target !== 'browser-desktop' &&
    supportedOrientations &&
    supportedOrientations.length === 1 &&
    !!image;

  var waitForOrientation = !!config.browser.waitForOrientation;

  if (enableOrientationSplash) {

    var style = [
      'position: absolute;',
      'top: 0px;',
      'left: 0px;',
      'width: 100%;',
      'height: 100%;',
      'z-index: 1000;',
      'background-size: cover;',
      'background-color: #000000;',
      'background-repeat: no-repeat;',
      'background-position: 50% 50%;',
      'background-image: url(' + config.browser.orientationSplash + ');'
    ].join(" ");

    config.browser.bodyHTML.push('<div id="_GCOrientation" style="' + style + '"></div>');
    config.browser.footerHTML.push.apply(config.browser.footerHTML, [
      '<script>',
      '  var os = document.getElementById("_GCOrientation").style;',
      '  var supportedOrientation = "' + supportedOrientations[0] + '";',
      '  var onResize = function() {',
      '    var currentOrientation = window.innerHeight > window.innerWidth ? "portrait" : "landscape";',
      '    var isValid = currentOrientation === supportedOrientation;',
      '    os.display = isValid ? "none" : "block";',
      waitForOrientation ? '    GC_LOADER.isOrientationValid = isValid;' : '',
      waitForOrientation ? '    GC_LOADER.onOrientation && GC_LOADER.onOrientation(isValid)' : '',
      '  };',
      '  onResize();',
      '  window.addEventListener("resize", onResize);',
      '</script>'
    ]);
  }

  if (!enableOrientationSplash || !waitForOrientation) {
    config.browser.footerHTML.push("<script>GC_LOADER.isOrientationValid = true;</script>");
  }
};
