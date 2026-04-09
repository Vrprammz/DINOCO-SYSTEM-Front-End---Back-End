#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# DINOCO B2B — Raspberry Pi Print Server Installer
# Run: sudo bash install.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║  DINOCO B2B — Print Server Installer                ║"
echo "╚══════════════════════════════════════════════════════╝"

# Check root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root: sudo bash install.sh"
    exit 1
fi

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_USER="${SUDO_USER:-pi}"
echo "📁 Install dir: $INSTALL_DIR"
echo "👤 Service user: $SERVICE_USER"

# ── 1. System packages ──
echo ""
echo "📦 Installing system packages..."
apt-get update -qq
apt-get install -y -qq \
    cups \
    python3 python3-pip python3-venv \
    libcups2-dev \
    libpango1.0-dev libgdk-pixbuf2.0-dev libffi-dev \
    alsa-utils \
    fonts-noto-core fonts-noto-cjk fonts-noto-unhinted

# Optional Thai fonts (Sarabun preferred, Noto Sans Thai in fonts-noto-unhinted as fallback)
apt-get install -y -qq fonts-sarabun 2>/dev/null || \
    echo "ℹ️  fonts-sarabun not in repo — will use Noto Sans Thai from fonts-noto-unhinted"

# Verify Thai font is available; download manually if needed
if ! fc-list | grep -qi 'noto.*thai\|sarabun'; then
    echo "⚠️  Thai font not found — downloading Noto Sans Thai..."
    mkdir -p /usr/share/fonts/noto-thai
    wget -q -O /tmp/NotoSansThai.zip "https://fonts.google.com/download?family=Noto+Sans+Thai" 2>/dev/null || true
    if [ -f /tmp/NotoSansThai.zip ]; then
        unzip -qo /tmp/NotoSansThai.zip -d /usr/share/fonts/noto-thai/ 2>/dev/null || true
        fc-cache -f
        rm -f /tmp/NotoSansThai.zip
        echo "✅ Noto Sans Thai installed"
    else
        echo "⚠️  Could not download Thai font — Thai text may not render correctly"
    fi
fi

# ── 2. CUPS setup ──
echo ""
echo "🖨️ Configuring CUPS..."
usermod -aG lpadmin "$SERVICE_USER" 2>/dev/null || true
systemctl enable cups
systemctl start cups

# Allow local connections
cupsctl --no-remote-any
cupsctl --remote-admin

echo "💡 Add printers via CUPS web UI: http://$(hostname -I | awk '{print $1}'):631"

# ── 2b. Config file ──
echo ""
echo "📝 Checking config..."
if [ ! -f "$INSTALL_DIR/config.json" ]; then
    cp "$INSTALL_DIR/config.example.json" "$INSTALL_DIR/config.json"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/config.json"
    echo "⚠️  Created config.json from template — please edit it with your settings!"
else
    echo "✅ config.json already exists — keeping your settings"
fi

# ── 3. Python virtual environment ──
echo ""
echo "🐍 Setting up Python environment..."
cd "$INSTALL_DIR"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

deactivate

# ── 4. Sound setup ──
echo ""
echo "🔊 Setting up audio..."
mkdir -p "$INSTALL_DIR/sounds"
# Generate a simple notification sound if not exists
if [ ! -f "$INSTALL_DIR/sounds/new_order.wav" ]; then
    # Create a simple WAV placeholder
    python3 -c "
import struct, wave
rate=44100; dur=0.3; freq=880
frames=int(rate*dur)
w=wave.open('$INSTALL_DIR/sounds/new_order.wav','w')
w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
for i in range(frames):
    import math
    val=int(32767*0.5*math.sin(2*math.pi*freq*i/rate))
    w.writeframes(struct.pack('<h',val))
w.close()
" 2>/dev/null || echo "⚠️  Could not generate default sound"
fi

# ── 5. Systemd services ──
echo ""
echo "⚙️ Setting up systemd services..."

# Replace placeholder paths with actual install directory and user
sed -i "s|User=dinocoth|User=$SERVICE_USER|g" "$INSTALL_DIR/dinoco-print.service"
sed -i "s|/home/dinocoth/rpi-print-server|$INSTALL_DIR|g" "$INSTALL_DIR/dinoco-print.service"
sed -i "s|User=dinocoth|User=$SERVICE_USER|g" "$INSTALL_DIR/dinoco-dashboard.service"
sed -i "s|/home/dinocoth/rpi-print-server|$INSTALL_DIR|g" "$INSTALL_DIR/dinoco-dashboard.service"

cp "$INSTALL_DIR/dinoco-print.service" /etc/systemd/system/
cp "$INSTALL_DIR/dinoco-dashboard.service" /etc/systemd/system/

# Create required directories
mkdir -p "$INSTALL_DIR/logs" "$INSTALL_DIR/tmp"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/logs" "$INSTALL_DIR/tmp"

systemctl daemon-reload
systemctl enable dinoco-print.service
systemctl enable dinoco-dashboard.service
systemctl start dinoco-print.service
systemctl start dinoco-dashboard.service
echo "✅ Services enabled and started"

# ── 7. Kiosk mode (auto-start Chromium on RPi screen) ──
echo ""
echo "📺 Setting up kiosk mode..."

HOME_DIR=$(eval echo "~$SERVICE_USER")
AUTOSTART_DIR="$HOME_DIR/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

cat > "$AUTOSTART_DIR/dinoco-kiosk.desktop" << EOF
[Desktop Entry]
Type=Application
Name=DINOCO Kiosk
Exec=chromium-browser --kiosk --noerrdialogs --disable-translate --no-first-run --fast --fast-start --disable-infobars --disable-session-crashed-bubble --disable-restore-session-state --app=http://localhost:5555/kiosk
X-GNOME-Autostart-enabled=true
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$AUTOSTART_DIR/dinoco-kiosk.desktop"

# Disable screen blanking for always-on kiosk
cat > "$AUTOSTART_DIR/dinoco-screen.desktop" << EOF
[Desktop Entry]
Type=Application
Name=DINOCO Screen
Exec=bash -c "xset s off; xset -dpms; xset s noblank"
X-GNOME-Autostart-enabled=true
EOF
chown "$SERVICE_USER:$SERVICE_USER" "$AUTOSTART_DIR/dinoco-screen.desktop"

echo "✅ Kiosk will auto-start Chromium on boot → http://localhost:5555/kiosk"

LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "Installation complete!"
echo ""
echo "  Next steps:"
echo "  1. Add printers via CUPS:"
echo "     http://$LOCAL_IP:631"
echo ""
echo "  2. Edit config.json:"
echo "     - wp_url: your WordPress URL"
echo "     - api_key: from S9 Print Settings"
echo "     - printer_invoice: A4 printer name"
echo "     - printer_label: Label printer name"
echo ""
echo "  3. Start the services:"
echo "     sudo systemctl start dinoco-print"
echo "     sudo systemctl start dinoco-dashboard"
echo ""
echo "  4. Dashboard:"
echo "     http://$LOCAL_IP:5555"
echo "     Kiosk: http://$LOCAL_IP:5555/kiosk"
echo ""
echo "  5. Check status:"
echo "     sudo systemctl status dinoco-print"
echo "     sudo systemctl status dinoco-dashboard"
echo "     journalctl -u dinoco-print -f"
