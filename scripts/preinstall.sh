git submodule sync && \
git submodule update --init && \
git submodule --quiet foreach "if [ -e package.json ]; then npm install; fi"
