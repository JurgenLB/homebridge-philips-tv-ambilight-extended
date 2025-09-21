const axios = require("axios");
const wol = require('wake_on_lan');
const pkg = require("./package.json");

class PhilipsTV {
    constructor(config, Service, Characteristic) {
        this.config = config;
        this.Service = Service;
        this.Characteristic = Characteristic;
        
        this.wolURL = config.wol_url;
        this.model_year = config.model_year;
        this.model_year_nr = parseInt(this.model_year);
    
        // CHOOSING API VERSION BY MODEL/YEAR
        switch (this.model_year_nr) {
            case 2016:
                this.api_version = 6;
                break;
            case 2014:
                this.api_version = 5;
                break;
            default:
                this.api_version = 1;
            }
        // CONNECTION SETTINGS
        this.protocol = (this.api_version > 5) ? 'https' : 'http';
        this.portno = (this.api_version > 5) ? '1926' : '1925';
        this.apiUrl = `${this.protocol}://${config.ip_address}:${this.portno}/${this.api_version}/`;
        
        // Configure axios with default settings
        this.httpClient = axios.create({
            timeout: 3000,
            httpsAgent: this.api_version > 5 ? new (require('https').Agent)({
                rejectUnauthorized: false
            }) : undefined,
            auth: {
                username: this.config.username,
                password: this.config.password
            }
        });

        // HomeKit setup properties
        this.ambilightModes = ["FOLLOW_VIDEO", "FOLLOW_AUDIO", "Lounge_light"];
        this.services = [];
    }


    async api(path, body = null) {
        try {
            const config = {
                method: body ? "POST" : "GET",
                url: this.apiUrl + path,
                data: body || undefined,
                headers: body ? { 'Content-Type': 'application/json' } : undefined
            };
            
            const response = await this.httpClient(config);
            return response.data || {};
        } catch (error) {
            if (error.response) {
                // Request made but server responded with error status
                return {};
            }
            throw error;
        }
    }

    async getPowerState() {
        try {
            const res = await this.api("powerstate");
            return res.powerstate === "On";
        } catch {
            return false;
        }
    }

    async setPowerState(value) {
        if (value && this.wolURL?.toUpperCase().startsWith("WOL")) {
            const mac = this.wolURL.replace(/^WOL[:\/]*/i, "");
            wol.wake(mac, () => {});
        }
        await this.api("powerstate", { powerstate: value ? "On" : "Standby" });
    }

    async sendRemoteKey(key) {
        const map = {
            0: "Rewind", 1: "FastForward", 2: "Next", 3: "Previous",
            4: "CursorUp", 5: "CursorDown", 6: "CursorLeft", 7: "CursorRight",
            8: "Confirm", 9: "Back", 10: "Exit", 11: "PlayPause", 15: "Info"
        };
        if (map[key]) await this.api("input/key", { key: map[key] });
    }

    async getVolumeState() {
        try {
            const vol = await this.api("audio/volume");
            return Math.round((vol.current / vol.max) * 100);
        } catch {
            return 50;
        }
    }

    async setVolumeState(value) {
        const vol = await this.api("audio/volume");
        vol.current = Math.round(vol.max * (value / 100));
        await this.api("audio/volume", vol);
    }

    async getMuteState() {
        try {
            const vol = await this.api("audio/volume");
            return vol.muted;
        } catch {
            return false;
        }
    }

    async setMuteState(value) {
        const vol = await this.api("audio/volume");
        vol.muted = value;
        await this.api("audio/volume", vol);
    }

    async setAmbilightMode(mode) {
        await this.api("ambilight/currentconfiguration", {
            styleName: mode,
            isExpert: false,
            menuSetting: "NATURAL"
        });
    }

    getServices() {
        if (this.services.length > 0) {
            return this.services;
        }

        // Initialize all services
        this.createTelevisionService();
        this.createTelevisionSpeakerService();
        this.createAccessoryInformationService();
        this.createInputSourceServices();
        this.createAmbilightInputServices();

        return this.services;
    }

    createTelevisionService() {
        this.tvService = new this.Service.Television(this.config.name);
        this.tvService.setCharacteristic(this.Characteristic.ConfiguredName, this.config.name);
        this.tvService.setCharacteristic(this.Characteristic.SleepDiscoveryMode, this.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

        this.tvService.getCharacteristic(this.Characteristic.Active)
            .onGet(() => this.getPowerState())
            .onSet((v) => this.setPowerState(v));

        this.tvService.getCharacteristic(this.Characteristic.RemoteKey)
            .onSet((v) => this.sendRemoteKey(v));

        this.services.push(this.tvService);
    }

    createTelevisionSpeakerService() {
        this.tvSpeaker = new this.Service.TelevisionSpeaker(this.config.name + " Speaker");
        this.tvSpeaker.setCharacteristic(this.Characteristic.VolumeControlType, this.Characteristic.VolumeControlType.ABSOLUTE);
        
        this.tvSpeaker.getCharacteristic(this.Characteristic.Volume)
            .onGet(() => this.getVolumeState())
            .onSet((v) => this.setVolumeState(v));
        
        this.tvSpeaker.getCharacteristic(this.Characteristic.Mute)
            .onGet(() => this.getMuteState())
            .onSet((v) => this.setMuteState(v));

        this.tvService.addLinkedService(this.tvSpeaker);
        this.services.push(this.tvSpeaker);
    }

    createAccessoryInformationService() {
        this.informationService = new this.Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(this.Characteristic.Name, this.config.name)
            .setCharacteristic(this.Characteristic.Manufacturer, 'Philips')
            .setCharacteristic(this.Characteristic.Model, 'Android TV')
            .setCharacteristic(this.Characteristic.SerialNumber, 'PhilipsTV-' + this.config.name)
            .setCharacteristic(this.Characteristic.FirmwareRevision, pkg.version);

        this.services.push(this.informationService);
    }

    createInputSourceServices() {
        if (!this.config.inputs) return;
        
        this.tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 0);
        this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier)
            .onGet(() => 0)
            .onSet(() => {});

        this.config.inputs.forEach((input, index) => {
            const inputSource = new this.Service.InputSource(input.name, `input-${index}`);
            inputSource
                .setCharacteristic(this.Characteristic.Identifier, index)
                .setCharacteristic(this.Characteristic.ConfiguredName, input.name)
                .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.APPLICATION)
                .setCharacteristic(this.Characteristic.CurrentVisibilityState, this.Characteristic.CurrentVisibilityState.SHOWN);

            this.tvService.addLinkedService(inputSource);
            this.services.push(inputSource);
        });
    }

    createAmbilightInputServices() {
        const baseId = (this.config.inputs?.length || 0);
        
        this.tvService.getCharacteristic(this.Characteristic.ActiveIdentifier)
            .onSet(async (value) => {
                if (value >= baseId && value < baseId + this.ambilightModes.length) {
                    const mode = this.ambilightModes[value - baseId];
                    await this.setAmbilightMode(mode);
                }
            });

        this.ambilightModes.forEach((mode, idx) => {
            const id = baseId + idx;
            const inputSource = new this.Service.InputSource(mode, `ambilight-${idx}`);
            inputSource
                .setCharacteristic(this.Characteristic.Identifier, id)
                .setCharacteristic(this.Characteristic.ConfiguredName, "Ambilight " + mode)
                .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI)
                .setCharacteristic(this.Characteristic.CurrentVisibilityState, this.Characteristic.CurrentVisibilityState.SHOWN);

            this.tvService.addLinkedService(inputSource);
            this.services.push(inputSource);
        });
    }
}

module.exports = PhilipsTV;
