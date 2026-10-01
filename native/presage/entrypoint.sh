#!/bin/sh
set -eu
umask 077

if [ "${1:-}" != "--keyring-session" ]; then
  # Each container generates its own identity; none is baked into the image.
  dbus-uuidgen --ensure=/home/node/.machine-id
  exec dbus-run-session -- "$0" --keyring-session "$@"
fi
shift

# Isolate SDK device keys from the host and discard them with this container.
camera_keyring_dir=$(mktemp -d /tmp/speaksense-keys.XXXXXX)
export XDG_RUNTIME_DIR="$camera_keyring_dir/runtime"
export XDG_DATA_HOME="$camera_keyring_dir/data"
export XDG_CACHE_HOME="$camera_keyring_dir/cache"
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
# Random unlock password exists only in this pipe, never in arguments or logs.
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' |
  gnome-keyring-daemon --unlock --components=secrets > /dev/null
exec "$@"
