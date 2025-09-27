"use strict";
const pkg = require("./package.json");
const PhilipsTV = new PhilipsTV(config);

let Service, Characteristic, Categories;

const pluginName = pkg.name;
const accessoryName = "PhilipsTV";

class PhilipsTvAccessory {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;
        Categories = api.hap.Categories;

        this.on = false;
        this.volume = 0;

        this.inputSources = [];
        this.ambilightModes = ["FOLLOW_VIDEO", "FOLLOW_AUDIO", "Lounge_light"];
        this.activeAmbilightMode = 0;
        this.PhilipsTV = new PhilipsTV(config);

        this.api.on("didFinishLaunching", () => {
            this.publishExternal();
        });
    }

    publishExternal() {
        const uuid = this.api.hap.uuid.generate(this.config.name);
        this.tvAccessory = new this.api.platformAccessory(this.config.name, uuid, Categories.TELEVISION);
        this.tvAccessory.context.isexternal = true;

        this.tvService = new Service.Television(this.config.name);
        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.config.name);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(() => this.PhilipsTV.getPowerState())
            .onSet((v) => this.PhilipsTV.setPowerState(v));

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet((v) => this.PhilipsTV.sendRemoteKey(v));

        this.tvSpeaker = new Service.TelevisionSpeaker(this.config.name + " Speaker");
        this.tvSpeaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        this.tvSpeaker.getCharacteristic(Characteristic.Volume)
            .onGet(() => this.PhilipsTV.getVolumeState())
            .onSet((v) => this.PhilipsTV.setVolumeState(v));
        this.tvSpeaker.getCharacteristic(Characteristic.Mute)
            .onGet(() => this.PhilipsTV.getMuteState())
            .onSet((v) => this.PhilipsTV.setMuteState(v));

        this.tvService.addLinkedService(this.tvSpeaker);

        this.setupInputSources();
        this.setupAmbilightInputs();

        this.informationService = new Service.AccessoryInformation()
            .setCharacteristic(Characteristic.Name, this.config.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Philips')
            .setCharacteristic(Characteristic.Model, 'Android TV')
            .setCharacteristic(Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
            .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

        this.tvAccessory.addService(this.informationService);
        this.tvAccessory.addService(this.tvService);
        this.tvAccessory.addService(this.tvSpeaker);

        this.api.publishExternalAccessories(pluginName, [this.tvAccessory]);
    }

    setupInputSources() {
        if (!this.config.inputs) return;
        this.tvService.setCharacteristic(Characteristic.ActiveIdentifier, 0);
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .onGet(() => 0)
            .onSet(() => {});

        this.config.inputs.forEach((input, index) => {
            const inputSource = new Service.InputSource(input.name, input.name);
            inputSource
                .setCharacteristic(Characteristic.Identifier, index)
                .setCharacteristic(Characteristic.ConfiguredName, input.name)
                .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

            this.tvAccessory.addService(inputSource);
            this.tvService.addLinkedService(inputSource);
        });
        }

    setupAmbilightInputs() {
        const baseId = (this.config.inputs?.length || 0);
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .onSet(async (value) => {
                if (value >= baseId && value < baseId + this.ambilightModes.length) {
                    const mode = this.ambilightModes[value - baseId];
                    await this.PhilipsTV.setAmbilightMode(mode);
                }
            });

        this.ambilightModes.forEach((mode, idx) => {
            const id = baseId + idx;
            const inputSource = new Service.InputSource(mode, "Ambilight " + mode);
            inputSource
                .setCharacteristic(Characteristic.Identifier, id)
                .setCharacteristic(Characteristic.ConfiguredName, "Ambilight " + mode)
                .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI)
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

            this.tvAccessory.addService(inputSource);
            this.tvService.addLinkedService(inputSource);
        });
    }
    getServices() {
        return this.services;
    }
}

module.exports = (homebridge) => {
    homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};
