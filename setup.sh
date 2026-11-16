#!/bin/bash
# Скрипт установки для облачного окружения Claude Code.
# Целиком вставь его в поле «Setup script» окружения на claude.ai/code.
set -e

export DEBIAN_FRONTEND=noninteractive
SUDO=""; [ "$(id -u)" != "0" ] && SUDO="sudo"

# 1. ffmpeg, шрифты, утилиты
$SUDO apt-get update -y
$SUDO apt-get install -y ffmpeg wget unzip fonts-dejavu fonts-liberation

# 2. Google Chrome — все скиллы ищут его по пути /usr/bin/google-chrome
if [ ! -x /usr/bin/google-chrome ]; then
  wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && $SUDO apt-get install -y /tmp/chrome.deb \
    || { $SUDO apt-get install -y chromium || $SUDO apt-get install -y chromium-browser; \
         $SUDO ln -sf "$(command -v chromium || command -v chromium-browser)" /usr/bin/google-chrome; }
fi

# 3. Python-пакеты: распознавание речи, лицо, картинки, скачивание с Google Drive
PIP_PKGS="faster-whisper numpy soundfile pillow opencv-python-headless mediapipe sherpa-onnx gdown"
python3 -m pip install -q $PIP_PKGS || python3 -m pip install -q --break-system-packages $PIP_PKGS

# 4. Node.js — нужен 20+
node -v || true

ffmpeg -version | head -1
/usr/bin/google-chrome --version || true
echo "Окружение для монтажа готово"
