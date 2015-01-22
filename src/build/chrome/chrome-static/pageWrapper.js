// Take all of the storage messages from the iframe and process them here
// where we are not sandboxed
window.addEventListener('message', function (e) {
  if (e.source.parent == window) {
    console.log('[pageWrapper message]', e.data);
    var msgType = e.data.type;

    if (msgType == 'setItem') {
      var obj = {};
      obj[e.data.key] = e.data.value;
      chrome.storage.local.set(obj);
    } else if (msgType == 'removeItem') {
      chrome.storage.local.remove(e.data.key);
    } else {
      console.error('Unknown message type:', msgType);
    }
  }
});

// When the iframe loads, send it all localstorage values we have to populate
// the initial memory store
var iframe = document.getElementById('iframe');
iframe.onload = function() {
  console.log('[pageWrapper] Sending chrome.storage.local to iframe');
  chrome.storage.local.get(null, function(items) {
      iframe.contentWindow.postMessage({ type: 'initialLocalStorage', data: items }, '*');
  });
};
