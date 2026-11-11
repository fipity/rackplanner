## Downloads

| Platform | File | How to install |
| --- | --- | --- |
| **Windows 10/11** (64-bit) | `RackPlanner-Setup-{version}.exe` | Run the installer (per-user, no admin prompt). |
| **Ubuntu 22.04+ / Debian** (64-bit) | `rackplanner_{version}_amd64.deb` | `sudo apt install ./rackplanner_{version}_amd64.deb` |

The Windows installer isn't code-signed: if SmartScreen says "Windows protected your PC", click **More info → Run anyway**. Check downloads against `SHA256SUMS.txt`.

Designs are kept in `%APPDATA%\RackPlanner\data` (Windows) or `~/.config/RackPlanner/data` (Linux). Installing a new version over the old one keeps them. To self-host instead, see [Install on Ubuntu (server)](https://github.com/fipity/rackplanner#install-on-ubuntu-server).
