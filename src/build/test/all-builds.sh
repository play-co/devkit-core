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

  contains 'index.html'
  contains 'browser-mobile.js'
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
