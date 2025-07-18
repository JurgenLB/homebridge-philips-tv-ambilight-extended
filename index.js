"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV.js");

let Service, Characteristic, Categories, PlatformAccessory;
const pluginName = pkg.name;
const accessoryName = "PhilipsTV";

class PhilipsTvAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.PhilipsTV = new PhilipsTV(config);

        Service = this.api.hap.Service;
        Characteristic = this.api.hap.Characteristic;
        Categories = this.api.hap.Categories;
        PlatformAccessory = this.api.platformAccessory;

        this.log.info("[PhilipsTV] Initializing TV accessory...");

        this.on = false;
        this.volume = 0;
        this.inputSources = [];

        this.setupTVAccessory();
    }

    setupTVAccessory() {
        this.tvAccessory = new PlatformAccessory(this.config.name, this.api.hap.uuid.generate(this.config.name));

        this.tvService = this.tvAccessory.addService(Service.Television, this.config.name);
        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.config.name);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(this.getPowerState.bind(this))
            .onSet(this.setPowerState.bind(this));

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(this.sendRemoteKey.bind(this));

        this.tvSpeaker = this.tvAccessory.addService(Service.TelevisionSpeaker, this.config.name + " Speaker");
        this.tvSpeaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

        this.tvSpeaker.getCharacteristic(Characteristic.Mute)
            .onGet(this.getMuteState.bind(this))
            .onSet(this.setMuteState.bind(this));

        this.tvSpeaker.getCharacteristic(Characteristic.Volume)
            .onGet(this.getVolumeState.bind(this))
            .onSet(this.setVolumeState.bind(this));

        this.tvSpeaker.getCharacteristic(Characteristic.VolumeSelector)
            .onSet(this.setVolumeSelector.bind(this));

        this.tvService.addLinkedService(this.tvSpeaker);

        this.setupInputSources();

        this.informationService = this.tvAccessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, this.config.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Philips')
            .setCharacteristic(Characteristic.Model, 'Android TV ' + (this.config.model_year || 2016))
            .setCharacteristic(Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
            .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

        if (this.config.poll_status_interval) {
            this.startPolling();
        }
    }

    setupInputSources() {
        if (!this.config.inputs || this.config.inputs.length === 0) {
            return;
        }

        this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 0);

        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .onGet(this.getActiveIdentifier.bind(this))
            .onSet(this.setActiveIdentifier.bind(this));

        this.config.inputs.forEach((input, index) => {
            const inputSource = this.tvAccessory.addService(Service.InputSource, input.name);
            inputSource
                .setCharacteristic(Characteristic.Identifier, index)
                .setCharacteristic(Characteristic.ConfiguredName, input.name)
                .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(Characteristic.InputSourceType,
                    input.channel ? Characteristic.InputSourceType.TUNER : Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

            this.inputSources.push(inputSource);
            this.tvService.addLinkedService(inputSource);
        });
    }

    startPolling() {
        const interval = this.config.poll_status_interval * 1000;
        setInterval(() => {
            this.PhilipsTV.getPowerState((err, value) => {
                if (!err && this.on !== value) {
                    this.on = value;
                    this.tvService.updateCharacteristic(Characteristic.Active, this.on);
                }
            });

            this.PhilipsTV.getVolumeState((err, value) => {
                if (!err && this.volume !== value) {
                    this.volume = value;
                    this.tvSpeaker.updateCharacteristic(Characteristic.Volume, this.volume);
                    this.tvSpeaker.updateCharacteristic(Characteristic.Mute, this.volume === 0);
                }
            });
        }, interval);
    }

    async getPowerState() {
        return new Promise((resolve) => {
            this.PhilipsTV.getPowerState((err, value) => resolve(value));
        });
    }

    setPowerState(value) {
        this.on = value;
        return new Promise((resolve) => {
            this.PhilipsTV.setPowerState(value, resolve);
        });
    }

    async getVolumeState() {
        return new Promise((resolve) => {
            this.PhilipsTV.getVolumeState((err, value) => resolve(value));
        });
    }

    setVolumeState(value) {
        this.volume = value;
        return new Promise((resolve) => {
            this.PhilipsTV.setVolumeState(value, resolve);
        });
    }

    async getMuteState() {
        return new Promise((resolve) => {
            this.PhilipsTV.getVolumeState((err, volume) => resolve(volume === 0));
        });
    }

    setMuteState(value) {
        return new Promise((resolve) => {
            this.PhilipsTV.setMuteState(!value, resolve);
        });
    }

    setVolumeSelector(value) {
        if (value === Characteristic.VolumeSelector.INCREMENT) {
            this.PhilipsTV.sendKey("VolumeUp");
        } else if (value === Characteristic.VolumeSelector.DECREMENT) {
            this.PhilipsTV.sendKey("VolumeDown");
        }
        return Promise.resolve();
    }

    setActiveIdentifier(value) {
        const input = this.config.inputs[value];
        if (input) {
            return new Promise((resolve) => {
                this.PhilipsTV.setSource(input, resolve);
            });
        }
        return Promise.resolve();
    }

    async getActiveIdentifier() {
        try {
            const source = await this.PhilipsTV.getCurrentSource(this.config.inputs);
            return source;
        } catch {
            return 0;
        }
    }

    sendRemoteKey(value) {
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
        return Promise.resolve();
    }

    identify() {
        this.log.info("[PhilipsTV] Identify requested");
    }

    getServices() {
        return [
            this.informationService,
            this.tvService,
            this.tvSpeaker,
            ...this.inputSources
        ];
    }
}

module.exports = (homebridge) => {
    homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};
