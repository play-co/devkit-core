var PROJECT_ID = false;
var WRITE_KEY = false;

var assertInitialized = function () {
  if (!WRITE_KEY || !PROJECT_ID) {
    throw new Error('keen.io: Please provide both a project ID and a write key to the init function.');
  }
};

export default {

  init: function (projectID, writeKey) {
    PROJECT_ID = projectID;
    WRITE_KEY = writeKey;
  },

  sendEvent: function (name, data) {
    assertInitialized();
    var req = new XMLHttpRequest();

    req.open("POST", "https://blackstorm-api.keen.io/3.0/projects/" + PROJECT_ID + "/events/" + name + "?api_key=" + WRITE_KEY);
    req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    req.send(JSON.stringify(data));
  },
  sendEventBatch: function (data) {
    assertInitialized();
    var req = new XMLHttpRequest();

    req.open("POST", "https://blackstorm-api.keen.io/3.0/projects/" + PROJECT_ID + "/events" + "?api_key=" + WRITE_KEY);
    req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    req.send(JSON.stringify(data));
  }

};