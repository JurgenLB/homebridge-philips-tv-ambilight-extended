"use strict";
const pkg = require("./package.json");
const PhilipsTV = require("./PhilipsTV");

let Service, Characteristic, Categories, UUIDGen;

const pluginName = pkg.name;
const platformName = "PhilipsAndroidTV";

class PhilipsAndroidTVPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        Service = api.hap.Service;
        Characteristic = api.hap.Characteristic;
        Categories = api.hap.Categories;
        UUIDGen = api.hap.uuid;

        this.accessories = [];
        this.tvs = [];

        if (!config || !config.tvs || !Array.isArray(config.tvs)) {
            this.log.error('No TVs configured. Please add TVs to your configuration.');
            return;
        }

        this.api.on('didFinishLaunching', () => {
            this.log.info('Finished launching, setting up TVs...');
            this.setupTVs();
        });
    }

    configureAccessory(accessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    setupTVs() {
        for (const tvConfig of this.config.tvs) {
            this.setupTV(tvConfig);
        }
    }

    setupTV(tvConfig) {
        const uuid = UUIDGen.generate(tvConfig.name);
        let tvAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (!tvAccessory) {
            this.log.info('Creating new TV accessory:', tvConfig.name);
            tvAccessory = new this.api.platformAccessory(tvConfig.name, uuid, Categories.TELEVISION);
            this.api.registerPlatformAccessories(pluginName, platformName, [tvAccessory]);
            this.accessories.push(tvAccessory);
        }

        // Create TV instance
        const tv = new PhilipsTVAccessory(this.log, tvConfig, this.api, tvAccessory);
        this.tvs.push(tv);
    }
}

class PhilipsTVAccessory {
    constructor(log, config, api, accessory) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.accessory = accessory;

        this.PhilipsTV = new PhilipsTV({
            ip_address: config.ip,
            username: config.apiUser,
            password: config.apiPass,
            model_year: 2016, // Default for API v6
            wol_url: config.mac ? `WOL://${config.mac}` : undefined
        });

        this.setupServices();
    }

    setupServices() {
        // TV Service
        this.tvService = this.accessory.getService(Service.Television) || 
                        this.accessory.addService(Service.Television, this.config.name);
        
        this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.config.name);
        this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(Characteristic.Active)
            .onGet(async () => {
                try {
                    return await this.PhilipsTV.getPowerState();
                } catch (error) {
                    this.log.warn('getPowerState error:', error.message);
                    return false;
                }
            })
            .onSet(async (value) => {
                try {
                    await this.PhilipsTV.setPowerState(value);
                } catch (error) {
                    this.log.warn('setPowerState error:', error.message);
                }
            });

        this.tvService.getCharacteristic(Characteristic.RemoteKey)
            .onSet(async (value) => {
                try {
                    await this.PhilipsTV.sendRemoteKey(value);
                } catch (error) {
                    this.log.warn('sendRemoteKey error:', error.message);
                }
            });

        // TV Speaker Service
        this.tvSpeaker = this.accessory.getService(Service.TelevisionSpeaker) || 
                        this.accessory.addService(Service.TelevisionSpeaker, this.config.name + " Speaker");
        
        this.tvSpeaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        
        this.tvSpeaker.getCharacteristic(Characteristic.Volume)
            .onGet(async () => {
                try {
                    return await this.PhilipsTV.getVolumeState();
                } catch (error) {
                    this.log.warn('getVolumeState error:', error.message);
                    return 50;
                }
            })
            .onSet(async (value) => {
                try {
                    await this.PhilipsTV.setVolumeState(value);
                } catch (error) {
                    this.log.warn('setVolumeState error:', error.message);
                }
            });

        this.tvSpeaker.getCharacteristic(Characteristic.Mute)
            .onGet(async () => {
                try {
                    return await this.PhilipsTV.getMuteState();
                } catch (error) {
                    this.log.warn('getMuteState error:', error.message);
                    return false;
                }
            })
            .onSet(async (value) => {
                try {
                    await this.PhilipsTV.setMuteState(value);
                } catch (error) {
                    this.log.warn('setMuteState error:', error.message);
                }
            });

        this.tvService.addLinkedService(this.tvSpeaker);

        // Setup Input Sources
        this.setupInputSources();

        // Information Service
        const informationService = this.accessory.getService(Service.AccessoryInformation) ||
                                  this.accessory.addService(Service.AccessoryInformation);
        
        informationService
            .setCharacteristic(Characteristic.Name, this.config.name)
            .setCharacteristic(Characteristic.Manufacturer, 'Philips')
            .setCharacteristic(Characteristic.Model, 'Android TV')
            .setCharacteristic(Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
            .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);
    }

    setupInputSources() {
        // Don't clear existing inputs - just update them
        const inputs = [];

        // Add TV input
        inputs.push({ name: "TV", type: "tv" });

        // Add apps
        if (this.config.apps && Array.isArray(this.config.apps)) {
            this.config.apps.forEach(app => {
                inputs.push({ name: app, type: "app" });
            });
        }

        // Add channels
        if (this.config.channels) {
            if (this.config.channels.includeAll) {
                // Would need to fetch channels from TV API
                this.log.info('Include all channels not implemented yet');
            } else if (this.config.channels.channels && Array.isArray(this.config.channels.channels)) {
                this.config.channels.channels.forEach(channel => {
                    inputs.push({ name: channel, type: "channel" });
                });
            }
        }

        // Add Ambilight inputs if enabled
        if (this.config.has_ambilight) {
            const ambilightModes = ["Follow Video", "Follow Audio", "Lounge Light"];
            ambilightModes.forEach(mode => {
                inputs.push({ name: "Ambilight " + mode, type: "ambilight", mode: mode });
            });
        }

        // Create or update input sources
        inputs.forEach((input, index) => {
            const subtype = `input-${index}`;
            let inputSource = this.accessory.getServiceById(Service.InputSource, subtype);
            
            if (!inputSource) {
                inputSource = this.accessory.addService(Service.InputSource, input.name, subtype);
                this.tvService.addLinkedService(inputSource);
            }
            
            inputSource
                .setCharacteristic(Characteristic.Identifier, index)
                .setCharacteristic(Characteristic.ConfiguredName, input.name)
                .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(Characteristic.InputSourceType, this.getInputSourceType(input.type))
                .setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);
        });

        // Store inputs for later use
        this.inputs = inputs;

        // Set up active identifier handling
        this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
            .onGet(async () => {
                return 0; // Default to first input
            })
            .onSet(async (value) => {
                try {
                    const input = this.inputs[value];
                    if (!input) return;

                    switch (input.type) {
                        case "app":
                            await this.PhilipsTV.launchApp(this.getAppPackage(input.name));
                            break;
                        case "channel":
                            await this.PhilipsTV.setChannel(input.name);
                            break;
                        case "ambilight":
                            await this.PhilipsTV.setAmbilightMode(input.mode);
                            break;
                        case "tv":
                        default:
                            // Switch to TV mode
                            break;
                    }
                } catch (error) {
                    this.log.warn('setActiveInput error:', error.message);
                }
            });
    }

    getInputSourceType(type) {
        switch (type) {
            case "app":
                return Characteristic.InputSourceType.APPLICATION;
            case "channel":
            case "tv":
                return Characteristic.InputSourceType.TUNER;
            case "ambilight":
                return Characteristic.InputSourceType.OTHER;
            default:
                return Characteristic.InputSourceType.OTHER;
        }
    }

    getAppPackage(appName) {
        const appPackages = {
            "Netflix": "com.netflix.ninja",
            "YouTube": "com.google.android.youtube.tv",
            "Amazon Prime": "com.amazon.avod.thirdpartyclient",
            "Disney+": "com.disney.disneyplus",
            "Spotify": "com.spotify.tv.android",
            "Plex": "com.plexapp.android",
            "Kodi": "org.xbmc.kodi",
            "VLC": "org.videolan.vlc"
        };
        return appPackages[appName] || appName;
    }
}

module.exports = (homebridge) => {
    homebridge.registerPlatform(pluginName, platformName, PhilipsAndroidTVPlatform);
};
