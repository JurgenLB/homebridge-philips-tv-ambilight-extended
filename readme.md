# homebridge-philips-tv-ambilight-extended

Enhanced Homebridge plugin for Philips Android TV with proper TV icon, Ambilight control, and extended features.

## Features

✨ **Clean TV Interface** - Displays as proper TV accessory with TV icon in HomeKit  
🎨 **Ambilight Control** - Full ambilight control with brightness adjustment  
🔊 **Native Volume Control** - Proper TV speaker volume control (no more fan icons!)  
📱 **App Launching** - Launch Netflix, YouTube, and other Android TV apps  
📺 **Channel Control** - Switch between TV channels with presets  
🎮 **Remote Control** - Full remote control functionality  
⚡ **Wake on LAN** - Power on TV remotely via network  
🔄 **Auto Status Updates** - Real-time status polling and updates  

## Installation

```bash
npm install -g homebridge-philips-tv-ambilight-extended
```

## TV Pairing

Before using this plugin, you need to pair your TV to get API credentials:

### Option 1: Using pylips (Recommended)
```bash
pip3 install pylips
python3 -m pylips
```

### Option 2: Using philips_android_tv
```bash
git clone https://github.com/suborb/philips_android_tv
cd philips_android_tv
python ./philips.py --host YOUR_TV_IP pair
```

The pairing process will give you `apiUser` and `apiPass` credentials needed for configuration.

## Configuration

Add to your Homebridge `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "PhilipsAndroidTV",
      "debug": false,
      "configVersion": 1,
      "tvs": [
        {
        "name": "Living Room TV",
        "ip": "192.168.1.100",
        "apiUser": "your_api_username",
        "apiPass": "your_api_password",
        "apiVersion": 6,
        "mac": "AA:BB:CC:DD:EE:FF",
        "wakeOnLanRequests": 3,
          "wakeOnLanTimeout": 1000,
          "wakeUntilAPIReadyCounter": 100,
          "alternativePlayPause": false,
          "dedicatedMuteSwitch": false,
          "dedicatedVolumeLightbulb": false,
          "has_ambilight": true,
          "apps": [
            "Netflix",
            "YouTube",
            "Amazon Prime",
            "Disney+"
          ],
          "channels": {
            "useFavorites": false,
            "favoriteListId": "1",
            "includeAll": false,
            "channels": [
              "BBC One",
              "CNN",
              "National Geographic"
            ]
          }
        }
      ]
    }
  ]
}
```





## Configuration Options

### Platform Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `platform` | string | ✅ | Must be "PhilipsAndroidTV" |
| `debug` | boolean | ❌ | Enable debug logging (default: false) |
| `configVersion` | number | ❌ | Config version for compatibility (default: 1) |
| `tvs` | array | ✅ | Array of TV configurations |

### TV Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `name` | string | ✅ | Display name for your TV |
| `ip` | string | ✅ | TV's IP address |
| `apiUser` | string | ✅ | API username from pairing |
| `apiPass` | string | ✅ | API password from pairing |
| `apiVersion` | number | ❌ | API version (default: 6) |
| `mac` | string | ❌ | MAC address for Wake on LAN |
| `wakeOnLanRequests` | number | ❌ | Number of WOL requests (default: 3) |
| `wakeOnLanTimeout` | number | ❌ | Timeout between WOL requests in ms (default: 1000) |
| `wakeUntilAPIReadyCounter` | number | ❌ | Connection retry attempts (default: 100) |
| `alternativePlayPause` | boolean | ❌ | Use alternative play/pause (default: false) |
| `dedicatedMuteSwitch` | boolean | ❌ | Create separate mute switch (default: false) |
| `dedicatedVolumeLightbulb` | boolean | ❌ | Create separate volume lightbulb (default: false) |
| `has_ambilight` | boolean | ❌ | Enable ambilight control (default: true) |
| `apps` | array | ❌ | List of app names to show as inputs |
| `channels` | object | ❌ | Channel configuration |

### Channel Configuration

| Option | Type | Description |
|--------|------|-------------|
| `useFavorites` | boolean | Use TV's favorite channels list |
| `favoriteListId` | string | ID of favorite list to use |
| `includeAll` | boolean | Include all available channels |
| `channels` | array | Manual list of channel names |

## Supported Apps

The plugin maps these app names to their package names:

- Netflix → `com.netflix.ninja`
- YouTube → `com.google.android.youtube.tv`
- Amazon Prime → `com.amazon.avod.thirdpartyclient`
- Disney+ → `com.disney.disneyplus`
- Spotify → `com.spotify.tv.android`
- Plex → `com.plexapp.android`
- Kodi → `org.xbmc.kodi`
- VLC → `org.videolan.vlc`

## HomeKit Interface

This plugin creates a TV accessory with:

- TV icon and power control
- Native TV speaker volume control
- Input selection for apps, channels, and Ambilight modes
- Remote control with navigation and media keys

## Remote Control Keys

| HomeKit Button | TV Action |
|---------------|-----------|
| Play/Pause | PlayPause |
| Up/Down/Left/Right | Navigation |
| Select | Confirm |
| Back | Back |
| Exit | Exit |
| Info | Info |

## Wake on LAN

To enable Wake on LAN:
1. Enable WOL in TV network settings
2. Connect TV via Ethernet
3. Add TV MAC address to `mac` field in configuration

## Multiple TVs

Control multiple TVs by adding them to the `tvs` array:


```json
{
  "platforms": [
    {
      "platform": "PhilipsAndroidTV",
      "tvs": [
        {
          "name": "Living Room TV",
          "ip": "192.168.1.100",
          "apiUser": "user1",
          "apiPass": "pass1"
        },
        {
          "name": "Bedroom TV", 
          "ip": "192.168.1.101",
          "apiUser": "user2",
          "apiPass": "pass2"
        }
      ]
    }
  ]
}
```

## Troubleshooting

**TV not responding:**
- Verify TV is on same network and IP is correct
- Check API credentials are valid
- Restart TV if needed
- Re-pair after TV software updates

**Volume control issues:**
- Ensure TV supports volume API
- Check for external speakers
- Verify TV is not muted

**Ambilight not working:**
- Confirm TV has Ambilight capability
- Enable Ambilight in TV settings
- Set `has_ambilight: true` in configuration

**App launch failures:**
- Verify app names match supported apps
- Check apps are installed on TV
- Ensure apps support intent launching

## API Reference

Uses Philips JointSpace API v6. For advanced usage:
- [Philips TV API Documentation](https://github.com/eslavnov/pylips/wiki)
- [JointSpace API Reference](http://jointspace.sourceforge.net/)

## Compatibility

- TV Models: Philips Android TV 2016+
- API Version: JointSpace API v6
- Homebridge: v1.0.0+
- Node.js: v14+
  
## Changelog

### v2.0.0
- Converted from accessory to platform plugin
- Multiple TV support
- Improved stability and error handling
- Better input source management
- Fixed Wake on LAN implementation
- Fixed Ambilight API endpoints
- Enhanced volume and mute state handling

## Migration from v1.x

Update your configuration from accessory to platform format:

**Old (v1.x):**
```json
{
  "accessories": [{
    "accessory": "PhilipsTV",
    "name": "TV",
    "ip_address": "192.168.1.100",
    "username": "user",
    "password": "pass"
  }]
}
```

**New (v2.x):**
```json
{
  "platforms": [{
    "platform": "PhilipsAndroidTV",
    "tvs": [{
      "name": "TV",
      "ip": "192.168.1.100",
      "apiUser": "user",
      "apiPass": "pass"
    }]
  }]
}
```

## API Reference

This plugin uses the Philips JointSpace API v6. For advanced usage and additional endpoints, see:
- [Philips TV API Documentation](https://github.com/eslavnov/pylips/wiki)
- [JointSpace API Reference](http://jointspace.sourceforge.net/)

## Support

For issues and feature requests, please visit:
[GitHub Issues](https://github.com/m2ert/homebridge-philips-tv-ambilight-extended/issues)

## Credits

Based on work from:
- [homebridge-philips-tv6](https://github.com/98oktay/homebridge-philips-tv6)
- [homebridge-philips-android-tv](https://github.com/konradknitter/homebridge-philips-android-tv)
- [pylips](https://github.com/eslavnov/pylips)

## License

Apache-2.0

---

**Made with ❤️ for the Homebridge community**
