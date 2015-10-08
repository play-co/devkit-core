#!/bin/bash

set -e

cd $1 && pwd

SECONDS=0

function run_builds () {

  ##### Browser-mobile

  run devkit debug browser-mobile --application-cache
  OUTPUT=`ls build/debug/browser-mobile`
  contains 'browser-mobile.js'
  contains 'browser-mobile.manifest'
  contains 'index.html'
  contains 'spritesheets'

  # this one will run with compression, but the rest won't (for speed)
  run devkit release browser-mobile
  OUTPUT=`ls build/release/browser-mobile`
  contains 'browser-mobile.js'
  contains 'index.html'
  contains 'spritesheets'

  ##### Android

  if command -v ndk-build >/dev/null 2>&1; then

    run devkit debug native-android

    # don't sign
    run devkit release native-android --no-compress --no-signing
    not_contains 'image-compress'
    contains '-release-unsigned.apk'

    # test native repack (don't do the full android build)
    run devkit debug native-android --repack
    not_contains 'ant debug'

  fi

  ##### Chrome

  run devkit debug chrome

  run devkit release chrome --no-compress
  OUTPUT=`ls build/debug/chrome`
  contains 'chrome.js'
  contains 'manifest.json'
  contains 'icon-128.png'
  contains 'icon-16.png'
  contains 'index.html'
  contains 'pageWrapper.html'

  ##### IOS

  if command -v xcodebuild >/dev/null 2>&1; then

    run devkit debug native-ios --no-open
    check find build/debug -name '*.xcodeproj'
    contains '.xcodeproj'

    run devkit release native-ios --no-compress --no-open
    check find build/release -name '*.xcodeproj'
    contains '.xcodeproj'

    check ls build/release/native-ios/xcodeproject/resources/resources.bundle
    contains 'manifest.json'
    contains 'native.js'
    contains 'spritesheets'

    check ls build/release/native-ios/xcodeproject/resources/resources.bundle/spritesheets
    contains 'spritesheetSizeMap.json'

  fi

  # native archive with browser files too, should only sprite once
  run devkit debug native-archive --browser

  check find build/debug/native-archive -name '*.zip' -exec unzip -l {} \;
  contains 'index.html'
  contains 'browser-mobile.js'
  contains 'native.js'
}

# runs a command, only showing output if it fails
function run {
  COMMAND="$@"
  DEVKIT_COMMAND="$2 $3"

  echo " > $COMMAND"

  START=$SECONDS

  OUTPUT=`"$@" 2>&1` || {
    EXIT_CODE=$?
    echo "$OUTPUT"
    echo " -- exited with code $EXIT_CODE"
    return $EXIT_CODE
  }

  ELAPSED=$(( SECONDS - START ))
  update_status
  echo " < DONE -- $ELAPSED seconds"

  contains "build succeeded"
}

function check {
  OUTPUT=`"$@" 2>&1` || {
    EXIT_CODE=$?
    echo "$OUTPUT"
    echo " -- exited with code $EXIT_CODE"
    return $EXIT_CODE
  }
}

function update_status {
  if [[ -n "$CIRCLE_SHA1" \
     && -n "$CIRCLE_PROJECT_USERNAME" \
     && -n "$CIRCLE_PROJECT_REPONAME" \
     && -n "$GITHUB_STATUS_AUTH_TOKEN" ]]; then

    curl -s -H "Authorization: token $GITHUB_STATUS_AUTH_TOKEN" \
      -d "{\"state\":\"success\",\"context\":\"$DEVKIT_COMMAND $CACHED\",\"description\":\"$ELAPSED seconds\"}" \
      "https://api.github.com/repos/$CIRCLE_PROJECT_USERNAME/$CIRCLE_PROJECT_REPONAME/statuses/$CIRCLE_SHA1" \
      > /dev/null

  fi
}

function contains {
  [[ $OUTPUT == *"$1"* ]] || { echo "$OUTPUT" && echo "$COMMAND failed: expected to see $1"; return 1; }
}

function not_contains {
  [[ $OUTPUT != *"$1"* ]] || { echo "$OUTPUT" &&  echo "$COMMAND failed: expected to NOT see $1"; return 1; }
}

function main {
  pwd

  # no previous build
  if [ -d build ]; then
    rm -r build/
  fi

  echo '--- clean builds'

  CACHED="(clean)"
  run_builds

  echo '--- cached builds'

  # with previous build
  CACHED="(cached)"
  run_builds
}

main
