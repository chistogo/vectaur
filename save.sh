#!/usr/bin/env sh

git pull
git add --all
git config user.name snotskie
git config user.email snotskie@gmail.com
git commit -m "Autocommit for `date`"
git push
