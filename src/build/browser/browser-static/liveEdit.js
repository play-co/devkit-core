var GC_LIVE_EDIT = GC_LIVE_EDIT || { _isLiveEdit: true, _liveEditReady: false };

;(function () {
  var splitCmd = function(s) {
    var i = s.indexOf(' ');
    return {
      cmd: s.substring(0, i),
      data: s.substring(i + 1, s.length),
    }
  }

  var processSrc = function(src) {
    // Make sure that all the `import xxx;` are turned into `jsio('import xxx')`
    var regex = /(import [^'"]+?);/g;
    src = src.replace(regex, "jsio('$1');")
    return src;
  }

  var setCachedSrc = function(path, src) {
    var processedSrc = processSrc(src);
    jsio.setCachedSrc(path, processedSrc, true);
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    var cmd = splitCmd(msg);

    switch (cmd.cmd) {
      case 'LIVE_EDIT':
        if (cmd.data === 'ready') GC_LIVE_EDIT._liveEditReady = true;
        if (cmd.data === 'not_ready') GC_LIVE_EDIT._liveEditReady = false;
        break;

      case 'SOURCE':
        var subCmd = splitCmd(cmd.data);
        setCachedSrc(subCmd.cmd, subCmd.data);
        break;

      case 'SCREENSHOT':
        var canvas = document.getElementById('timestep_onscreen_canvas');
        parent.postMessage('SCREENSHOT ' + canvas.toDataURL(), '*');
        break;
    }
  }, false);

  parent.postMessage('LIVE_EDIT listener_ready', '*');
})();
