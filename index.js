"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV");

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

        this.PhilipsTV = new PhilipsTV(config, Service, Characteristic);

        this.api.on("didFinishLaunching", () => {
            this.publishExternal();
        });
    }

    getServices() {
        return this.PhilipsTV.getServices();
    }

    publishExternal() {
        const uuid = this.api.hap.uuid.generate(this.config.name);
        this.tvAccessory = new this.api.platformAccessory(this.config.name, uuid, Categories.TELEVISION);
        this.tvAccessory.context.isexternal = true;

        // Configure the automatically created AccessoryInformation service
        const accessoryInfo = this.tvAccessory.getService(this.api.hap.Service.AccessoryInformation);
        if (accessoryInfo) {
            accessoryInfo
                .setCharacteristic(this.api.hap.Characteristic.Name, this.config.name)
                .setCharacteristic(this.api.hap.Characteristic.Manufacturer, 'Philips')
                .setCharacteristic(this.api.hap.Characteristic.Model, 'Android TV')
                .setCharacteristic(this.api.hap.Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
                .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, pkg.version);
        }

        // Get all services from PhilipsTV
        const services = this.PhilipsTV.getServices();
        
        // Add all services to the accessory
        services.forEach(service => {
            this.tvAccessory.addService(service);
        });

        this.api.publishExternalAccessories(pluginName, [this.tvAccessory]);
    }
}

module.exports = (homebridge) => {
    homebridge.registerAccessory(pluginName, accessoryName, PhilipsTvAccessory);
};
