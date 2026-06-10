# ScreenDrop

> Offline file transfer via QR codes.
>
> No network. No Bluetooth. No installation required.

ScreenDrop is a browser-based file transfer tool that uses a sequence of QR codes to transmit files between devices.

All you need is:

* A screen to display QR codes
* A camera to scan them

No Wi-Fi, no Bluetooth, no AirDrop, and no native app installation.

---

## ✨ Features

* 📶 Completely offline
* 🌐 Runs entirely in the browser
* 📷 Uses only a screen and a camera
* 📦 Supports large files through chunked transfer
* 🔒 SHA-256 integrity verification
* 🔄 Automatic retransmission through looping playback
* 🧩 Missing chunk detection and manual recovery
* 📱 No app installation required

---

## 🚀 Try it

### Sender

[https://www.guofei.site/ScreenDrop/sender.html](https://www.guofei.site/ScreenDrop/sender.html)

Select a file and start transmission.

### Receiver

Open:

[https://www.guofei.site/ScreenDrop/receiver.html](https://www.guofei.site/ScreenDrop/receiver.html)

Allow camera access and start scanning.


---

## 📖 How it works

ScreenDrop transfers files using the following process:

```
File
 ↓
Split into chunks
 ↓
Encode each chunk as a QR code
 ↓
Display QR code sequence
 ↓
Scan with receiver device
 ↓
Reassemble file
 ↓
Verify SHA-256 checksum
 ↓
Download
```

---

## 🛠 Usage

### Sending a file

1. Open `sender.html`
2. Select a file
3. Adjust transmission settings if needed
4. Click **Start**
5. Present the QR code sequence to the receiving device

### Receiving a file

1. Open the receiver page
2. Grant camera permission
3. Point the camera at the sender screen
4. Wait until all chunks are collected
5. Download the reconstructed file

---

## ⚙ Transmission Modes

ScreenDrop provides several chunk-size presets:

| Mode                   | Description                                |
| ---------------------- | ------------------------------------------ |
| Compatibility          | Lower QR density, easier scanning          |
| Balanced (Recommended) | Best balance between speed and reliability |
| Fast                   | Higher density, faster transfer            |

Larger chunks improve speed but may reduce scanning reliability on older devices.

---

## 📋 Limitations

* Recommended file size: ≤ 20 MB
* Performance depends on camera quality and screen brightness
* Works best in good lighting conditions
* Modern browsers are recommended:

  * Chrome
  * Edge
  * Safari

---

## ❓ FAQ

### Why not use Bluetooth?

Bluetooth pairing can be inconvenient and is not always available across platforms.

### Why not use AirDrop?

AirDrop only works within the Apple ecosystem.

### Is ScreenDrop fast?

ScreenDrop prioritizes universality and offline availability over raw speed.

### What happens if some QR codes are missed?

The receiver automatically identifies missing chunks. The sender can jump directly to those chunks for recovery.

---

## 🔒 Data Integrity

Every transfer includes:

* CRC validation for individual chunks
* SHA-256 verification for the complete file

Corrupted transfers are detected automatically.

---

## 📷 Demo

Demo video:

（TODO）

---

## 📦 Release Downloads


Sender-only package:

[https://github.com/guofei9987/ScreenDrop/releases](https://github.com/guofei9987/ScreenDrop/releases)

GitHub Releases:

[https://github.com/guofei9987/ScreenDrop/releases](https://github.com/guofei9987/ScreenDrop/releases)

---

## 🤝 Contributing

Issues and pull requests are welcome.

If you encounter compatibility problems with a specific browser or device, please open an issue.

---

## 📄 License

MIT License.

See `LICENSE` for details.
