"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV.js");
const pluginName = pkg.name;
const accessoryName = "PhilipsTV";
let Service, Characteristic, Categories;

class PhilipsTvAccessory {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.PhilipsTV = new PhilipsTV(config);
    
    this.log.info("[PhilipsTV] Initializing TV accessory...");
    
    // State tracking
    this.on = false;
    this.volume = 0;
    this.currentApp = { component: { packageName: '' } };
    this.currentChannel = { channel: { name: '' } };
    
    // Setup when homebridge is ready
    this.api.on('didFinishLaunching', () => {
      this.setupTVAccessory();
    });
  }

  setupTVAccessory() {
    // Create TV Platform Accessory
    const uuid = this.api.hap.uuid.generate(pluginName + this.config.name);
    this.tvAccessory = new this.api.platformAccessory(this.config.name, uuid, Categories.TELEVISION);
    this.tvAccessory.context.isexternal = true;

    // TV Service
    this.tvService = new Service.Television(this.config.name, this.config.name);
    this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.config.name);
    this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Power Control
    this.tvService.getCharacteristic(Characteristic.Active)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    // Remote Control
    this.tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.sendRemoteKey.bind(this));

    // TV Speaker Service
    this.tvSpeaker = new Service.TelevisionSpeaker(this.config.name + " Speaker", "speaker");
    this.tvSpeaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    
    // Volume Control
    this.tvSpeaker.getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));

    this.tvSpeaker.getCharacteristic(Characteristic.Volume)
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));

    // Volume Selector (up/down buttons)
    this.tvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeSelector.bind(this));

    // Link Speaker to TV
    this.tvService.addLinkedService(this.tvSpeaker);

    // Input Sources
    if (this.config.inputs && this.config.inputs.length > 0) {
      this.setupInputSources();
    }

    // Information Service
    this.informationService = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.config.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Philips')
      .setCharacteristic(Characteristic.Model, 'Android TV ' + (this.config.model_year || 2016))
      .setCharacteristic(Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
      .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

    // Add services to accessory
    this.tvAccessory.addService(this.tvService);
    this.tvAccessory.addService(this.tvSpeaker);
    this.tvAccessory.addService(this.informationService);

    // Ambilight Service (separate accessory)
    if (this.config.has_ambilight) {
      this.setupAmbilightService();
    }

    // Publish as external accessory
    this.api.publishExternalAccessories(pluginName, [this.tvAccessory]);

    // Start polling
    if (this.config.poll_status_interval) {
      this.startPolling();
    }

    this.log.info("[PhilipsTV] TV accessory setup complete");
  }

  setupInputSources() {
    this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 0);
    
    this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
      .on('get', this.getActiveIdentifier.bind(this))
      .on('set', this.setActiveIdentifier.bind(this));

    this.config.inputs.forEach((input, index) => {
      const inputSource = new Service.InputSource(input.name, input.name);
      inputSource
        .setCharacteristic(Characteristic.Identifier, index)
        .setCharacteristic(Characteristic.ConfiguredName, input.name)
        .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
        .setCharacteristic(Characteristic.InputSourceType, 
          input.channel ? Characteristic.InputSourceType.TUNER : Characteristic.InputSourceType.APPLICATION)
        .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

      inputSource.getCharacteristic(Characteristic.ConfiguredName)
        .on('set', (name, callback) => {
          callback(null, name);
        });

      this.tvService.addLinkedService(inputSource);
      this.tvAccessory.addService(inputSource);
    });
  }

  setupAmbilightService() {
    // Create separate UUID for ambilight
    const ambilightUuid = this.api.hap.uuid.generate(pluginName + this.config.name + "Ambilight");
    this.ambilightAccessory = new this.api.platformAccessory(this.config.name + " Ambilight", ambilightUuid, Categories.LIGHTBULB);
    
    this.ambilightService = new Service.Lightbulb(this.config.name + " Ambilight", "ambilight");
    this.ambilightService.getCharacteristic(Characteristic.On)
      .on('get', this.getAmbilightState.bind(this))
      .on('set', this.setAmbilightState.bind(this));

    // Brightness control
    this.ambilightService.getCharacteristic(Characteristic.Brightness)
      .on('get', (callback) => callback(null, 100))
      .on('set', (value, callback) => callback(null));

    const ambilightInfo = new Service.AccessoryInformation()
      .setCharacteristic(Characteristic.Name, this.config.name + " Ambilight")
      .setCharacteristic(Characteristic.Manufacturer, 'Philips')
      .setCharacteristic(Characteristic.Model, 'Ambilight')
      .setCharacteristic(Characteristic.SerialNumber, 'Ambilight-' + this.config.name)
      .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

    this.ambilightAccessory.addService(this.ambilightService);
    this.ambilightAccessory.addService(ambilightInfo);

    // Publish ambilight as separate accessory
    this.api.publishExternalAccessories(pluginName, [this.ambilightAccessory]);
  }

  startPolling() {
    const interval = this.config.poll_status_interval * 1000;
    
    setInterval(() => {
      // Check power state
      this.PhilipsTV.getPowerState((err, value) => {
        if (!err && this.on !== value) {
          this.on = value;
          this.tvService.updateCharacteristic(Characteristic.Active, this.on);
        }
      });

      // Check volume state
      this.PhilipsTV.getVolumeState((err, value) => {
        if (!err && this.volume !== value) {
          this.volume = value;
          this.tvSpeaker.updateCharacteristic(Characteristic.Volume, this.volume);
          this.tvSpeaker.updateCharacteristic(Characteristic.Mute, this.volume === 0);
        }
      });

      // Check ambilight state
      if (this.config.has_ambilight && this.ambilightService) {
        this.PhilipsTV.getAmbilightState((err, value) => {
          if (!err) {
            this.ambilightService.updateCharacteristic(Characteristic.On, value);
          }
        });
      }
    }, interval);
  }

  // Power State
  getPowerState(callback) {
    this.PhilipsTV.getPowerState((err, value) => {
      if (!err) this.on = value;
      callback(err, value);
    });
  }

  setPowerState(value, callback) {
    this.on = value;
    this.PhilipsTV.setPowerState(value, callback);
  }

  // Volume State
  getVolumeState(callback) {
    this.PhilipsTV.getVolumeState((err, value) => {
      if (!err) this.volume = value;
      callback(err, value);
    });
  }

  setVolumeState(value, callback) {
    this.volume = value;
    this.PhilipsTV.setVolumeState(value, callback);
  }

  // Mute State
  getMuteState(callback) {
    this.PhilipsTV.getVolumeState((err, volume) => {
      if (err) return callback(err);
      callback(null, volume === 0);
    });
  }

  setMuteState(value, callback) {
    this.PhilipsTV.setMuteState(!value, callback);
  }

  // Volume Selector
  setVolumeSelector(value, callback) {
    if (value === Characteristic.VolumeSelector.INCREMENT) {
      this.PhilipsTV.sendKey("VolumeUp");
    } else if (value === Characteristic.VolumeSelector.DECREMENT) {
      this.PhilipsTV.sendKey("VolumeDown");
    }
    callback(null);
  }

  // Remote Key
  sendRemoteKey(value, callback) {
    const keyMap = {
      [Characteristic.RemoteKey.REWIND]: "Rewind",
      [Characteristic.RemoteKey.FAST_FORWARD]: "FastForward",
      [Characteristic.RemoteKey.NEXT_TRACK]: "Next",
      [Characteristic.RemoteKey.PREVIOUS_TRACK]: "Previous",
      [Characteristic.RemoteKey.ARROW_UP]: "CursorUp",
      [Characteristic.RemoteKey.ARROW_DOWN]: "CursorDown",
      [Characteristic.RemoteKey.ARROW_LEFT]: "CursorLeft",
      [Characteristic.RemoteKey.ARROW_RIGHT]: "CursorRight",
      [Characteristic.RemoteKey.SELECT]: "Confirm",
      [Characteristic.RemoteKey.BACK]: "Back",
      [Characteristic.RemoteKey.EXIT]: "Exit",
      [Characteristic.RemoteKey.PLAY_PAUSE]: "PlayPause",
      [Characteristic.RemoteKey.INFORMATION]: "Info"
    };

    if (keyMap[value]) {
      this.PhilipsTV.sendKey(keyMap[value]);
    }
    callback(null);
  }

  // Active Identifier
  getActiveIdentifier(callback) {
    this.PhilipsTV.getCurrentSource(this.config.inputs).then((source) => {
      callback(null, source);
    }).catch(() => {
      callback(null, 0);
    });
  }

  setActiveIdentifier(value, callback) {
    const input = this.config.inputs[value];
    if (input) {
      this.PhilipsTV.setSource(input, callback);
    } else {
      callback(null);
    }
  }

  // Ambilight State
  getAmbilightState(callback) {
    this.PhilipsTV.getAmbilightState(callback);
  }

  setAmbilightState(value, callback) {
    this.PhilipsTV.setAmbilightState(value, callback);
  }

  identify(callback) {
    this.log.info("[PhilipsTV] Identify requested");
    callback();
  }

  getServices() {
    return []; // External accessory uses publishExternalAccessories
  }
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Categories = homebridge.hap.Categories;
  homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};