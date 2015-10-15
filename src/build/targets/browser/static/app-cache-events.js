
window.GC_LOADER.addStep('app-cache-events', function () {
  var appCache = window.applicationCache;
  ['cached', 'checking', 'downloading', 'error', 'noupdate', 'obsolete', 'progress', 'updateready'].forEach(function (evt) {
    appCache.addEventListener(evt, handleCacheEvent, false);
  });

  // status 0 == UNCACHED
  // if (appCache.status) {
  //  appCache.update(); // Attempt to update the user's cache.
  // }

  function handleCacheEvent(evt) {
    if (evt.type == 'updateready') {
      console.log("update ready");

      // reload immediately if splash is still visible
      var splash = document.getElementById('_GCSplash');
      if (splash && splash.parentNode) {
        try { appCache.swapCache(); } catch (e) {}
        //location.reload();
      }
    }
  }
});

