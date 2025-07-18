"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV.js");
const pluginName = pkg.name;
const accessoryName = "PhilipsTV";
let Service, Characteristic, Categories;

class PhilipsTvAccessory {
  state = {
    power: true,
    ambilight: true,
    source: 0,
    volume: 0,
  };

  config = {};
  services = [];
  tvService = null;
  tvAccessory = null;

  constructor(log, config, api) {
    console.log("[PhilipsTV] Constructor called");
    this.log = log;
    this.config = { ...this.config, ...config };
    this.PhilipsTV = new PhilipsTV(config);

    // API kontrolü
    if (!api) {
      this.log.error("API parameter is missing!");
      return;
    }
    
    this.api = api;

    // Homebridge hazır olduğunda setup yap
    if (api.version < 2.1) {
      throw new Error("Homebridge version (" + api.version + ") not supported");
    }

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      this.setupTVAccessory();
    });
  }

  setupTVAccessory() {
    const uuid = this.api.hap.uuid.generate(pluginName + this.config.name);
    this.tvAccessory = new this.api.platformAccessory(
    
    this.registerAccessoryInformationService();
    this.registerTelevisionService();
    this.registerVolumeService();

    if (config.has_ambilight) {
      this.registerAmbilightService();
    }
    if (config.inputs) {
      this.registerInputService();
    }

    // External accessory olarak publish et
    this.api.publishExternalAccessories(pluginName, [this.tvAccessory]);
  }

  identify(callback) {
    callback(); // success
  }

  registerAccessoryInformationService = () => {
    const { name, model_year } = this.config;
    const { Name, Manufacturer, Model, FirmwareRevision } = Characteristic;

    // AccessoryInformation service'i zaten mevcut, sadece güncelle
    const infoService = this.tvAccessory.getService(Service.AccessoryInformation);
    if (infoService) {
      infoService
        .setCharacteristic(Name, name)
        .setCharacteristic(Manufacturer, "Philips")
        .setCharacteristic(Model, "Year " + model_year)
        .setCharacteristic(FirmwareRevision, pkg.version);
    }
  };

  registerTelevisionService = () => {
    const { name, poll_status_interval } = this.config;
    const { ConfiguredName, SleepDiscoveryMode, Active } = Characteristic;
    
    // TV Service oluştur
    this.tvService = new Service.Television(name, name);
    const power = this.tvService.getCharacteristic(Active);

    this.tvService.setCharacteristic(ConfiguredName, name);
    this.tvService.setCharacteristic(
      SleepDiscoveryMode,
      SleepDiscoveryMode.ALWAYS_DISCOVERABLE
    );

    power.on("get", this.PhilipsTV.getPowerState);
    power.on("set", (value, callback) => {
      this.state.power = value;
      this.PhilipsTV.setPowerState(value, callback);
    });

    this.tvService
      .getCharacteristic(Characteristic.RemoteKey)
      .on("set", (value, callback) => {
        switch (value) {
          case Characteristic.RemoteKey.PLAY_PAUSE:
            this.PhilipsTV.sendKey("PlayPause");
            break;
          case Characteristic.RemoteKey.BACK:
            this.PhilipsTV.sendKey("Back");
            break;
          case Characteristic.RemoteKey.ARROW_UP:
            this.PhilipsTV.sendKey("CursorUp");
            break;
          case Characteristic.RemoteKey.ARROW_DOWN:
            this.PhilipsTV.sendKey("CursorDown");
            break;
          case Characteristic.RemoteKey.ARROW_LEFT:
            this.PhilipsTV.sendKey("CursorLeft");
            break;
          case Characteristic.RemoteKey.ARROW_RIGHT:
            this.PhilipsTV.sendKey("CursorRight");
            break;
          case Characteristic.RemoteKey.SELECT:
            this.PhilipsTV.sendKey("Confirm");
            break;
          case Characteristic.RemoteKey.EXIT:
            this.PhilipsTV.sendKey("Exit");
            break;
          case Characteristic.RemoteKey.INFORMATION:
            this.PhilipsTV.sendKey("Info");
            break;
        }
        callback(null);
      });

    // TV Speaker Service ekle
    this.tvSpeaker = new Service.TelevisionSpeaker(name + " Speaker", "speaker");
    
    this.tvSpeaker.getCharacteristic(Characteristic.Mute)
      .on("get", (callback) => {
        this.PhilipsTV.getVolumeState((err, value) => {
          callback(err, value === 0);
        });
      })
      .on("set", (value, callback) => {
        this.PhilipsTV.setMuteState(value, callback);
      });

    this.tvSpeaker.getCharacteristic(Characteristic.Volume)
      .on("get", this.PhilipsTV.getVolumeState)
      .on("set", (value, callback) => {
        this.state.volume = value;
        this.PhilipsTV.setVolumeState(value, callback);
      });

    this.tvSpeaker.setCharacteristic(
      Characteristic.VolumeControlType,
      Characteristic.VolumeControlType.ABSOLUTE
    );

    this.tvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
      .on("set", (value, callback) => {
        if (value === Characteristic.VolumeSelector.INCREMENT) {
          this.PhilipsTV.sendKey("VolumeUp");
        } else if (value === Characteristic.VolumeSelector.DECREMENT) {
          this.PhilipsTV.sendKey("VolumeDown");
        }
        callback(null);
      });

    // Speaker'ı TV'ye bağla
    this.tvService.addLinkedService(this.tvSpeaker);

    if (poll_status_interval) {
      setInterval(() => {
        this.PhilipsTV.getPowerState((err, value) => {
          if (this.state.power !== value) {
            this.state.power = value;
            power.updateValue(value);
          }
        });
      }, poll_status_interval * 1000);
    }

    // TV Service'i accessory'e ekle
    this.tvAccessory.addService(this.tvService);
    this.tvAccessory.addService(this.tvSpeaker);
  };

  registerInputService = () => {
    const { inputs } = this.config;
    const { ActiveIdentifier } = Characteristic;

    this.tvService.setCharacteristic(ActiveIdentifier, 1);
    this.tvService
      .getCharacteristic(ActiveIdentifier)
      .on("get", (callback) => {
        this.PhilipsTV.getCurrentSource(inputs).then((source) => {
          this.state.source = source;
          callback(null, this.state.source);
        });
      })
      .on("set", (value, callback) => {
        this.state.source = value;
        const input = inputs[value];
        this.PhilipsTV.setSource(input, callback);
      });

    inputs.forEach((item, index) => {
      const input = this.createInputSource(item.name, item.name, index);
      this.tvService.addLinkedService(input);
      this.tvAccessory.addService(input);
    });
  };

  registerAmbilightService = () => {
    const { name, poll_status_interval } = this.config;

    // Ambilight'ı ayrı bir accessory olarak değil, TV'nin bir özelliği olarak ekleyelim
    // Bunu yapmak için ConfiguredName kullanabiliriz veya InputSource olarak ekleyebiliriz
    
    // Ambilight Input Source olarak ekle
    const ambilightInput = this.createInputSource(
      "Ambilight", 
      "Ambilight", 
      999, // Yüksek bir numara ver ki diğer inputlarla karışmasın
      Characteristic.InputSourceType.OTHER
    );
    
    this.tvService.addLinkedService(ambilightInput);
    this.tvAccessory.addService(ambilightInput);

    // Ayrıca gerçek ambilight kontrolü için ayrı lightbulb service'i de ekleyelim
    this.ambilightService = new Service.Lightbulb(
      name + " Ambilight",
      "tvAmbilight"
    );
    const ambilightPower = this.ambilightService.getCharacteristic(
      Characteristic.On
    );
    ambilightPower
      .on("get", this.PhilipsTV.getAmbilightState)
      .on("set", (value, callback) => {
        this.state.ambilight = value;
        this.PhilipsTV.setAmbilightState(value, callback);
      });
    
    // Brightness kontrolü ekle
    this.ambilightService.getCharacteristic(Characteristic.Brightness)
      .on("get", (callback) => {
        // Ambilight brightness API'si varsa buraya ekle
        callback(null, 100);
      })
      .on("set", (value, callback) => {
        // Ambilight brightness API'si varsa buraya ekle
        callback(null);
      });
    
    this.tvAccessory.addService(this.ambilightService);

    if (poll_status_interval) {
      setInterval(() => {
        this.PhilipsTV.getAmbilightState((err, value) => {
          if (this.state.ambilight !== value) {
            this.state.ambilight = value;
            ambilightPower.updateValue(value);
          }
        });
      }, poll_status_interval * 1000);
    }
  };

  registerVolumeService = () => {
    // Volume artık TV Speaker servisi üzerinden kontrol ediliyor
    // Ayrı bir volume service'i eklemeye gerek yok
    const { poll_status_interval } = this.config;
    
    if (poll_status_interval) {
      setInterval(() => {
        this.PhilipsTV.getVolumeState((err, value) => {
          if (this.state.volume !== value) {
            this.state.volume = value;
            if (this.tvSpeaker) {
              this.tvSpeaker.updateCharacteristic(Characteristic.Volume, value);
              this.tvSpeaker.updateCharacteristic(Characteristic.Mute, value === 0);
            }
          }
        });
      }, poll_status_interval * 1000);
    }
  };

  createInputSource(
    id,
    name,
    number,
    type = Characteristic.InputSourceType.TV
  ) {
    const { Identifier, ConfiguredName, IsConfigured, InputSourceType } =
      Characteristic;
    const input = new Service.InputSource(id, name);
    input
      .setCharacteristic(Identifier, number)
      .setCharacteristic(ConfiguredName, name)
      .setCharacteristic(IsConfigured, IsConfigured.CONFIGURED)
      .setCharacteristic(InputSourceType, type);
    return input;
  }

  getServices() {
    return []; // External accessory kullandığımız için boş array
  }
}

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Categories = homebridge.hap.Categories;
  homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};