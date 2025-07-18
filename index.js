"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV.js");
const pluginName = pkg.name;
const accessoryName = "PhilipsTV";
let Service, Characteristic, Categories;

class PhilipsTvAccessory {
  constructor(log, config) {
    this.log = log;
    this.config = config;
    this.PhilipsTV = new PhilipsTV(config);
    
    this.log.info("[PhilipsTV] Initializing accessory...");
    
    // Services
    this.informationService = null;
    this.tvService = null;
    this.tvSpeaker = null;
    this.ambilightService = null;
    this.volumeService = null;
    
    // Setup services
    this.setupServices();
  }

  setupServices() {
    // Information Service
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, "Philips")
      .setCharacteristic(Characteristic.Model, "Android TV " + (this.config.model_year || 2016))
      .setCharacteristic(Characteristic.SerialNumber, "PhilipsTV-" + this.config.name)
      .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

    // TV Service
    this.tvService = new Service.Television(this.config.name, "television");
    this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.config.name);
    this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    // Power
    this.tvService.getCharacteristic(Characteristic.Active)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    // Remote Control
    this.tvService.getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.sendRemoteKey.bind(this));

    // TV Speaker
    this.tvSpeaker = new Service.TelevisionSpeaker(this.config.name + " Speaker", "speaker");
    this.tvSpeaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    
    this.tvSpeaker.getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));

    this.tvSpeaker.getCharacteristic(Characteristic.Volume)
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));

    this.tvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeSelector.bind(this));

    // Link services
    this.tvService.addLinkedService(this.tvSpeaker);

    // Inputs
    if (this.config.inputs) {
      this.setupInputs();
    }

    // Ambilight
    if (this.config.has_ambilight) {
      this.setupAmbilight();
    }

    // Volume as Fan (optional)
    if (this.config.volume_as_fan) {
      this.setupVolumeFan();
    }
  }

  setupInputs() {
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
          input.channel ? Characteristic.InputSourceType.TUNER : Characteristic.InputSourceType.APPLICATION);

      this.tvService.addLinkedService(inputSource);
    });
  }

  setupAmbilight() {
    this.ambilightService = new Service.Lightbulb(this.config.name + " Ambilight", "ambilight");
    this.ambilightService.getCharacteristic(Characteristic.On)
      .on('get', this.getAmbilightState.bind(this))
      .on('set', this.setAmbilightState.bind(this));
  }

  setupVolumeFan() {
    this.volumeService = new Service.Fan(this.config.name + " Volume", "volume");
    this.volumeService.getCharacteristic(Characteristic.On)
      .on('get', (callback) => callback(null, true))
      .on('set', (value, callback) => callback(null));
    
    this.volumeService.getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));
  }

  // Power State
  getPowerState(callback) {
    this.PhilipsTV.getPowerState(callback);
  }

  setPowerState(value, callback) {
    this.PhilipsTV.setPowerState(value, callback);
  }

  // Volume
  getVolumeState(callback) {
    this.PhilipsTV.getVolumeState(callback);
  }

  setVolumeState(value, callback) {
    this.PhilipsTV.setVolumeState(value, callback);
  }

  // Mute
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
    } else {
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

  // Ambilight
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
    const services = [this.informationService, this.tvService, this.tvSpeaker];
    
    if (this.ambilightService) {
      services.push(this.ambilightService);
    }
    
    if (this.volumeService) {
      services.push(this.volumeService);
    }
    
    return services;
  }
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Categories = homebridge.hap.Categories;
  homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};