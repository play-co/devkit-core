exports.getOrientationHTML = function (app, config) {

  var supportedOrientations = app.manifest.supportedOrientations;
  var image = config.browser.orientationSplash;
  var enableOrientationSplash = config.target !== 'browser-desktop' &&
    supportedOrientations &&
    supportedOrientations.length === 1 &&
    !!image;

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

    return [
      '<div id="_GCOrientation" style="' + style + '"></div>',
      '<script>',
      '  var os = document.getElementById("_GCOrientation").style;',
      '  var supportedOrientation = "' + supportedOrientations[0] + '";',
      '  var onResize = function() {',
      '    var currentOrientation = window.innerHeight > window.innerWidth ? "portrait" : "landscape";',
      '    os.display = (currentOrientation !== supportedOrientation) ? "block" : "none";',
      '  };',
      '  onResize();',
      '  window.addEventListener("resize", onResize);',
      '</script>'
    ].join("\n");

  }

  return "";

};
