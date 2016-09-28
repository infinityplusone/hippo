#!/bin/sh

# Formatting variables
blackBG='\033[1;40m'
cyan='\033[1;36m'$blackBG
gray='\033[1;37m'$blackBG
green='\033[1;32m'$blackBG
purple='\033[1;35m'$blackBG
red='\033[0;31m'$blackBG
yellow='\033[1;33m'$blackBG
nc='\033[0m'$blackBG

branch=$(git rev-parse --abbrev-ref HEAD)
reBump='^[0-9]+\.[0-9]+\.[0-9]+|patch|minor|major$'

if [ "$#" == 1 ]; then
  if [[ $1 =~ $reBump ]]; then
    grunt bump:$1
  fi
fi

# get everything ready
bower update
grunt build

# figure out the version
version=$(cat VERSION)

# checkout a branch for this version
git branch -D v${version}
git checkout -b v${version}

# add the distribution file & push it
git add hippo.min.js
git commit -am 'RELEASE v$version'
git push origin v${version} --force

# push to latest too
git branch -D latest
git co -b latest
git push origin latest --force

# cleanup
rm -rf VERSION

# go back to where you started
git checkout $branch

