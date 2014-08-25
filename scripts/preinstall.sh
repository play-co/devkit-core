# rewrite gitmodules with the correct protocol
node scripts/submodules.js && \
  git submodule sync && \
  git submodule update --init && \
  git submodule --quiet foreach "if [ -e package.json ]; then npm install; fi"

code=$?

# just in case we broke the .gitmodules file, remove it before restoring the
# original
rm .gitmodules
git checkout .gitmodules

exit $code
